import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PRIMARY_MONGO_URI: process.env.PRIMARY_MONGO_URI || '',
  BACKUP_MONGO_URI: process.env.BACKUP_MONGO_URI || '',
  BACKUP_INTERVAL_HOURS: parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10),
  NODE_ENV: process.env.NODE_ENV || 'production',
};

if (!env.PRIMARY_MONGO_URI) {
  console.error('❌ FATAL: PRIMARY_MONGO_URI is not set. Backup service cannot start.');
  process.exit(1);
}

if (!env.BACKUP_MONGO_URI) {
  console.error('❌ FATAL: BACKUP_MONGO_URI is not set. Backup service cannot start.');
  process.exit(1);
}

if (env.PRIMARY_MONGO_URI === env.BACKUP_MONGO_URI) {
  console.error('❌ FATAL: PRIMARY_MONGO_URI and BACKUP_MONGO_URI are the same! This would corrupt your data. Please set two different MongoDB URLs.');
  process.exit(1);
}
