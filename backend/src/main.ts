import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import { existsSync, readFileSync } from 'fs';
import helmet from 'helmet';
import hpp from 'hpp';
import { AppModule } from './app.module';
import { SanitizePipe } from './common/pipes/sanitize.pipe';

async function bootstrap() {
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  const hasHttpsFiles =
    !!sslKeyPath &&
    !!sslCertPath &&
    existsSync(sslKeyPath) &&
    existsSync(sslCertPath);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    httpsOptions: hasHttpsFiles
      ? {
          key: readFileSync(sslKeyPath as string),
          cert: readFileSync(sslCertPath as string),
        }
      : undefined,
  });

  const isProd = process.env.NODE_ENV === 'production';
  const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5500')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const port = Number(process.env.PORT ?? 4000);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(hpp());
  app.use(cookieParser());
  app.use(
    csurf({
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProd,
      },
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    }),
  );

  app.use((err: unknown, _req: any, res: any, next: () => void) => {
    if ((err as { code?: string })?.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    return next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin or file:// style requests during local development.
      const isFileOrigin = origin === 'null';
      if (!origin || isFileOrigin) {
        callback(null, !isProd);
        return;
      }

      if (frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
    new SanitizePipe(),
  );

  await app.listen(port);
}

bootstrap();
