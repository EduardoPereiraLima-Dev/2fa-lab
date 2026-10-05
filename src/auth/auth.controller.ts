import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaEnableDto } from './dto/mfa-enable.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { MfaRecoveryDto } from './dto/mfa-recovery.dto';
import { RequestEmailOtpDto } from '../email-otp/dto/request-email-otp.dto';
import { EnableEmailOtpDto } from '../email-otp/dto/enable-email-otp.dto';
import { MfaMethod } from '../email-otp/interfaces/email-otp.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthTokensResponse,
  EmailOtpEnabledResponse,
  EmailOtpSentResponse,
  MfaEnableResponse,
  MfaRequiredResponse,
  MfaSetupResponse,
} from './interfaces/auth-response.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar novo usuário' })
  @ApiOkResponse({ description: 'Usuário criado com sucesso', type: AuthTokensResponse })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login com email e senha',
    description:
      'Retorna access token quando não há MFA. Quando existe ao menos um método MFA ativo, retorna mfaToken + availableMethods.',
  })
  @ApiOkResponse({
    description: 'Login com MFA pendente',
    type: MfaRequiredResponse,
  })
  @ApiResponse({
    status: 201,
    description: 'Login sem MFA',
    type: AuthTokensResponse,
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Obter dados do usuário autenticado' })
  me(@CurrentUser('userId') userId: string) {
    return this.authService.me(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('mfa/setup')
  @ApiOperation({ summary: 'Configurar MFA TOTP (gera QR Code)' })
  @ApiOkResponse({ type: MfaSetupResponse })
  setupMfa(@CurrentUser('userId') userId: string) {
    return this.authService.setupMfa(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/enable')
  @ApiOperation({ summary: 'Ativar MFA com código TOTP' })
  @ApiOkResponse({ type: MfaEnableResponse })
  enableMfa(@CurrentUser('userId') userId: string, @Body() dto: MfaEnableDto) {
    return this.authService.enableMfa(userId, dto);
  }

  @Post('mfa/request-email')
  @ApiOperation({
    summary: 'Solicitar Email OTP durante o login',
    description:
      'Invalida o Email OTP anterior, gera um novo e envia por e-mail. O código nunca é retornado na resposta.',
  })
  @ApiOkResponse({ type: EmailOtpSentResponse })
  requestEmailOtp(@Body() dto: RequestEmailOtpDto) {
    return this.authService.requestEmailOtp(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/enable-email/request')
  @ApiOperation({ summary: 'Solicitar Email OTP para habilitação (usuário autenticado)' })
  @ApiOkResponse({ type: EmailOtpSentResponse })
  requestEnableEmailOtp(@CurrentUser('userId') userId: string) {
    return this.authService.requestEnableEmailOtp(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/enable-email')
  @ApiOperation({
    summary: 'Habilitar Email OTP',
    description: 'Só habilita emailOtpEnabled após validar o código enviado ao e-mail cadastrado.',
  })
  @ApiOkResponse({ type: EmailOtpEnabledResponse })
  enableEmailOtp(@CurrentUser('userId') userId: string, @Body() dto: EnableEmailOtpDto) {
    return this.authService.enableEmailOtp(userId, dto);
  }

  @Post('mfa/verify')
  @ApiOperation({
    summary: 'Validar MFA (TOTP ou Email OTP) e obter access token',
    description: `Use method: "${MfaMethod.TOTP}" ou method: "${MfaMethod.EMAIL}". O código do Email OTP deve ter sido solicitado em POST /auth/mfa/request-email.`,
  })
  @ApiOkResponse({ type: AuthTokensResponse })
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfa(dto);
  }

  @Post('mfa/recovery')
  @ApiOperation({ summary: 'Usar recovery code e obter access token' })
  @ApiOkResponse({ type: AuthTokensResponse })
  recoveryMfa(@Body() dto: MfaRecoveryDto) {
    return this.authService.recoveryMfa(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/disable/request-email')
  @ApiOperation({ summary: 'Solicitar Email OTP para desativar o método email' })
  @ApiOkResponse({ type: EmailOtpSentResponse })
  requestDisableEmailOtp(@CurrentUser('userId') userId: string) {
    return this.authService.requestDisableEmailOtp(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/disable')
  @ApiOperation({
    summary: 'Desativar um método MFA',
    description: 'Exige senha atual + código do método informado (totp ou email).',
  })
  @ApiOkResponse({ description: 'Método MFA desativado' })
  disableMfa(@CurrentUser('userId') userId: string, @Body() dto: MfaDisableDto) {
    return this.authService.disableMfa(userId, dto);
  }
}