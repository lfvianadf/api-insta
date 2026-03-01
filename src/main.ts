import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config'; // <-- A mágica acontece aqui

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
  origin: 'https://admin.blogdosantana.com.br', // Use o domínio exato que está no seu header de Origin
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  allowedHeaders: 'Content-Type, Accept, Authorization',
})
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
