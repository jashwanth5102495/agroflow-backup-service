import { getPrimaryConn, getBackupConn } from '../config/database';
import mongoose from 'mongoose';

// ============================================================
//  SAFETY CONTRACT — DO NOT MODIFY
//  This service operates under the following strict rules:
//  1. NO DELETE operations are ever performed on the backup DB.
//  2. NO UPDATE/REPLACE operations are ever performed.
//  3. ONLY $setOnInsert (upsert) is used — insert if not exists.
//  4. The backup connection is NEVER passed to any other module.
//  5. The primary connection is READ-ONLY from this service's perspective.
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

/**
 * Syncs a single collection from primary to backup.
 * SAFETY: Uses $setOnInsert so records that already exist
 * in the backup are NEVER touched or overwritten.
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
    // Read all documents from primary
    const primaryCollection = primary.collection(collectionName);
    const documents = await primaryCollection.find({}).toArray();
    result.read = documents.length;

    if (documents.length === 0) {
      return result;
    }

    // Write to backup using APPEND-ONLY bulk upsert
    const backupCollection = backup.collection(collectionName);
    const operations = documents.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          // $setOnInsert: only runs if this is a NEW insert.
          // If the document already exists, this entire block is IGNORED.
          $setOnInsert: doc,
        },
        upsert: true, // Insert if not found, but DO NOT update if found
      },
    }));

    const bulkResult = await backupCollection.bulkWrite(operations, {
      ordered: false, // Continue even if some ops fail
    });

    result.inserted = bulkResult.upsertedCount || 0;
    result.skipped = documents.length - result.inserted;
  } catch (err: any) {
    result.error = err.message;
    console.error(`  ⚠️  Error syncing [${collectionName}]: ${err.message}`);
  }

  return result;
};

/**
 * Main backup job — runs all collection syncs sequentially.
 * Called by the cron scheduler.
 */
export const runBackupJob = async (): Promise<void> => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log('\n');
  console.log('═══════════════════════════════════════════════');
  console.log(`  🔄 AgroFlow Backup Job Started`);
  console.log(`  📅 Time: ${timestamp}`);
  console.log('═══════════════════════════════════════════════');

  const results: SyncResult[] = [];
  let totalRead = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let hasErrors = false;

  for (const collection of COLLECTIONS_TO_SYNC) {
    process.stdout.write(`  📦 Syncing [${collection}]... `);
    const result = await syncCollection(collection);
    results.push(result);

    totalRead += result.read;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;

    if (result.error) {
      hasErrors = true;
      console.log(`❌ ERROR`);
    } else {
      console.log(`✅ ${result.read} read, ${result.inserted} new, ${result.skipped} already safe`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('───────────────────────────────────────────────');
  console.log(`  📊 Summary:`);
  console.log(`     Total Records Read from Primary: ${totalRead}`);
  console.log(`     New Records Inserted to Backup:  ${totalInserted}`);
  console.log(`     Records Already Safe (Skipped):  ${totalSkipped}`);
  console.log(`     Duration: ${duration}s`);

  if (hasErrors) {
    console.log(`  ⚠️  Status: COMPLETED WITH SOME ERRORS (check logs above)`);
  } else {
    console.log(`  ✅ Status: ALL COLLECTIONS SYNCED SUCCESSFULLY`);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('\n');
};
