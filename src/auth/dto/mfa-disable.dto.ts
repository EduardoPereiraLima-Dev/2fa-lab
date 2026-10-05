import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { MfaMethod } from '../../email-otp/interfaces/email-otp.interface';

export class MfaDisableDto {
  @ApiProperty({
    description: 'Senha atual do usuário (camada adicional de autenticação)',
    example: 'Senha@123',
  })
  @IsString()
  @Length(8, 72, { message: 'A senha deve ter entre 8 e 72 caracteres' })
  password: string;

  @ApiProperty({
    description: 'Método MFA usado para confirmar a desativação',
    enum: MfaMethod,
    example: MfaMethod.TOTP,
  })
  @IsEnum(MfaMethod, { message: 'method deve ser "totp" ou "email"' })
  method: MfaMethod;

  @ApiProperty({
    description: 'Código de 6 dígitos do método informado',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'O código deve ter exatamente 6 dígitos' })
  code: string;
}