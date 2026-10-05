export enum MfaMethod {
  TOTP = 'totp',
  EMAIL = 'email',
}

export type MfaMethodValue = MfaMethod.TOTP | MfaMethod.EMAIL;

export interface EmailOtpGenerated {
  code: string;
  codeHash: string;
  expiresAt: Date;
}

export interface EmailOtpCreationResult extends EmailOtpGenerated {
  id: string;
}

export enum EmailOtpVerifyFailure {
  NOT_FOUND = 'NOT_FOUND',
  EXPIRED = 'EXPIRED',
  ALREADY_USED = 'ALREADY_USED',
  MAX_ATTEMPTS_EXCEEDED = 'MAX_ATTEMPTS_EXCEEDED',
  INVALID_CODE = 'INVALID_CODE',
}

export type EmailOtpVerifyResult =
  | { success: true; otpId: string }
  | { success: false; reason: EmailOtpVerifyFailure };

export interface EmailOtpConfig {
  length: number;
  expiresInMinutes: number;
  maxAttempts: number;
}