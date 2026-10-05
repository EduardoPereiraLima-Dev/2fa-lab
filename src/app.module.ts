import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MfaModule } from './mfa/mfa.module';
import { RecoveryCodesModule } from './recovery-codes/recovery-codes.module';
import { EmailOtpModule } from './email-otp/email-otp.module';
import { LabModule } from './lab/lab.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MfaModule,
    RecoveryCodesModule,
    EmailOtpModule,
    LabModule,
  ],
})
export class AppModule {}
