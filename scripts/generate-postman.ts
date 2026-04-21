import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import Converter from 'openapi-to-postmanv2';

async function generate() {
  // Minimal env so NestJS can boot without a real DB/SMTP
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://placeholder/placeholder';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'b'.repeat(32);
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'placeholder';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'placeholder';
  process.env.GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/auth/google/callback';
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? '587';
  process.env.SMTP_USER = process.env.SMTP_USER ?? 'placeholder';
  process.env.SMTP_PASS = process.env.SMTP_PASS ?? 'placeholder';
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@example.com';
  process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'docs', 'docs/(.*)', 'health/(.*)'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kanban API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const openApiPath = resolve(__dirname, '../kanban-openapi.json');
  writeFileSync(openApiPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI spec written to ${openApiPath}`);

  await app.close();

  Converter.convert(
    { type: 'json', data: document },
    { folderStrategy: 'Tags', optimizeConversion: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: Error | null, result: any) => {
      if (err || !result?.result) {
        console.error('Conversion failed:', err ?? result?.reason);
        process.exit(1);
      }

      const collectionPath = resolve(__dirname, '../kanban-postman.json');
      writeFileSync(collectionPath, JSON.stringify(result.output[0].data, null, 2));
      console.log(`Postman collection written to ${collectionPath}`);
    },
  );
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
