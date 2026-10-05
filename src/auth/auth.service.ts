import { HttpException, HttpStatus, Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { MfaService } from '../mfa/mfa.service';
import { RecoveryCodesService } from '../recovery-codes/recovery-codes.service';
import { EmailOtpService } from '../email-otp/email-otp.service';
import { EmailService } from '../email-otp/email.service';
import { EmailOtpVerifyFailure, MfaMethod } from '../email-otp/interfaces/email-otp.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { MfaEnableDto } from './dto/mfa-enable.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { MfaRecoveryDto } from './dto/mfa-recovery.dto';
import { EnableEmailOtpDto } from '../email-otp/dto/enable-email-otp.dto';
import {
  AuthTokensResponse,
  EmailOtpEnabledResponse,
  EmailOtpSentResponse,
  MfaEnableResponse,
  MfaSetupResponse,
} from './interfaces/auth-response.interface';

interface MfaTokenPayload {
  sub: string;
  email: string;
  mfa: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
    private readonly recoveryCodesService: RecoveryCodesService,
    private readonly emailOtpService: EmailOtpService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    const user = await this.usersService.create(dto.email, dto.password);
    const accessToken = this.generateAccessToken(user.id, user.email);
    return { accessToken };
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse | { requiresMfa: true; mfaToken: string; availableMethods: MfaMethod[] }> {
    const user = await this.usersService.validateCredentials(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!this.usersService.hasAnyMfaMethod(user)) {
      const accessToken = this.generateAccessToken(user.id, user.email);
      return { accessToken };
    }

    const mfaToken = this.generateMfaToken(user.id, user.email);
    return { requiresMfa: true, mfaToken, availableMethods: this.usersService.availableMfaMethods(user) };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async setupMfa(userId: string): Promise<MfaSetupResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return this.mfaService.setup(userId, user.email);
  }

  async enableMfa(userId: string, dto: MfaEnableDto): Promise<MfaEnableResponse> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.mfaSecret) {
      throw new BadRequestException('MFA não configurado');
    }

    const secret = await this.mfaService.decryptSecret(user.mfaSecret);
    const valid = this.mfaService.verifyToken(secret, dto.code);
    if (!valid) {
      throw new UnauthorizedException('Código TOTP inválido');
    }

    const now = new Date();
    await this.usersService.updateMfaSecret(userId, user.mfaSecret, now);
    const recoveryCodes = await this.recoveryCodesService.createForUser(userId);

    return { recoveryCodes };
  }

  async verifyMfa(dto: MfaVerifyDto): Promise<AuthTokensResponse> {
    const user = await this.resolveMfaTokenUser(dto.mfaToken);

    const method = dto.method ?? MfaMethod.TOTP;
    const accessToken =
      method === MfaMethod.TOTP
        ? await this.verifyTotp(user, dto.code)
        : await this.verifyEmailOtp(user, dto.code);

    return { accessToken };
  }

  async requestEmailOtp(dto: { mfaToken: string }): Promise<EmailOtpSentResponse> {
    const user = await this.resolveMfaTokenUser(dto.mfaToken);

    if (!user.emailOtpEnabled) {
      throw new BadRequestException('Email OTP não está habilitado para este usuário');
    }

    return this.sendEmailOtp(user);
  }

  async requestEnableEmailOtp(userId: string): Promise<EmailOtpSentResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (user.emailOtpEnabled) {
      throw new BadRequestException('Email OTP já está habilitado');
    }

    return this.sendEmailOtp(user);
  }

  async enableEmailOtp(userId: string, dto: EnableEmailOtpDto): Promise<EmailOtpEnabledResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (user.emailOtpEnabled) {
      throw new BadRequestException('Email OTP já está habilitado');
    }

    const result = await this.emailOtpService.verify(user.id, dto.code);
    this.assertOtpVerified(result);

    await this.usersService.setEmailOtpEnabled(user.id, true);

    return { emailOtpEnabled: true };
  }

  async recoveryMfa(dto: MfaRecoveryDto): Promise<AuthTokensResponse> {
    const user = await this.resolveMfaTokenUser(dto.mfaToken);

    const code = await this.recoveryCodesService.validateCode(user.id, dto.code);
    if (!code) {
      throw new UnauthorizedException('Recovery code inválido');
    }

    await this.recoveryCodesService.markAsUsed(code.id);
    const accessToken = this.generateAccessToken(user.id, user.email);
    return { accessToken };
  }

  async requestDisableEmailOtp(userId: string): Promise<EmailOtpSentResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (!user.emailOtpEnabled) {
      throw new BadRequestException('Email OTP não está habilitado para este usuário');
    }

    return this.sendEmailOtp(user);
  }

  async disableMfa(userId: string, dto: MfaDisableDto): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (dto.method === MfaMethod.TOTP && !user.mfaSecret) {
      throw new BadRequestException('MFA TOTP não está ativado');
    }

    if (dto.method === MfaMethod.EMAIL && !user.emailOtpEnabled) {
      throw new BadRequestException('MFA Email OTP não está ativado');
    }

    await this.usersService.validatePassword(userId, dto.password);

    if (dto.method === MfaMethod.TOTP) {
      const secret = await this.mfaService.decryptSecret(user.mfaSecret as string);
      const valid = this.mfaService.verifyToken(secret, dto.code);
      if (!valid) {
        throw new UnauthorizedException('Código TOTP inválido');
      }
    } else {
      const result = await this.emailOtpService.verify(user.id, dto.code);
      this.assertOtpVerified(result);
    }

    if (dto.method === MfaMethod.TOTP) {
      await this.usersService.disableMfa(userId);
      await this.recoveryCodesService.invalidateAllForUser(userId);
    } else {
      await this.usersService.setEmailOtpEnabled(userId, false);
      await this.emailOtpService.invalidateAll(userId);
    }
  }

  private async sendEmailOtp(user: User): Promise<EmailOtpSentResponse> {
    const { code } = await this.emailOtpService.create(user.id);
    const { expiresInMinutes } = this.emailOtpService.getConfig();

    await this.emailService.sendOtpEmail(user.email, code, expiresInMinutes);

    return { sent: true };
  }

  private async verifyTotp(user: User, code: string): Promise<string> {
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('MFA TOTP não está habilitado para este usuário');
    }

    const secret = await this.mfaService.decryptSecret(user.mfaSecret);
    const valid = this.mfaService.verifyToken(secret, code);
    if (!valid) {
      throw new UnauthorizedException('Código TOTP inválido');
    }

    return this.generateAccessToken(user.id, user.email);
  }

  private async verifyEmailOtp(user: User, code: string): Promise<string> {
    if (!user.emailOtpEnabled) {
      throw new UnauthorizedException('Email OTP não está habilitado para este usuário');
    }

    const result = await this.emailOtpService.verify(user.id, code);
    this.assertOtpVerified(result);

    return this.generateAccessToken(user.id, user.email);
  }

  private assertOtpVerified(result: Awaited<ReturnType<EmailOtpService['verify']>>): void {
    if (result.success) {
      return;
    }

    switch (result.reason) {
      case EmailOtpVerifyFailure.EXPIRED:
        throw new UnauthorizedException('Email OTP expirado');
      case EmailOtpVerifyFailure.ALREADY_USED:
        throw new UnauthorizedException('Email OTP já utilizado');
      case EmailOtpVerifyFailure.MAX_ATTEMPTS_EXCEEDED:
        throw new HttpException(
          'Número máximo de tentativas excedido. Solicite um novo código.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case EmailOtpVerifyFailure.INVALID_CODE:
        throw new UnauthorizedException('Email OTP inválido');
      default:
        throw new UnauthorizedException('Email OTP inválido ou expirado');
    }
  }

  private async resolveMfaTokenUser(mfaToken: string): Promise<User> {
    let payload: MfaTokenPayload;
    try {
      payload = this.jwtService.verify(mfaToken, {
        secret: this.configService.get<string>('JWT_MFA_SECRET'),
      }) as MfaTokenPayload;
    } catch {
      throw new UnauthorizedException('MFA token inválido ou expirado');
    }

    if (!payload.mfa) {
      throw new UnauthorizedException('Token MFA inválido');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !this.usersService.hasAnyMfaMethod(user)) {
      throw new UnauthorizedException('Usuário não elegível para MFA');
    }

    return user;
  }

  private generateAccessToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
  }

  private generateMfaToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email, mfa: true },
      {
        secret: this.configService.get<string>('JWT_MFA_SECRET'),
        expiresIn: this.configService.get<string>('JWT_MFA_EXPIRES_IN', '5m'),
      },
    );
  }
}