import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class MfaRecoveryDto {
  @ApiProperty({
    description: 'MFA token temporário recebido no login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  mfaToken: string;

  @ApiProperty({
    description: 'Recovery code no formato XXXX-XXXX',
    example: 'A1B2-C3D4',
  })
  @IsString()
  @Length(9, 9, { message: 'O recovery code deve ter 9 caracteres (XXXX-XXXX)' })
  @Matches(/^[A-F0-9]{4}-[A-F0-9]{4}$/i, { message: 'Formato de recovery code inválido' })
  code: string;
}