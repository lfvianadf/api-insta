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
  //Aumentando o limite do JSON.
  app.use(json({ limit: '125mb' }));
  app.use(urlencoded({ limit: '125mb', extended: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
