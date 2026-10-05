import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, RecoveryCode } from '@prisma/client';

export interface UserWithRecoveryCodes extends User {
  recoveryCodes: RecoveryCode[];
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
      },
    });
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async updateMfaSecret(id: string, mfaSecret: string | null, mfaVerifiedAt: Date | null): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        mfaSecret,
        mfaVerifiedAt,
        mfaEnabled: mfaVerifiedAt !== null,
      },
    });
  }

  async disableMfa(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaVerifiedAt: null,
      },
    });
  }

  async setEmailOtpEnabled(id: string, enabled: boolean): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { emailOtpEnabled: enabled },
    });
  }
}
