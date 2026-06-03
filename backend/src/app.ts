import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { customersRouter } from './routes/customers';
import { invoicesRouter } from './routes/invoices';
import { contextRouter } from './routes/context';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1', (_req, res) => {
    res.json({ service: 'healthpoints-backend', version: '0.1.0' });
  });

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/context', contextRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/invoices', invoicesRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
