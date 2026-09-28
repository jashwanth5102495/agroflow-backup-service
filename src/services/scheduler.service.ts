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

export const initScheduler = (): void => {
  const intervalHours = env.BACKUP_INTERVAL_HOURS;
  const cronExpr = buildCronExpression(intervalHours);

  console.log(`⏰ Backup Scheduler initialized — Every ${intervalHours} hours (${cronExpr})`);

  cron.schedule(cronExpr, async () => {
    try {
      await runBackupJob();
    } catch (err: any) {
      console.error('❌ Scheduled backup job crashed (scheduler stays alive):', err.message);
    }
  });

  console.log('🚀 Running initial full sync on startup...');
  runBackupJob().catch((err) => console.error('❌ Initial sync failed:', err.message));
};
