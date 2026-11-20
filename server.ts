import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { initDatabase, dbPath } from './server/db.ts';
import { attachAuth } from './server/auth.ts';
import { apiRouter } from './server/routes.ts';
import { attachDuelWebSocketServer } from './server/duels.ts';
import { attachVirtualRoomWebSocketServer } from './server/virtualRooms.ts';

async function startServer() {
  if (process.argv.includes('--production')) {
    process.env.NODE_ENV = 'production';
  }

  initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));
  app.use(attachAuth);

  app.use('/api', apiRouter);

  // Manejo de rutas API inexistentes (404)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada (404).' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      console.warn(`[AVISO] La carpeta ${distDir} no existe. Ejecuta 'npm run build' antes de iniciar en producción.`);
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Frontend no compilado. Ejecuta `npm run build` primero.');
      }
    });
  }

  const httpServer = http.createServer(app);
  attachDuelWebSocketServer(httpServer);
  attachVirtualRoomWebSocketServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`A.B.A. Plataforma Educativa corriendo en http://localhost:${PORT} [modo: ${process.env.NODE_ENV || 'development'}]`);
    console.log(`Base de datos SQLite: ${dbPath}`);
  });
}

startServer().catch((err) => {
  console.error('Error iniciando el servidor A.B.A.:', err);
  process.exit(1);
});
