import { Module } from '@nestjs/common';
import { ApiInstaService } from './api-insta.service';
import { ApiInstaController } from './api-insta.controller';
import { BullModule } from '@nestjs/bullmq';
import { StorageR2Module } from 'src/common/storage_r2/storage_r2.module';
import { SupabaseModule } from 'src/common/supabase/supabase.module';
import { ApiInstaProcessor } from './api-insta.processor';

@Module({
  imports:[BullModule.registerQueue({
      name: 'upload-queue',
    }),
    StorageR2Module,
    SupabaseModule,],
  controllers: [ApiInstaController],
  providers: [ApiInstaService,ApiInstaProcessor],
})
export class ApiInstaModule {}
