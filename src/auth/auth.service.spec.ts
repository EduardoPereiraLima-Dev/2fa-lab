import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MfaService } from '../mfa/mfa.service';
import { RecoveryCodesService } from '../recovery-codes/recovery-codes.service';
import { EmailOtpService } from '../email-otp/email-otp.service';
import { EmailService } from '../email-otp/email.service';
import { EmailOtpVerifyFailure, MfaMethod } from '../email-otp/interfaces/email-otp.interface';

const MFA_SECRET = 'jwt_mfa_secret';
const ACCESS_SECRET = 'jwt_access_secret';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@2fa.local',
    passwordHash: 'hash',
    mfaEnabled: false,
    mfaSecret: null,
    mfaVerifiedAt: null,
    emailOtpEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

async function createAuthService(user: User) {
  const usersService = {
    findById: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn().mockResolvedValue(user),
    validateCredentials: jest.fn().mockResolvedValue(user),
    validatePassword: jest.fn().mockResolvedValue(true),
    create: jest.fn(),
    updateMfaSecret: jest.fn(),
    disableMfa: jest.fn(),
    setEmailOtpEnabled: jest.fn(),
    hasAnyMfaMethod: jest.fn((u: any) => u.mfaEnabled || u.emailOtpEnabled),
    availableMfaMethods: jest.fn((u: any) => {
      const methods: MfaMethod[] = [];
      if (u.mfaEnabled) methods.push(MfaMethod.TOTP);
      if (u.emailOtpEnabled) methods.push(MfaMethod.EMAIL);
      return methods;
    }),
  };

  const mfaService = {
    setup: jest.fn(),
    decryptSecret: jest.fn().mockResolvedValue('plain-secret'),
    verifyToken: jest.fn().mockReturnValue(true),
  };

  const recoveryCodesService = {
    createForUser: jest.fn().mockResolvedValue(['A1B2-C3D4']),
    validateCode: jest.fn(),
    markAsUsed: jest.fn(),
    invalidateAllForUser: jest.fn(),
  };

  const emailOtpService = {
    create: jest.fn().mockResolvedValue({ id: 'otp-1', code: '483921' }),
    verify: jest.fn().mockResolvedValue({ success: true, otpId: 'otp-1' }),
    getConfig: jest.fn().mockReturnValue({ length: 6, expiresInMinutes: 5, maxAttempts: 5 }),
    invalidateAll: jest.fn(),
  };

  const emailService = {
    sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  };

  const jwtService = {
    sign: jest.fn((payload: any, options: any) => `${options.secret}:${JSON.stringify(payload)}`),
    verify: jest.fn((token: string, options: any) => {
      const separator = token.indexOf(':');
      if (separator === -1) throw new Error('malformed token');
      const signer = token.slice(0, separator);
      if (options.secret !== signer) throw new Error('invalid signature');
      return JSON.parse(token.slice(separator + 1));
    }),
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_MFA_SECRET: MFA_SECRET,
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_MFA_EXPIRES_IN: '5m',
      };
      return map[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useValue: usersService },
      { provide: MfaService, useValue: mfaService },
      { provide: RecoveryCodesService, useValue: recoveryCodesService },
      { provide: EmailOtpService, useValue: emailOtpService },
      { provide: EmailService, useValue: emailService },
      { provide: JwtService, useValue: jwtService },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile();

  return {
    service: moduleRef.get(AuthService),
    usersService,
    mfaService,
    recoveryCodesService,
    emailOtpService,
    emailService,
    jwtService,
  };
}

const loginDto = { email: 'user@2fa.local', password: 'Senha@123' };

function mfaTokenFor(user: User) {
  return `${MFA_SECRET}:${JSON.stringify({ sub: user.id, email: user.email, mfa: true })}`;
}

describe('AuthService', () => {
  describe('login', () => {
    it('retorna access token quando não há MFA', async () => {
      const { service } = await createAuthService(buildUser());
      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('requiresMfa');
    });

    it('retorna availableMethods com totp apenas', async () => {
      const { service } = await createAuthService(buildUser({ mfaEnabled: true, mfaSecret: 'enc' }));
      const result = await service.login(loginDto);

      expect(result).toEqual({
        requiresMfa: true,
        mfaToken: expect.any(String),
        availableMethods: [MfaMethod.TOTP],
      });
    });

    it('retorna availableMethods com email apenas', async () => {
      const { service } = await createAuthService(buildUser({ emailOtpEnabled: true }));
      const result: any = await service.login(loginDto);

      expect(result.availableMethods).toEqual([MfaMethod.EMAIL]);
    });

    it('retorna os dois métodos quando ambos estão ativos', async () => {
      const { service } = await createAuthService(buildUser({ mfaEnabled: true, mfaSecret: 'enc', emailOtpEnabled: true }));
      const result: any = await service.login(loginDto);

      expect(result.availableMethods).toEqual([MfaMethod.TOTP, MfaMethod.EMAIL]);
    });

    it('rejeita credenciais inválidas', async () => {
      const { service, usersService } = await createAuthService(buildUser());
      usersService.validateCredentials.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('verifyMfa', () => {
    it('valida TOTP por padrão', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, mfaService } = await createAuthService(user);

      const result = await service.verifyMfa({ mfaToken: mfaTokenFor(user), code: '123456' });

      expect(mfaService.verifyToken).toHaveBeenCalledWith('plain-secret', '123456');
      expect(result).toHaveProperty('accessToken');
    });

    it('valida Email OTP quando method=email', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service, emailOtpService } = await createAuthService(user);

      const result = await service.verifyMfa({
        mfaToken: mfaTokenFor(user),
        method: MfaMethod.EMAIL,
        code: '483921',
      });

      expect(emailOtpService.verify).toHaveBeenCalledWith(user.id, '483921');
      expect(result).toHaveProperty('accessToken');
    });

    it('não aceita Email OTP para usuário sem emailOtpEnabled', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, emailOtpService } = await createAuthService(user);

      await expect(
        service.verifyMfa({ mfaToken: mfaTokenFor(user), method: MfaMethod.EMAIL, code: '483921' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(emailOtpService.verify).not.toHaveBeenCalled();
    });

    it('rejeita mfaToken inválido ou expirado', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service } = await createAuthService(user);

      await expect(service.verifyMfa({ mfaToken: 'token.invalido', code: '123456' })).rejects.toThrow(
        'MFA token inválido ou expirado',
      );
    });

    it('não aceita access token como mfaToken', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service } = await createAuthService(user);
      const accessToken = `${ACCESS_SECRET}:${JSON.stringify({ sub: user.id, email: user.email })}`;

      await expect(service.verifyMfa({ mfaToken: accessToken, code: '123456' })).rejects.toThrow(
        'MFA token inválido ou expirado',
      );
    });

    it('mapeia expiração do OTP para 401', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service, emailOtpService } = await createAuthService(user);
      emailOtpService.verify.mockResolvedValue({ success: false, reason: EmailOtpVerifyFailure.EXPIRED });

      await expect(
        service.verifyMfa({ mfaToken: mfaTokenFor(user), method: MfaMethod.EMAIL, code: '483921' }),
      ).rejects.toThrow('Email OTP expirado');
    });

    it('mapeia limite de tentativas para 429', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service, emailOtpService } = await createAuthService(user);
      emailOtpService.verify.mockResolvedValue({
        success: false,
        reason: EmailOtpVerifyFailure.MAX_ATTEMPTS_EXCEEDED,
      });

      await expect(
        service.verifyMfa({ mfaToken: mfaTokenFor(user), method: MfaMethod.EMAIL, code: '483921' }),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('requestEmailOtp', () => {
    it('envia o código e não o expõe na resposta', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service, emailOtpService, emailService } = await createAuthService(user);

      const result = await service.requestEmailOtp({ mfaToken: mfaTokenFor(user) });

      expect(emailOtpService.create).toHaveBeenCalledWith(user.id);
      expect(emailService.sendOtpEmail).toHaveBeenCalledWith(user.email, '483921', 5);
      expect(result).toEqual({ sent: true });
      expect(JSON.stringify(result)).not.toContain('483921');
    });

    it('recusa quando Email OTP não está habilitado', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, emailService } = await createAuthService(user);

      await expect(service.requestEmailOtp({ mfaToken: mfaTokenFor(user) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(emailService.sendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('enableEmailOtp', () => {
    it('habilita somente depois de validar o código', async () => {
      const user = buildUser();
      const { service, usersService } = await createAuthService(user);

      const result = await service.enableEmailOtp(user.id, { code: '483921' });

      expect(usersService.setEmailOtpEnabled).toHaveBeenCalledWith(user.id, true);
      expect(result).toEqual({ emailOtpEnabled: true });
    });

    it('não habilita quando o código é inválido', async () => {
      const user = buildUser();
      const { service, usersService, emailOtpService } = await createAuthService(user);
      emailOtpService.verify.mockResolvedValue({ success: false, reason: EmailOtpVerifyFailure.INVALID_CODE });

      await expect(service.enableEmailOtp(user.id, { code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.setEmailOtpEnabled).not.toHaveBeenCalled();
    });
  });

  describe('requestEnableEmailOtp / requestDisableEmailOtp', () => {
    it('envia OTP de habilitação para usuário autenticado', async () => {
      const user = buildUser();
      const { service, emailService } = await createAuthService(user);

      await expect(service.requestEnableEmailOtp(user.id)).resolves.toEqual({ sent: true });
      expect(emailService.sendOtpEmail).toHaveBeenCalled();
    });

    it('recusa novo pedido quando Email OTP já está habilitado', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service } = await createAuthService(user);

      await expect(service.requestEnableEmailOtp(user.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa pedido de desativação quando Email OTP não está habilitado', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service } = await createAuthService(user);

      await expect(service.requestDisableEmailOtp(user.id)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recoveryMfa', () => {
    it('consome o recovery code e devolve access token', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, recoveryCodesService } = await createAuthService(user);
      recoveryCodesService.validateCode.mockResolvedValue({ id: 'rc-1' });

      const result = await service.recoveryMfa({ mfaToken: mfaTokenFor(user), code: 'A1B2-C3D4' });

      expect(recoveryCodesService.markAsUsed).toHaveBeenCalledWith('rc-1');
      expect(result).toHaveProperty('accessToken');
    });

    it('rejeita recovery code inválido', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, recoveryCodesService } = await createAuthService(user);
      recoveryCodesService.validateCode.mockResolvedValue(null);

      await expect(
        service.recoveryMfa({ mfaToken: mfaTokenFor(user), code: 'A1B2-C3D4' }),
      ).rejects.toThrow('Recovery code inválido');
    });
  });

  describe('disableMfa', () => {
    it('desativa o TOTP com senha + código', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, usersService, recoveryCodesService } = await createAuthService(user);

      await service.disableMfa(user.id, {
        method: MfaMethod.TOTP,
        code: '123456',
        password: 'Senha@123',
      });

      expect(usersService.validatePassword).toHaveBeenCalledWith(user.id, 'Senha@123');
      expect(usersService.disableMfa).toHaveBeenCalledWith(user.id);
      expect(recoveryCodesService.invalidateAllForUser).toHaveBeenCalledWith(user.id);
    });

    it('desativa o Email OTP com senha + código, preservando o TOTP', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc', emailOtpEnabled: true });
      const { service, usersService } = await createAuthService(user);

      await service.disableMfa(user.id, {
        method: MfaMethod.EMAIL,
        code: '483921',
        password: 'Senha@123',
      });

      expect(usersService.setEmailOtpEnabled).toHaveBeenCalledWith(user.id, false);
      expect(usersService.disableMfa).not.toHaveBeenCalled();
    });

    it('rejeita senha incorreta', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, usersService } = await createAuthService(user);
      usersService.validatePassword.mockRejectedValue(new UnauthorizedException('Senha atual incorreta'));

      await expect(
        service.disableMfa(user.id, { method: MfaMethod.TOTP, code: '123456', password: 'Errada@123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.disableMfa).not.toHaveBeenCalled();
    });

    it('rejeita código incorreto', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, mfaService, usersService } = await createAuthService(user);
      mfaService.verifyToken.mockReturnValue(false);

      await expect(
        service.disableMfa(user.id, { method: MfaMethod.TOTP, code: '000000', password: 'Senha@123' }),
      ).rejects.toThrow('Código TOTP inválido');
      expect(usersService.disableMfa).not.toHaveBeenCalled();
    });

    it('recusa desativar TOTP quando não está ativo', async () => {
      const user = buildUser({ emailOtpEnabled: true });
      const { service } = await createAuthService(user);

      await expect(
        service.disableMfa(user.id, { method: MfaMethod.TOTP, code: '123456', password: 'Senha@123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('tokens', () => {
    it('assina o mfaToken com JWT_MFA_SECRET e marca mfa=true', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'enc' });
      const { service, jwtService } = await createAuthService(user);

      await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: user.id, email: user.email, mfa: true }),
        expect.objectContaining({ secret: MFA_SECRET }),
      );
    });

    it('assina o accessToken com JWT_ACCESS_SECRET', async () => {
      const { service, jwtService } = await createAuthService(buildUser());

      await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        expect.objectContaining({ secret: ACCESS_SECRET }),
      );
    });
  });
});