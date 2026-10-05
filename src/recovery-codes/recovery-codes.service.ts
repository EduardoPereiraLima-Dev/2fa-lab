import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryCode } from '@prisma/client';

export interface RecoveryCodeResult {
  code: string;
  codeHash: string;
}

@Injectable()
export class RecoveryCodesService {
  constructor(private readonly prisma: PrismaService) {}

  generateRecoveryCodes(): RecoveryCodeResult[] {
    const codes: RecoveryCodeResult[] = [];

    for (let i = 0; i < 10; i++) {
      const raw = randomBytes(5).toString('hex').toUpperCase().slice(0, 4) + '-' +
        randomBytes(5).toString('hex').toUpperCase().slice(0, 4);
      codes.push({ code: raw, codeHash: '' });
    }

    return codes;
  }

  async createForUser(userId: string): Promise<string[]> {
    const plainCodes = this.generateRecoveryCodes();

    for (const item of plainCodes) {
      const codeHash = await bcrypt.hash(item.code, 10);
      await this.prisma.recoveryCode.create({
        data: {
          userId,
          codeHash,
        },
      });
    }

    return plainCodes.map((c) => c.code);
  }

  async validateCode(userId: string, plainCode: string): Promise<RecoveryCode | null> {
    const codes = await this.prisma.recoveryCode.findMany({
      where: { userId, usedAt: null },
    });

    for (const code of codes) {
      const match = await bcrypt.compare(plainCode, code.codeHash);
      if (match) {
        return code;
      }
    }

    return null;
  }

  async markAsUsed(codeId: string): Promise<void> {
    await this.prisma.recoveryCode.update({
      where: { id: codeId },
      data: { usedAt: new Date() },
    });
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.prisma.recoveryCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
