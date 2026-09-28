import { getPrimaryConn, getBackupConn, isDbConnected } from '../config/database';

// ============================================================
//  SAFETY CONTRACT — PERMANENT, DO NOT MODIFY
//  1. NO DELETE operations — ever, on any database
//  2. NO UPDATE/REPLACE operations — ever
//  3. ONLY $setOnInsert + upsert:true (append if not exists)
//  4. If primary DB is temporarily down (e.g. during a main
//     backend deployment), the sync is SKIPPED gracefully.
//     The next scheduled run will catch up automatically.
//  5. New collections added to the main backend will be synced
//     automatically — add them to COLLECTIONS_TO_SYNC below.
// ============================================================

export const COLLECTIONS_TO_SYNC = [
  // Core business data
  'shops',
  'users',
  'sales',
  'purchases',
  'farmers',
  'products',
  'suppliers',
  'inventories',
  // Credit & financial data (NEVER deleted — critical for farmers)
  'creditaccounts',
  'credittransactions',
  // System data
  'notifications',
  'datarequests',
  // Add new collections here as the app grows
  // e.g. 'newcollection',
];

interface SyncResult {
  collection: string;
  read: number;
  inserted: number;
  skipped: number;
  error?: string;
}

let totalRunCount = 0;
let totalAllTimeInserted = 0;
let lastSuccessfulSync: string | null = null;

const syncCollection = async (collectionName: string): Promise<SyncResult> => {
  const result: SyncResult = { collection: collectionName, read: 0, inserted: 0, skipped: 0 };
  try {
    const primary = getPrimaryConn();
    const backup = getBackupConn();

    const documents = await primary.collection(collectionName).find({}).toArray();
    result.read = documents.length;
    if (documents.length === 0) return result;

    // Batch processing: 500 docs at a time to handle large collections
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      const ops = batch.map(doc => ({
        updateOne: {
          filter: { _id: doc._id },
          // SAFETY: $setOnInsert only runs if this is a NEW record.
          // Existing records are COMPLETELY IGNORED — never overwritten.
          update: { $setOnInsert: doc },
          upsert: true,
        },
      }));
      const r = await backup.collection(collectionName).bulkWrite(ops, { ordered: false });
      totalInserted += r.upsertedCount || 0;
    }

    result.inserted = totalInserted;
    result.skipped = documents.length - totalInserted;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
};

export const runBackupJob = async (): Promise<void> => {
  // ── Safety check: skip if DB is not connected ──────────────
  // This happens during main backend deployments or DB restarts.
  // We skip gracefully and the next scheduled run will catch up.
  if (!isDbConnected()) {
    console.log('⏭️  Backup job skipped — databases not connected yet. Will retry next cycle.');
    return;
  }

  totalRunCount++;
  const start = Date.now();
  const timestamp = new Date().toISOString();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  🔄 Backup Job #${totalRunCount} — ${timestamp}`);
  console.log('═══════════════════════════════════════════════');

  let totalRead = 0, totalInserted = 0, totalSkipped = 0, hasErrors = false;

  for (const col of COLLECTIONS_TO_SYNC) {
    process.stdout.write(`  📦 [${col.padEnd(22)}] ... `);
    const r = await syncCollection(col);
    totalRead += r.read;
    totalInserted += r.inserted;
    totalSkipped += r.skipped;
    if (r.error) {
      hasErrors = true;
      console.log(`❌ ${r.error}`);
    } else {
      console.log(`✅ ${r.read} read | ${r.inserted} new | ${r.skipped} safe`);
    }
  }

  totalAllTimeInserted += totalInserted;
  if (!hasErrors) lastSuccessfulSync = timestamp;

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log('───────────────────────────────────────────────');
  console.log(`  📊 Run #${totalRunCount} Summary:`);
  console.log(`     Read from Primary  : ${totalRead.toLocaleString()}`);
  console.log(`     New to Backup      : ${totalInserted.toLocaleString()}`);
  console.log(`     Already Safe       : ${totalSkipped.toLocaleString()}`);
  console.log(`     Duration           : ${duration}s`);
  console.log(`     All-time Backed Up : ${totalAllTimeInserted.toLocaleString()}`);
  console.log(`     Last Good Sync     : ${lastSuccessfulSync || 'N/A'}`);
  console.log(`  ${hasErrors ? '⚠️  COMPLETED WITH ERRORS' : '✅ ALL COLLECTIONS SYNCED SUCCESSFULLY'}`);
  console.log('═══════════════════════════════════════════════\n');
};

export const getLastSyncTime = () => lastSuccessfulSync;
export const getSyncCount = () => totalRunCount;
