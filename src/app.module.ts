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
    },
  }),
  inject: [ConfigService],
}),ApiInstaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
