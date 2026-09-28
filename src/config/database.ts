import mongoose from 'mongoose';
import { env } from './env';

let primaryConn: mongoose.Connection | null = null;
let backupConn: mongoose.Connection | null = null;
let isConnected = false;

const maskUrl = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return url.substring(0, 40) + '...[masked]';
  }
};

const createConn = async (uri: string, name: string): Promise<mongoose.Connection> => {
  const trimmed = uri.trim();
  console.log(`🔌 Connecting to ${name}...`);
  console.log(`   URL: ${maskUrl(trimmed)}`);

  const conn = mongoose.createConnection(trimmed, {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
    // Auto-reconnect — critical for surviving main backend deployments
    heartbeatFrequencyMS: 10000,
  });

  // ── Connection event listeners ─────────────────────────────
  conn.on('connected', () => console.log(`✅ ${name}: Connected`));
  conn.on('disconnected', () => {
    console.warn(`⚠️  ${name}: Disconnected — Mongoose will auto-reconnect`);
    if (name === 'Primary MongoDB') isConnected = false;
  });
  conn.on('reconnected', () => {
    console.log(`🔄 ${name}: Reconnected successfully`);
    if (name === 'Primary MongoDB') isConnected = true;
  });
  conn.on('error', (err) => {
    // Log but never crash — backup must stay alive 24/7
    console.error(`❌ ${name} connection error (service stays alive): ${err.message}`);
  });

  await conn.asPromise();
  return conn;
};

/**
 * Connects to both databases with infinite retry.
 * Service NEVER crashes — it retries forever until URLs are correct.
 */
export const connectDatabases = async (): Promise<void> => {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      console.log(`\n🔄 Database connection attempt #${attempt}...`);
      primaryConn = await createConn(env.PRIMARY_MONGO_URI, 'Primary MongoDB');
      backupConn = await createConn(env.BACKUP_MONGO_URI, 'Backup MongoDB');
      isConnected = true;
      console.log('🎉 Both databases connected! Backup service is fully operational.\n');
      return;
    } catch (err: any) {
      isConnected = false;
      console.error(`\n❌ Attempt #${attempt} failed: ${err.message}`);
      console.error('   Check PRIMARY_MONGO_URI and BACKUP_MONGO_URI in Railway Variables');
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
