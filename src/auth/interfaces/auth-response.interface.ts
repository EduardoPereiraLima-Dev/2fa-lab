import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MfaMethod } from '../../email-otp/interfaces/email-otp.interface';

export class AuthTokensResponse {
  @ApiProperty({ description: 'Access token JWT (não habilita MFA)', example: 'eyJhbGciOi...' })
  accessToken: string;
}

export class MfaRequiredResponse {
  @ApiProperty({ description: 'Indica que a verificação de MFA é obrigatória', example: true })
  requiresMfa: true;

  @ApiProperty({
    description: 'Token temporário de MFA, distinto do access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  mfaToken: string;

  @ApiPropertyOptional({
    description: 'Métodos MFA disponíveis para este usuário',
    enum: MfaMethod,
    isArray: true,
    example: [MfaMethod.TOTP, MfaMethod.EMAIL],
  })
  availableMethods?: MfaMethod[];
}

export type LoginResponse = AuthTokensResponse | MfaRequiredResponse;

export class MfaSetupResponse {
  @ApiProperty({ description: 'QR Code em data URL para o Authenticator' })
  qrCodeDataUrl: string;

  @ApiProperty({ description: 'URL otpauth:// para configuração manual' })
  otpauthUrl: string;
}

export class MfaEnableResponse {
  @ApiProperty({
    description: 'Recovery codes de uso único (exibidos somente nesta resposta)',
    type: [String],
    example: ['A1B2-C3D4'],
  })
  recoveryCodes: string[];
}

export class EmailOtpSentResponse {
  @ApiProperty({ description: 'Confirmação de envio do e-mail com o código', example: true })
  sent: true;
}

export class EmailOtpEnabledResponse {
  @ApiProperty({ description: 'Confirmação de habilitação do Email OTP', example: true })
  emailOtpEnabled: true;
}