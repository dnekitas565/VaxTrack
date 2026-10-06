import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { withConn, query } from './db.js';
import { errorHandler, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import newbornRoutes from './routes/newborns.js';
import doseRoutes from './routes/doses.js';
import inventoryRoutes from './routes/inventory.js';
import alertRoutes from './routes/alerts.js';
import reportRoutes from './routes/reports.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '20kb' }));

  // unauthenticated liveness check: proves the API can reach Oracle
  app.get('/health', async (_req, res) => {
    try {
      await withConn(null, (conn) => query(conn, 'SELECT 1 AS ok FROM dual'));
      res.json({ db: 'up' });
    } catch (err) {
      console.error('health check failed:', err.message);
      res.status(503).json({ db: 'down' });
    }
  });

  app.use(authRoutes); // /auth/login, /me
  app.use('/dashboard', dashboardRoutes);
  app.use('/newborns', newbornRoutes);
  app.use('/doses', doseRoutes);
  app.use('/inventory', inventoryRoutes);
  app.use('/alerts', alertRoutes);
  app.use(reportRoutes); // /reports/clinic-coverage, /audit, /clinics, /vaccines

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
