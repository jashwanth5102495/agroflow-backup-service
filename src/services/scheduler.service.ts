import { env } from '../config/env';
import { runBackupJob } from '../services/backup.service';
import cron from 'node-cron';

const buildCronExpression = (hours: number): string => {
  if (hours <= 0 || hours > 24) {
    console.warn(`⚠️  Invalid BACKUP_INTERVAL_HOURS (${hours}). Defaulting to 6 hours.`);
    return '0 */6 * * *';
  }
  if (hours === 1) return '0 * * * *';
  return `0 */${hours} * * *`;
};

export const initScheduler = (onSyncComplete: (time: string) => void): void => {
  const intervalHours = env.BACKUP_INTERVAL_HOURS;
  const cronExpr = buildCronExpression(intervalHours);

  const now = new Date();
  const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

  console.log(`⏰ Backup Scheduler initialized`);
  console.log(`   Interval : Every ${intervalHours} hours`);
  console.log(`   Cron     : ${cronExpr}`);
  console.log(`   Next auto: ${nextRun.toISOString()}`);
  console.log('');

  // Schedule the recurring backup job
  cron.schedule(cronExpr, async () => {
    try {
      await runBackupJob();
      onSyncComplete(new Date().toISOString());
    } catch (err: any) {
      console.error('❌ Scheduled backup job crashed:', err.message);
      // Never exit — keep scheduler alive for next cycle
    }
  });

  // Run immediately on startup for a full initial sync
  console.log('🚀 Running initial full sync on startup...');
  runBackupJob()
    .then(() => onSyncComplete(new Date().toISOString()))
    .catch((err) => {
      console.error('❌ Initial sync failed:', err.message);
    });
};
