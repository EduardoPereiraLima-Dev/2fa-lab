import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('auth');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('2FA Lab API')
    .setDescription('Laboratório de autenticação 2FA com TOTP')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: 'index.html',
    fallthrough: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();