import { env } from './config/env';
import { connectDatabases } from './config/database';
import { initScheduler } from './services/scheduler.service';

const startBackupService = async (): Promise<void> => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║       AgroFlow Backup Service v1.0.0          ║');
  console.log('║  ⚠️  READ-ONLY MIRROR — NEVER MODIFIES DATA  ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Mode:     ${env.NODE_ENV}`);
  console.log(`  Interval: Every ${env.BACKUP_INTERVAL_HOURS} hours`);
  console.log('');

  // Connect to both databases before starting the scheduler
  await connectDatabases();

  // Initialize the cron scheduler (also runs first sync immediately)
  initScheduler();
};

// Start the service
startBackupService().catch((err: any) => {
  console.error('❌ Backup service failed to start:', err.message);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('\n🛑 Backup service shutting down gracefully (SIGTERM)...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Backup service shutting down gracefully (SIGINT)...');
  process.exit(0);
});

process.on('unhandledRejection', (err: any) => {
  console.error('❌ Unhandled Rejection in backup service:', err?.message || err);
  // Do NOT exit — keep the service alive
});

process.on('uncaughtException', (err: any) => {
  console.error('❌ Uncaught Exception in backup service:', err?.message || err);
  // Do NOT exit — keep the service alive
});
