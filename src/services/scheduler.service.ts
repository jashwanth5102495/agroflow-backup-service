import cron from 'node-cron';
import { env } from '../config/env';
import { runBackupJob } from '../services/backup.service';

/**
 * Converts BACKUP_INTERVAL_HOURS into a valid cron expression.
 * Examples:
 *   6  hours → "0 */6 * * *"  (every 6 hours)
 *   12 hours → "0 */12 * * *" (every 12 hours)
 *   1  hour  → "0 * * * *"    (every hour)
 */
const buildCronExpression = (hours: number): string => {
  if (hours <= 0 || hours > 24) {
    console.warn(`⚠️  Invalid BACKUP_INTERVAL_HOURS (${hours}). Defaulting to 6 hours.`);
    return '0 */6 * * *';
  }
  return `0 */${hours} * * *`;
};

export const initScheduler = (): void => {
  const intervalHours = env.BACKUP_INTERVAL_HOURS;
  const cronExpr = buildCronExpression(intervalHours);

  console.log(`⏰ Backup Scheduler initialized`);
  console.log(`   Schedule: Every ${intervalHours} hours`);
  console.log(`   Cron:     ${cronExpr}`);
  console.log(`   Next run: in ~${intervalHours} hours`);
  console.log('');

  // Schedule the recurring backup job
  cron.schedule(cronExpr, async () => {
    try {
      await runBackupJob();
    } catch (err: any) {
      console.error('❌ Backup job crashed unexpectedly:', err.message);
      // Do NOT exit — keep the scheduler alive so next cycle still runs
    }
  });

  // Also run once immediately on startup to do an initial full sync
  console.log('🚀 Running initial backup sync on startup...');
  runBackupJob().catch((err) => {
    console.error('❌ Initial sync failed:', err.message);
  });
};
