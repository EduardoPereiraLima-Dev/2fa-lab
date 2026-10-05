import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailOtpConfig,
  EmailOtpCreationResult,
  EmailOtpVerifyFailure,
  EmailOtpVerifyResult,
} from './interfaces/email-otp.interface';

const BCRYPT_ROUNDS_OTP = 10;

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);
  private readonly config: EmailOtpConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.config = {
      length: Math.max(4, Number(configService.get<string>('EMAIL_OTP_LENGTH', '6')) || 6),
      expiresInMinutes: Math.max(1, Number(configService.get<string>('EMAIL_OTP_EXPIRES_MINUTES', '5')) || 5),
      maxAttempts: Math.max(1, Number(configService.get<string>('EMAIL_OTP_MAX_ATTEMPTS', '5')) || 5),
    };
  }

  getConfig(): EmailOtpConfig {
    return this.config;
  }

  generateCode(): string {
    const upperBound = 10 ** this.config.length;
    return randomInt(0, upperBound).toString().padStart(this.config.length, '0');
  }

  async hashCode(code: string): Promise<string> {
    return bcrypt.hash(code, BCRYPT_ROUNDS_OTP);
  }

  private computeExpiration(): Date {
    return new Date(Date.now() + this.config.expiresInMinutes * 60 * 1000);
  }

  async create(userId: string): Promise<EmailOtpCreationResult> {
    await this.invalidatePrevious(userId);

    const code = this.generateCode();
    const codeHash = await this.hashCode(code);
    const expiresAt = this.computeExpiration();

    const otp = await this.prisma.emailOtp.create({
      data: { userId, codeHash, expiresAt },
      select: { id: true },
    });

    this.logger.log(`Email OTP criado para usuário ${userId}`);

    return { id: otp.id, code, codeHash, expiresAt };
  }

  async invalidatePrevious(userId: string): Promise<void> {
    await this.prisma.emailOtp.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async invalidateAll(userId: string): Promise<void> {
    await this.prisma.emailOtp.deleteMany({ where: { userId } });
  }

  async findActive(userId: string) {
    return this.prisma.emailOtp.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async verify(userId: string, code: string): Promise<EmailOtpVerifyResult> {
    const otp = await this.findActive(userId);

    if (!otp) {
      this.logger.warn(`Email OTP inexistente para usuário ${userId}`);
      return { success: false, reason: EmailOtpVerifyFailure.NOT_FOUND };
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(`Email OTP expirado para usuário ${userId}`);
      return { success: false, reason: EmailOtpVerifyFailure.EXPIRED };
    }

    if (otp.attempts >= this.config.maxAttempts) {
      this.logger.warn(`Email OTP bloqueado por tentativas para usuário ${userId}`);
      return { success: false, reason: EmailOtpVerifyFailure.MAX_ATTEMPTS_EXCEEDED };
    }

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      await this.incrementAttempts(otp.id);
      this.logger.warn(`Email OTP inválido para usuário ${userId}`);
      return { success: false, reason: EmailOtpVerifyFailure.INVALID_CODE };
    }

    const consumed = await this.consume(otp.id);
    if (!consumed) {
      this.logger.warn(`Email OTP já consumido para usuário ${userId}`);
      return { success: false, reason: EmailOtpVerifyFailure.ALREADY_USED };
    }

    this.logger.log(`Email OTP consumido para usuário ${userId}`);
    return { success: true, otpId: otp.id };
  }

  private async incrementAttempts(id: string): Promise<void> {
    await this.prisma.emailOtp.updateMany({
      where: { id, usedAt: null },
      data: { attempts: { increment: 1 } },
    });
  }

  private async consume(id: string): Promise<boolean> {
    const result = await this.prisma.emailOtp.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return result.count === 1;
  }
}