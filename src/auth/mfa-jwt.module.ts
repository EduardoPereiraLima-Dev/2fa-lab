import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_MFA_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_MFA_EXPIRES_IN', '5m'),
        },
      }),
    }),
  ],
  providers: [JwtService],
  exports: [JwtService],
})
export class MfaJwtModule {}
