import { env } from './config/env';
import { connectDatabases } from './config/database';
import { initScheduler } from './services/scheduler.service';
import { startDashboardServer } from './services/dashboard.service';

// Shared state — scheduler updates these, dashboard reads them
let lastSyncTime: string | null = null;
let syncCount = 0;

export const updateSyncStats = (time: string) => {
  lastSyncTime = time;
  syncCount++;
};

export const getLastSyncTime = () => lastSyncTime;
export const getSyncCount = () => syncCount;

const startBackupService = async (): Promise<void> => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║       AgroFlow Backup Service v1.0.0          ║');
  console.log('║  🛡️  APPEND-ONLY — DATA IS NEVER DELETED     ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Mode     : ${env.NODE_ENV}`);
  console.log(`  Interval : Every ${env.BACKUP_INTERVAL_HOURS} hours`);
  console.log('');

  // Step 1: Connect to both databases
  await connectDatabases();

  // Step 2: Start the Express dashboard server (login + stats UI + health)
  startDashboardServer(getLastSyncTime, getSyncCount);

  // Step 3: Start the cron scheduler (also triggers first sync immediately)
  initScheduler(updateSyncStats);
};

startBackupService().catch((err: any) => {
  console.error('❌ Backup service failed to start:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Backup service shutting down (SIGTERM)...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Backup service shutting down (SIGINT)...');
  process.exit(0);
});

// Keep alive — never crash on unhandled errors
process.on('unhandledRejection', (err: any) => {
  console.error('⚠️  Unhandled Rejection (service kept alive):', err?.message || err);
});

process.on('uncaughtException', (err: any) => {
  console.error('⚠️  Uncaught Exception (service kept alive):', err?.message || err);
});
