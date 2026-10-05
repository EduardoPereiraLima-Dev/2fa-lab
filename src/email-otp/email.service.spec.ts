import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const createTransportMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

async function createService(env: Record<string, string | undefined>) {
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => env[key] ?? defaultValue),
  } as unknown as ConfigService;

  const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
  createTransportMock.mockReturnValue({ sendMail });

  const moduleRef = await Test.createTestingModule({
    providers: [EmailService, { provide: ConfigService, useValue: configService }],
  }).compile();

  const service = moduleRef.get(EmailService);
  service.onModuleInit();

  return { service, sendMail };
}

describe('EmailService', () => {
  afterEach(() => jest.clearAllMocks());

  it('não inicializa o transporter sem SMTP_HOST', async () => {
    const { service, sendMail } = await createService({});
    await expect(service.sendOtpEmail('user@2fa.local', '123456', 5)).rejects.toThrow('SMTP não configurado');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('cria o transporter com as credenciais do ambiente', async () => {
    await createService({
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: '2525',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'secret',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      auth: { user: 'user', pass: 'secret' },
    });
  });

  it('envia o e-mail com o código, o prazo e o aviso de uso indevido', async () => {
    const { service, sendMail } = await createService({
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: '2525',
      SMTP_FROM: '2FA Lab <no-reply@2fa.local>',
    });

    await service.sendOtpEmail('user@2fa.local', '483921', 5);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('user@2fa.local');
    expect(mail.from).toBe('2FA Lab <no-reply@2fa.local>');
    expect(mail.text).toContain('483921');
    expect(mail.text).toContain('expira em 5 minutos');
    expect(mail.text).toContain('Se você não solicitou este código, ignore este e-mail.');
  });

  it('usa SMTP_FROM padrão quando não configurado', async () => {
    const { service, sendMail } = await createService({ SMTP_HOST: 'smtp.mailtrap.io' });
    await service.sendOtpEmail('user@2fa.local', '111111', 5);

    expect(sendMail.mock.calls[0][0].from).toBe('2FA Lab <no-reply@2fa.local>');
  });
});