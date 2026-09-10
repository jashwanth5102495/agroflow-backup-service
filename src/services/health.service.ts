import http from 'http';
import { getPrimaryConn, getBackupConn } from '../config/database';

let lastSyncTime: string | null = null;
let syncCount = 0;

export const updateHealthStats = (time: string) => {
  lastSyncTime = time;
  syncCount++;
};

/**
 * Lightweight HTTP health check server on port 3001.
 * Railway uses this to verify the service is alive.
 * Returns JSON with sync stats.
 */
export const startHealthServer = (): void => {
  const PORT = process.env.PORT || 3001;

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      let primaryStatus = 'disconnected';
      let backupStatus = 'disconnected';

      try {
        primaryStatus = getPrimaryConn().readyState === 1 ? 'connected' : 'disconnected';
        backupStatus = getBackupConn().readyState === 1 ? 'connected' : 'disconnected';
      } catch (_) {}

      const payload = JSON.stringify({
        service: 'agroflow-backup-service',
        status: primaryStatus === 'connected' && backupStatus === 'connected' ? 'healthy' : 'degraded',
        primaryDB: primaryStatus,
        backupDB: backupStatus,
        lastSyncTime: lastSyncTime || 'Not yet synced',
        totalSyncRuns: syncCount,
        uptime: Math.floor(process.uptime()) + 's',
        timestamp: new Date().toISOString(),
      }, null, 2);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(payload);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`🩺 Health check server running on port ${PORT}`);
    console.log(`   Visit /health to see backup service status`);
  });
};
