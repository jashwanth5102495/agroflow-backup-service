import mongoose from 'mongoose';
import { env } from './env';

let primaryConn: mongoose.Connection | null = null;
let backupConn: mongoose.Connection | null = null;
let isConnected = false;

// Mask password in URL for safe logging
const maskUrl = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    const short = url.substring(0, 40);
    return short + '...[masked]';
  }
};

const connectSingle = async (uri: string, name: string): Promise<mongoose.Connection> => {
  const trimmed = uri.trim();
  console.log(`🔌 Connecting to ${name}...`);
  console.log(`   URL preview: ${maskUrl(trimmed)}`);

  const conn = mongoose.createConnection(trimmed, {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
  });
  await conn.asPromise();
  return conn;
};

/**
 * Keeps retrying forever with exponential backoff.
 * Railway will never mark the service as crashed due to DB failure.
 */
export const connectDatabases = async (): Promise<void> => {
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      console.log(`\n🔄 Database connection attempt #${attempt}...`);

      primaryConn = await connectSingle(env.PRIMARY_MONGO_URI, 'Primary MongoDB');
      console.log('✅ Primary MongoDB connected!');

      backupConn = await connectSingle(env.BACKUP_MONGO_URI, 'Backup MongoDB (19Vo)');
      console.log('✅ Backup MongoDB connected!');

      isConnected = true;
      console.log('🎉 Both databases connected successfully!\n');
      return; // Success — exit the retry loop

    } catch (err: any) {
      isConnected = false;

      console.error(`\n❌ Connection attempt #${attempt} failed: ${err.message}`);
      console.error('📋 Check that your Railway Variables have valid URLs:');
      console.error('   PRIMARY_MONGO_URI  → Go to MongoDB → Variables → MONGO_PUBLIC_URL');
      console.error('   BACKUP_MONGO_URI   → Go to MongoDB-19Vo → Variables → MONGO_PUBLIC_URL');
      console.error('   URL must start with: mongodb://user:password@host:port');

      // Exponential backoff: 10s, 20s, 30s, 60s, 60s, 60s...
      const delay = Math.min(attempt * 10000, 60000);
      console.error(`⏳ Retrying in ${delay / 1000}s...\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

export const isDbConnected = () => isConnected;

export const getPrimaryConn = (): mongoose.Connection => {
  if (!primaryConn) throw new Error('Primary connection not initialized');
  return primaryConn;
};

export const getBackupConn = (): mongoose.Connection => {
  if (!backupConn) throw new Error('Backup connection not initialized');
  return backupConn;
};
