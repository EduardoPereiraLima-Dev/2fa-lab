import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { MfaMethod } from '../email-otp/interfaces/email-otp.interface';

function buildRepository() {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn(),
    updateMfaSecret: jest.fn(),
    disableMfa: jest.fn(),
    setEmailOtpEnabled: jest.fn(),
  };
}

async function createUsersService(repository: ReturnType<typeof buildRepository>) {
  const moduleRef = await Test.createTestingModule({
    providers: [UsersService, { provide: UsersRepository, useValue: repository }],
  }).compile();

  return moduleRef.get(UsersService);
}

describe('UsersService', () => {
  describe('hasAnyMfaMethod', () => {
    it('considera MFA ativo quando ao menos um método está habilitado', async () => {
      const service = await createUsersService(buildRepository());

      expect(service.hasAnyMfaMethod({ mfaEnabled: true, emailOtpEnabled: false })).toBe(true);
      expect(service.hasAnyMfaMethod({ mfaEnabled: false, emailOtpEnabled: true })).toBe(true);
      expect(service.hasAnyMfaMethod({ mfaEnabled: true, emailOtpEnabled: true })).toBe(true);
    });

    it('considera MFA inativo quando nenhum método está habilitado', async () => {
      const service = await createUsersService(buildRepository());
      expect(service.hasAnyMfaMethod({ mfaEnabled: false, emailOtpEnabled: false })).toBe(false);
    });
  });

  describe('availableMfaMethods', () => {
    it('lista somente os métodos ativos', async () => {
      const service = await createUsersService(buildRepository());

      expect(service.availableMfaMethods({ mfaEnabled: false, emailOtpEnabled: false })).toEqual([]);
      expect(service.availableMfaMethods({ mfaEnabled: true, emailOtpEnabled: false })).toEqual([MfaMethod.TOTP]);
      expect(service.availableMfaMethods({ mfaEnabled: false, emailOtpEnabled: true })).toEqual([MfaMethod.EMAIL]);
      expect(service.availableMfaMethods({ mfaEnabled: true, emailOtpEnabled: true })).toEqual([
        MfaMethod.TOTP,
        MfaMethod.EMAIL,
      ]);
    });
  });

  describe('setEmailOtpEnabled', () => {
    it('delega a alteração ao repository', async () => {
      const repository = buildRepository();
      const service = await createUsersService(repository);

      await service.setEmailOtpEnabled('user-1', true);

      expect(repository.setEmailOtpEnabled).toHaveBeenCalledWith('user-1', true);
    });
  });

  describe('validatePassword', () => {
    it('aceita a senha atual correta', async () => {
      const passwordHash = await bcrypt.hash('Senha@123', 4);
      const repository = buildRepository();
      repository.findById.mockResolvedValue({ id: 'user-1', passwordHash });
      const service = await createUsersService(repository);

      await expect(service.validatePassword('user-1', 'Senha@123')).resolves.toBe(true);
    });

    it('rejeita senha incorreta', async () => {
      const passwordHash = await bcrypt.hash('Senha@123', 4);
      const repository = buildRepository();
      repository.findById.mockResolvedValue({ id: 'user-1', passwordHash });
      const service = await createUsersService(repository);

      await expect(service.validatePassword('user-1', 'Errada@123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('create', () => {
    it('rejeita e-mail duplicado', async () => {
      const repository = buildRepository();
      repository.findByEmail.mockResolvedValue({ id: 'user-1' });
      const service = await createUsersService(repository);

      await expect(service.create('user@2fa.local', 'Senha@123')).rejects.toBeInstanceOf(ConflictException);
    });

    it('cria o usuário com hash da senha', async () => {
      const repository = buildRepository();
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockImplementation(({ email, passwordHash }) => ({ email, passwordHash }));
      const service = await createUsersService(repository);

      const user = await service.create('user@2fa.local', 'Senha@123');

      expect(user.passwordHash).not.toBe('Senha@123');
      await expect(bcrypt.compare('Senha@123', user.passwordHash)).resolves.toBe(true);
    });
  });
});