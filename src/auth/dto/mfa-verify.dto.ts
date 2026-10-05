import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { MfaMethod } from '../../email-otp/interfaces/email-otp.interface';

export class MfaVerifyDto {
  @ApiProperty({
    description: 'MFA token temporário recebido no login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  mfaToken: string;

  @ApiPropertyOptional({
    description: 'Método MFA a validar. Padrão: totp',
    enum: MfaMethod,
    default: MfaMethod.TOTP,
    example: MfaMethod.TOTP,
  })
  @IsOptional()
  @IsEnum(MfaMethod, { message: 'method deve ser "totp" ou "email"' })
  method?: MfaMethod;

  @ApiProperty({
    description: 'Código de 6 dígitos (TOTP ou Email OTP)',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'O código deve ter exatamente 6 dígitos' })
  code: string;
}