import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';
import * as otp from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

export interface MfaSetup {
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly prisma: PrismaService) {
    const raw = process.env.MFA_ENCRYPTION_KEY;
    if (!raw || raw.length < 32) {
      throw new Error('MFA_ENCRYPTION_KEY deve ter pelo menos 32 caracteres');
    }
    this.encryptionKey = Buffer.from(raw.slice(0, 32), 'utf8');
  }

  generateSecret(): string {
    return otp.authenticator.generateSecret();
  }

  createOtpAuthUrl(secret: string, email: string): string {
    return otp.authenticator.keyuri(email, process.env.MFA_ISSUER || '2FA-Lab', secret);
  }

  async generateQrCode(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyToken(secret: string, token: string): boolean {
    return otp.authenticator.check(token, secret);
  }

  async encryptSecret(plain: string): Promise<string> {
    const iv = randomBytes(12);
    const salt = randomBytes(16);
    const key = await this.deriveKey(salt);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  async decryptSecret(encrypted: string): Promise<string> {
    const [saltHex, ivHex, tagHex, encryptedHex] = encrypted.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(encryptedHex, 'hex');

    const key = await this.deriveKey(salt);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private async deriveKey(salt: Buffer): Promise<Buffer> {
    return promisify(scrypt)(this.encryptionKey, salt, 32) as Promise<Buffer>;
  }

  async setup(userId: string, email: string): Promise<MfaSetup> {
    const secret = this.generateSecret();
    const otpauthUrl = this.createOtpAuthUrl(secret, email);
    const qrCodeDataUrl = await this.generateQrCode(otpauthUrl);

    const encryptedSecret = await this.encryptSecret(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: encryptedSecret,
        mfaEnabled: false,
        mfaVerifiedAt: null,
      },
    });

    return { qrCodeDataUrl, otpauthUrl };
  }
}
