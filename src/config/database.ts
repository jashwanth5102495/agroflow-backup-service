import mongoose from 'mongoose';
import { env } from './env';

let primaryConn: mongoose.Connection | null = null;
let backupConn: mongoose.Connection | null = null;

export const connectDatabases = async (): Promise<void> => {
  try {
    console.log('🔌 Connecting to Primary MongoDB...');
    primaryConn = mongoose.createConnection(env.PRIMARY_MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    await primaryConn.asPromise();
    console.log('✅ Primary MongoDB connected');

    console.log('🔌 Connecting to Backup MongoDB...');
    backupConn = mongoose.createConnection(env.BACKUP_MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    await backupConn.asPromise();
    console.log('✅ Backup MongoDB connected');
  } catch (err: any) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
};

export const getPrimaryConn = (): mongoose.Connection => {
  if (!primaryConn) throw new Error('Primary connection not initialized');
  return primaryConn;
};

export const getBackupConn = (): mongoose.Connection => {
  if (!backupConn) throw new Error('Backup connection not initialized');
  return backupConn;
};
