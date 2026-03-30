import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import express, { type Express } from 'express';
import { copyFileSync, existsSync } from 'fs';
import helmet from 'helmet';
import hpp from 'hpp';
import { join } from 'path';
import { AppModule } from './app.module';
import { SanitizePipe } from './common/pipes/sanitize.pipe';

let cachedServer: Express | null = null;
let sqlitePrepared = false;

function prepareSqliteForVercelServerless() {
  const isVercel = process.env.VERCEL === '1';
  const dbUrl = process.env.DATABASE_URL ?? '';
  const isFileSqlite = dbUrl.startsWith('file:');

  if (!isVercel || !isFileSqlite || sqlitePrepared) {
    return;
  }

  // Vercel serverless filesystem is writable only under /tmp.
  const runtimeDbPath = '/tmp/vulnexa.db';
  const bundledDbPath = join(process.cwd(), 'prisma', 'dev.db');

  try {
    if (!existsSync(runtimeDbPath)) {
      if (!existsSync(bundledDbPath)) {
        throw new Error(`Bundled SQLite DB not found at ${bundledDbPath}`);
      }
      copyFileSync(bundledDbPath, runtimeDbPath);
    }
    process.env.DATABASE_URL = `file:${runtimeDbPath}`;
    sqlitePrepared = true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Unable to prepare SQLite database for serverless runtime: ${reason}`);
  }
}

export async function getServer(): Promise<Express> {
  if (cachedServer) {
    return cachedServer;
  }

  prepareSqliteForVercelServerless();

  const server = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    { bufferLogs: true },
  );

  const isProd = process.env.NODE_ENV === 'production';
  const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5500')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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

  app.use((err: unknown, _req: unknown, res: any, next: () => void) => {
    if ((err as { code?: string })?.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    return next();
  });

  app.enableCors({
    origin: (origin, callback) => {
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

  await app.init();
  cachedServer = server;
  return server;
}
