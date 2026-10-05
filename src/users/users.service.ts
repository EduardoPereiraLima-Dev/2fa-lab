import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { User } from '@prisma/client';
import { MfaMethod } from '../email-otp/interfaces/email-otp.interface';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(email: string, password: string): Promise<User> {
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
    return this.usersRepository.create({ email, passwordHash });
  }

  async validateCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    await this.validatePassword(userId, currentPassword);

    const passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
    return this.usersRepository.updatePassword(userId, passwordHash);
  }

  async validatePassword(userId: string, password: string): Promise<boolean> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    return true;
  }

  async updateMfaSecret(userId: string, mfaSecret: string, mfaVerifiedAt: Date): Promise<User> {
    return this.usersRepository.updateMfaSecret(userId, mfaSecret, mfaVerifiedAt);
  }

  async disableMfa(userId: string): Promise<User> {
    return this.usersRepository.disableMfa(userId);
  }

  async setEmailOtpEnabled(userId: string, enabled: boolean): Promise<User> {
    return this.usersRepository.setEmailOtpEnabled(userId, enabled);
  }

  hasAnyMfaMethod(user: Pick<User, 'mfaEnabled' | 'emailOtpEnabled'>): boolean {
    return user.mfaEnabled || user.emailOtpEnabled;
  }

  availableMfaMethods(user: Pick<User, 'mfaEnabled' | 'emailOtpEnabled'>): MfaMethod[] {
    const methods: MfaMethod[] = [];
    if (user.mfaEnabled) methods.push(MfaMethod.TOTP);
    if (user.emailOtpEnabled) methods.push(MfaMethod.EMAIL);
    return methods;
  }
}
