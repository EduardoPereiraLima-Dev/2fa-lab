import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MfaService } from './mfa.service';

@Module({
  imports: [PrismaModule],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
