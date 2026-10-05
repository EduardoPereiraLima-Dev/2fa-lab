import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailOtpService } from './email-otp.service';

@Module({
  providers: [EmailService, EmailOtpService],
  exports: [EmailService, EmailOtpService],
})
export class EmailOtpModule {}