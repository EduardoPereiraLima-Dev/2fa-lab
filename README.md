# 2FA Lab

Laboratório de autenticação 2FA com TOTP (Google Authenticator) + Email OTP, em NestJS + Prisma + PostgreSQL.

## Stack

- **NestJS 10** — framework Node.js
- **Prisma 5** — ORM
- **PostgreSQL 16** — banco (Docker)
- **otplib** — TOTP RFC 6238
- **Passport + JWT** — autenticação com dois tokens (`accessToken` 15min + `mfaToken` 5min)
- **nodemailer** — envio de OTP por e-mail
- **Mailpit** — SMTP catcher para testes locais

## Pré-requisitos

- Node.js 20+
- Docker Desktop
- ngrok (opcional, para expor publicamente)

## Rodando localmente

```bash
# 1. Clone e instale
git clone https://github.com/EduardoPereiraLima-Dev/2fa-lab.git
cd 2fa-lab
npm install

# 2. Suba o Postgres e o Mailpit
docker compose up -d
docker run -d --name 2fa-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit

# 3. Configure o .env (copie do exemplo se necessário)
cp .env.example .env

# 4. Gere o Prisma Client e rode as migrations
npm run prisma:generate
npx prisma migrate deploy

# 5. Compile e rode
npm run build
npm run start:dev
```

A API sobe em `http://localhost:3000`.

## Endpoints principais

| Rota | Método | Descrição |
|---|---|---|
| `/auth/auth/register` | POST | Registro de usuário |
| `/auth/auth/login` | POST | Login (retorna `accessToken` ou `mfaToken` + métodos MFA) |
| `/auth/auth/me` | GET | Dados do usuário autenticado (Bearer) |
| `/auth/auth/mfa/setup` | GET | Gera segredo TOTP + QR Code |
| `/auth/auth/mfa/enable` | POST | Ativa TOTP com código + retorna 10 recovery codes |
| `/auth/auth/mfa/verify` | POST | Valida TOTP ou Email OTP e retorna `accessToken` |
| `/auth/auth/mfa/recovery` | POST | Usa recovery code para obter `accessToken` |
| `/auth/auth/mfa/disable` | POST | Desativa método MFA (exige senha atual + código) |
| `/auth/auth/mfa/enable-email/request` | POST | Solicita OTP por e-mail para habilitação |
| `/auth/auth/mfa/enable-email` | POST | Habilita Email OTP após validar código |
| `/auth/auth/mfa/request-email` | POST | Solicita OTP por e-mail durante login |
| `/auth/auth/mfa/disable/request-email` | POST | Solicita OTP para desabilitar Email OTP |
| `/auth/lab/mail` | GET | Proxy JSON do Mailpit (testes) |

> **Atenção:** o prefixo global é `auth` e o controller também é `auth`, então as rotas ficam duplicadas: `/auth/auth/...`.

## Painel de testes

Acesse `http://localhost:3000/` — painel web completo com:
- Geração de TOTP no navegador (sem dependências)
- Integração com caixa de entrada do Mailpit
- Log de requisições em tempo real
- Copiar/colar tokens e recovery codes

## Testes automatizados

```bash
npm test           # 54 testes unitários
npm run test:cov   # com cobertura
```

## SMTP para e-mails reais

Para receber e-mails na caixa de entrada real (Gmail, Outlook, etc.), edite o `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seuemail@gmail.com
SMTP_PASSWORD=senha_de_app_16_chars
SMTP_FROM="2FA Lab <seuemail@gmail.com>"
```

Para Gmail, gere uma **Senha de app** em: `https://myaccount.google.com/security` → Verificação em 2 etapas → Senhas de app.

Reinicie a API após alterar o `.env` (`Ctrl+C` → `npm run start:dev`).

## Expondo com ngrok

```bash
ngrok http 3000
# URL pública: https://abc123.ngrok-free.app
```

O painel fica acessível em `https://abc123.ngrok-free.app/` e a API em `https://abc123.ngrok-free.app/auth/auth/...`.

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://2fa:2fa@127.0.0.1:55432/2fa_lab

JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_MFA_SECRET=<openssl rand -hex 32>
JWT_ACCESS_EXPIRES_IN=15m
JWT_MFA_EXPIRES_IN=5m

MFA_ISSUER=2FA-Lab
MFA_ENCRYPTION_KEY=<32+ chars aleatórios>

BCRYPT_ROUNDS=12

SMTP_HOST=127.0.0.1        # Mailpit local (desenvolvimento)
SMTP_PORT=1025
SMTP_USER=lab
SMTP_PASSWORD=lab
SMTP_FROM="2FA Lab <no-reply@2fa.local>"

EMAIL_OTP_LENGTH=6
EMAIL_OTP_EXPIRES_MINUTES=5
EMAIL_OTP_MAX_ATTEMPTS=5

MAILPIT_API_URL=http://127.0.0.1:8025
```

## Licença

UNLICENSED — projeto de laboratório.