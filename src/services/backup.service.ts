import mongoose from 'mongoose';
import { getPrimaryConn, getBackupConn } from '../config/database';

// ============================================================
//  SAFETY CONTRACT — DO NOT MODIFY
//  This service operates under the following strict rules:
//  1. NO DELETE operations are ever performed on the backup DB.
//  2. NO UPDATE/REPLACE operations are ever performed.
//  3. ONLY $setOnInsert (upsert) is used — insert if not exists.
//  4. The backup connection is NEVER passed to any other module.
//  5. The primary connection is READ-ONLY from this service.
// ============================================================

// Full list of all collections to mirror from primary to backup
const COLLECTIONS_TO_SYNC = [
  'shops',
  'users',
  'sales',
  'purchases',
  'farmers',
  'products',
  'suppliers',
  'inventories',
  'creditaccounts',
  'credittransactions',
  'notifications',
  'datarequests',
];

interface SyncResult {
  collection: string;
  read: number;
  inserted: number;
  skipped: number;
  error?: string;
}

// Track global stats across all runs
let totalRunCount = 0;
let totalRecordsSynced = 0;
let lastSuccessfulSync: string | null = null;

/**
 * Syncs a single collection from primary to backup.
 * SAFETY: Uses $setOnInsert so existing records in backup
 * are NEVER touched or overwritten — ever.
 */
const syncCollection = async (collectionName: string): Promise<SyncResult> => {
  const primary = getPrimaryConn();
  const backup = getBackupConn();

  const result: SyncResult = {
    collection: collectionName,
    read: 0,
    inserted: 0,
    skipped: 0,
  };

  try {
    // READ from primary
    const primaryCollection = primary.collection(collectionName);
    const documents = await primaryCollection.find({}).toArray();
    result.read = documents.length;

    if (documents.length === 0) {
      return result;
    }

    // WRITE to backup using APPEND-ONLY bulk upsert
    const backupCollection = backup.collection(collectionName);

    // Process in batches of 500 to avoid memory issues with large collections
    const BATCH_SIZE = 500;
    let totalInserted = 0;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      const operations = batch.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            // $setOnInsert: ONLY runs if this is a brand new insert.
            // If document already exists → this block is COMPLETELY IGNORED.
            $setOnInsert: doc,
          },
          upsert: true,
        },
      }));

      const bulkResult = await backupCollection.bulkWrite(operations, {
        ordered: false, // Continue even if individual ops fail
      });

      totalInserted += bulkResult.upsertedCount || 0;
    }

    result.inserted = totalInserted;
    result.skipped = documents.length - result.inserted;
  } catch (err: any) {
    result.error = err.message;
    console.error(`  ⚠️  Error syncing [${collectionName}]: ${err.message}`);
  }

  return result;
};

/**
 * Main backup job — syncs all collections from primary to backup.
 * Called by the cron scheduler every N hours.
 */
export const runBackupJob = async (): Promise<void> => {
  totalRunCount++;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log('\n');
  console.log('═══════════════════════════════════════════════');
  console.log(`  🔄 AgroFlow Backup Job #${totalRunCount}`);
  console.log(`  📅 Time: ${timestamp}`);
  console.log('═══════════════════════════════════════════════');

  let totalRead = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let hasErrors = false;

  for (const collection of COLLECTIONS_TO_SYNC) {
    process.stdout.write(`  📦 Syncing [${collection.padEnd(20)}] ... `);
    const result = await syncCollection(collection);

    totalRead += result.read;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;

    if (result.error) {
      hasErrors = true;
      console.log(`❌ ERROR: ${result.error}`);
    } else {
      console.log(`✅ ${result.read} read | ${result.inserted} new | ${result.skipped} already safe`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  totalRecordsSynced += totalInserted;

  if (!hasErrors) {
    lastSuccessfulSync = timestamp;
  }

  console.log('───────────────────────────────────────────────');
  console.log(`  📊 Run #${totalRunCount} Summary:`);
  console.log(`     Records Read from Primary DB : ${totalRead.toLocaleString()}`);
  console.log(`     New Records Added to Backup  : ${totalInserted.toLocaleString()}`);
  console.log(`     Already Safe (Skipped)        : ${totalSkipped.toLocaleString()}`);
  console.log(`     Duration                      : ${duration}s`);
  console.log(`     All-time records synced       : ${totalRecordsSynced.toLocaleString()}`);
  console.log(`     Last successful sync          : ${lastSuccessfulSync || 'N/A'}`);

  if (hasErrors) {
    console.log(`  ⚠️  Status: COMPLETED WITH ERRORS — backup still partially safe`);
  } else {
    console.log(`  ✅ Status: ALL COLLECTIONS SYNCED SUCCESSFULLY`);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('\n');
};
