import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class EnableEmailOtpDto {
  @ApiProperty({
    description: 'Código de 6 dígitos recebido por e-mail',
    example: '483921',
  })
  @IsString()
  @Length(6, 6, { message: 'O código deve ter exatamente 6 dígitos' })
  code: string;
}