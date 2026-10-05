import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SendMessageParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT', '2525');

    if (!host) {
      this.logger.warn('SMTP_HOST não configurado. Envio de e-mail desabilitado.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    this.logger.log(`Transporter SMTP inicializado para ${host}:${port}`);
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP não configurado: verifique SMTP_HOST no ambiente');
    }

    const from = this.configService.get<string>('SMTP_FROM', '2FA Lab <no-reply@2fa.local>');

    await this.transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    this.logger.log(`E-mail "${params.subject}" enviado para ${params.to}`);
  }

  async sendOtpEmail(to: string, code: string, expiresInMinutes: number): Promise<void> {
    const subject = `${this.issuerName()} - Código de autenticação`;

    const text = [
      this.issuerName(),
      '',
      'Seu código de autenticação é:',
      '',
      code,
      '',
      `Este código expira em ${expiresInMinutes} minutos.`,
      '',
      'Se você não solicitou este código, ignore este e-mail.',
    ].join('\n');

    await this.sendMessage({ to, subject, text });
  }

  private issuerName(): string {
    return this.configService.get<string>('MFA_ISSUER', '2FA-Lab');
  }
}