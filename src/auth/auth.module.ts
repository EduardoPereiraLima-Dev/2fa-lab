import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MfaStrategy } from './strategies/mfa.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaAuthGuard } from './guards/mfa-auth.guard';
import { UsersModule } from '../users/users.module';
import { MfaModule } from '../mfa/mfa.module';
import { RecoveryCodesModule } from '../recovery-codes/recovery-codes.module';
import { EmailOtpModule } from '../email-otp/email-otp.module';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    UsersModule,
    MfaModule,
    RecoveryCodesModule,
    EmailOtpModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtService, JwtStrategy, MfaStrategy, JwtAuthGuard, MfaAuthGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, MfaAuthGuard],
})
export class AuthModule {}
