import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailOtpService } from './email-otp.service';
import { EmailOtpVerifyFailure } from './interfaces/email-otp.interface';

const USER_ID = 'user-1';

function buildPrismaMock() {
  return {
    emailOtp: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
    },
  };
}

async function createService(overrides: Record<string, string> = {}) {
  const prisma = buildPrismaMock();
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => overrides[key] ?? defaultValue),
  } as unknown as ConfigService;

  const moduleRef = await Test.createTestingModule({
    providers: [
      EmailOtpService,
      { provide: ConfigService, useValue: configService },
      { provide: require('../prisma/prisma.service').PrismaService, useValue: prisma },
    ],
  }).compile();

  return { service: moduleRef.get(EmailOtpService), prisma };
}

describe('EmailOtpService', () => {
  describe('generateCode', () => {
    it('gera código com o tamanho configurado', async () => {
      const { service } = await createService();
      const code = service.generateCode();

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('respeita EMAIL_OTP_LENGTH', async () => {
      const { service } = await createService({ EMAIL_OTP_LENGTH: '8' });
      expect(service.generateCode()).toHaveLength(8);
    });

    it('gera códigos aleatórios', async () => {
      const { service } = await createService();
      const codes = new Set(Array.from({ length: 100 }, () => service.generateCode()));
      expect(codes.size).toBeGreaterThan(90);
    });
  });

  describe('create', () => {
    it('invalida o OTP anterior antes de criar um novo', async () => {
      const { service, prisma } = await createService();
      prisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const result = await service.create(USER_ID);

      expect(prisma.emailOtp.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailOtp.create).toHaveBeenCalledTimes(1);
      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.codeHash).not.toBe(result.code);
    });

    it('nunca persiste o código em texto puro', async () => {
      const { service, prisma } = await createService();
      prisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const result = await service.create(USER_ID);
      const persisted = prisma.emailOtp.create.mock.calls[0][0].data;

      expect(persisted.codeHash).not.toBe(result.code);
      expect(persisted.codeHash.startsWith('$2')).toBe(true);
    });

    it('define expiração conforme EMAIL_OTP_EXPIRES_MINUTES', async () => {
      const { service, prisma } = await createService({ EMAIL_OTP_EXPIRES_MINUTES: '2' });
      prisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const before = Date.now();
      const result = await service.create(USER_ID);
      const delta = result.expiresAt.getTime() - before;

      expect(delta).toBeGreaterThan(2 * 60 * 1000 - 5000);
      expect(delta).toBeLessThanOrEqual(2 * 60 * 1000 + 5000);
    });
  });

  describe('verify', () => {
    it('retorna NOT_FOUND quando não há OTP ativo', async () => {
      const { service, prisma } = await createService();
      prisma.emailOtp.findFirst.mockResolvedValue(null);

      const result = await service.verify(USER_ID, '123456');

      expect(result).toEqual({ success: false, reason: EmailOtpVerifyFailure.NOT_FOUND });
    });

    it('retorna EXPIRED quando o OTP passou do prazo', async () => {
      const { service, prisma } = await createService();
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        attempts: 0,
      });

      const result = await service.verify(USER_ID, '123456');

      expect(result).toEqual({ success: false, reason: EmailOtpVerifyFailure.EXPIRED });
    });

    it('retorna MAX_ATTEMPTS_EXCEEDED ao atingir o limite', async () => {
      const { service, prisma } = await createService({ EMAIL_OTP_MAX_ATTEMPTS: '3' });
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 3,
      });

      const result = await service.verify(USER_ID, '123456');

      expect(result).toEqual({ success: false, reason: EmailOtpVerifyFailure.MAX_ATTEMPTS_EXCEEDED });
    });

    it('incrementa attempts quando o código é inválido', async () => {
      const { service, prisma } = await createService();
      const hashService = await createService();
      const codeHash = await hashService.service.hashCode('111111');
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
      });

      const result = await service.verify(USER_ID, '222222');

      expect(result).toEqual({ success: false, reason: EmailOtpVerifyFailure.INVALID_CODE });
      expect(prisma.emailOtp.updateMany).toHaveBeenCalledWith({
        where: { id: 'otp-1', usedAt: null },
        data: { attempts: { increment: 1 } },
      });
    });

    it('consome o OTP quando o código é correto', async () => {
      const { service, prisma } = await createService();
      const hashService = await createService();
      const codeHash = await hashService.service.hashCode('483921');
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
      });

      const result = await service.verify(USER_ID, '483921');

      expect(result).toEqual({ success: true, otpId: 'otp-1' });
      expect(prisma.emailOtp.updateMany).toHaveBeenCalledWith({
        where: { id: 'otp-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('retorna ALREADY_USED quando o consumo atômico falha (uso concorrente)', async () => {
      const { service, prisma } = await createService();
      const hashService = await createService();
      const codeHash = await hashService.service.hashCode('483921');
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
      });
      prisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.verify(USER_ID, '483921');

      expect(result).toEqual({ success: false, reason: EmailOtpVerifyFailure.ALREADY_USED });
    });

    it('bloqueia o código após o limite de tentativas', async () => {
      const { service, prisma } = await createService({ EMAIL_OTP_MAX_ATTEMPTS: '2' });
      const hashService = await createService();
      const codeHash = await hashService.service.hashCode('111111');
      const otp = {
        id: 'otp-1',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        attempts: 0,
      };

      prisma.emailOtp.findFirst.mockResolvedValue(otp);
      expect(await service.verify(USER_ID, '222222')).toEqual({
        success: false,
        reason: EmailOtpVerifyFailure.INVALID_CODE,
      });

      prisma.emailOtp.findFirst.mockResolvedValue({ ...otp, attempts: 2 });
      expect(await service.verify(USER_ID, '222222')).toEqual({
        success: false,
        reason: EmailOtpVerifyFailure.MAX_ATTEMPTS_EXCEEDED,
      });
    });
  });

  describe('invalidateAll', () => {
    it('remove todos os OTPs do usuário', async () => {
      const { service, prisma } = await createService();
      await service.invalidateAll(USER_ID);

      expect(prisma.emailOtp.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });
  });
});