import mongoose from 'mongoose';
import { env } from './env';

let primaryConn: mongoose.Connection | null = null;
let backupConn: mongoose.Connection | null = null;

// Mask password in URL for safe logging
const maskUrl = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return url.substring(0, 20) + '...[masked]';
  }
};

// Validate URL looks like a mongodb connection string
const validateMongoUri = (uri: string, name: string): void => {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
    throw new Error(
      `${name} does not look like a valid MongoDB URL. ` +
      `It must start with "mongodb://" or "mongodb+srv://". ` +
      `Got: "${trimmed.substring(0, 30)}..."`
    );
  }
};

const connectWithRetry = async (
  uri: string,
  name: string,
  maxRetries = 5
): Promise<mongoose.Connection> => {
  const trimmedUri = uri.trim(); // Remove accidental whitespace

  validateMongoUri(trimmedUri, name);
  console.log(`🔌 Connecting to ${name}...`);
  console.log(`   URL: ${maskUrl(trimmedUri)}`);

  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = mongoose.createConnection(trimmedUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 30000,
      });
      await conn.asPromise();
      console.log(`✅ ${name} connected successfully`);
      return conn;
    } catch (err: any) {
      lastError = err;
      console.error(`   ⚠️  Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = attempt * 3000; // 3s, 6s, 9s, 12s...
        console.log(`   ⏳ Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`${name} failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};

export const connectDatabases = async (): Promise<void> => {
  try {
    primaryConn = await connectWithRetry(env.PRIMARY_MONGO_URI, 'Primary MongoDB');
    backupConn = await connectWithRetry(env.BACKUP_MONGO_URI, 'Backup MongoDB');
  } catch (err: any) {
    console.error('\n❌ FATAL: Could not connect to databases.');
    console.error('   Error:', err.message);
    console.error('\n📋 Troubleshooting:');
    console.error('   1. Verify PRIMARY_MONGO_URI and BACKUP_MONGO_URI are set correctly in Railway Variables');
    console.error('   2. Make sure the URLs start with mongodb:// or mongodb+srv://');
    console.error('   3. If using Railway internal URLs (*.railway.internal), try the public URL instead');
    console.error('   4. Go to MongoDB → Connect → Public Network → Add Public Access → use MONGO_PUBLIC_URL');
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
