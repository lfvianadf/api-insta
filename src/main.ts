import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config'; // <-- A mágica acontece aqui
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'https://admin.blogdosantana.com.br', // Use o domínio exato que está no seu header de Origin
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  })
  app.use(json({ limit: '150mb' }));
  app.use(urlencoded({ limit: '150mb', extended: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
