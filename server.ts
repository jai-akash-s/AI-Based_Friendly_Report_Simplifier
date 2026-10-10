import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FLASK_URL = process.env.FLASK_URL || 'http://127.0.0.1:5000';

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// Proxy all backend routes to Flask
const flaskProxy = createProxyMiddleware({
  target: FLASK_URL,
  changeOrigin: true,
  ws: false,
  on: {
    error: (err, _req, res: any) => {
      console.error('[Proxy Error] Could not connect to Flask API:', err.message);
      if (res && !res.headersSent && typeof res.status === 'function') {
        res.status(502).json({
          error: 'Backend API service is not reachable. Please verify the Flask server is running on port 5000.',
        });
      }
    },
  },
});

const isBackendRoute = (pathname: string): boolean => {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/patients' ||
    pathname.startsWith('/patients/') ||
    pathname === '/reports' ||
    pathname.startsWith('/reports/') ||
    pathname === '/upload' ||
    pathname.startsWith('/upload/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/logout' ||
    pathname === '/health'
  );
};

app.use((req, res, next) => {
  if (isBackendRoute(req.path)) {
    return flaskProxy(req, res, next);
  }
  return next();
});

// Body parsers for non-proxied routes
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Static and SPA Serving
async function setupViteOrStatic() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Web Server] Serving on http://localhost:${PORT} (proxying API to ${FLASK_URL})`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error('Failed to start server:', err);
});
