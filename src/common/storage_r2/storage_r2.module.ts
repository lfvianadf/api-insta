import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageR2Service } from './storage_r2.service';

@Module({
  imports: [ConfigModule], // Permite que o Service use o configService
  providers: [StorageR2Service],
  exports: [StorageR2Service], // ESSENCIAL: Permite que outros módulos usem o upload
})
export class StorageR2Module {}