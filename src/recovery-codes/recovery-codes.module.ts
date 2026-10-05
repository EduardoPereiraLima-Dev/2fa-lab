import { Module } from '@nestjs/common';
import { RecoveryCodesService } from './recovery-codes.service';

@Module({
  providers: [RecoveryCodesService],
  exports: [RecoveryCodesService],
})
export class RecoveryCodesModule {}
