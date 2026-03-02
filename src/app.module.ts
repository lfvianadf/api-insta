import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiInstaModule } from './api-insta/api-insta.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [ConfigModule.forRoot({isGlobal: true,envFilePath: '.env',}),BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    connection: {
      url: configService.get<string>('REDIS_URL'),
      // Adicione estas três propriedades para dar "resiliência" ao boot
      maxRetriesPerRequest: null, // Evita que o BullMQ mate o processo se o Redis demorar
      enableReadyCheck: false,    // Ignora o check de prontidão durante o carregamento do RDB
      connectTimeout: 30000,      // Dá 30 segundos para o Redis responder
    },
  }),
  inject: [ConfigService],
}),ApiInstaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
