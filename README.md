# AgroFlow Backup Service

A completely isolated, **read-only mirror service** for the AgroFlow database.

## What it does
- Connects to **two separate MongoDB databases** simultaneously.
- Every **6 hours** (configurable), it reads ALL records from the **Primary database**.
- It writes to the **Backup database** using an **append-only** strategy.
- Records that already exist in the backup are **never modified or deleted**.
- On first startup, it immediately runs a full sync.

## Safety Guarantees
- ❌ NO DELETE operations — ever.
- ❌ NO UPDATE or REPLACE operations — ever.
- ✅ ONLY `$setOnInsert` + `upsert: true` — inserts only if not already present.
- ✅ If the service crashes, the backup database is never left in a partial state.

## Environment Variables

Copy `.env.example` to `.env` and fill in your Railway URLs:

```env
PRIMARY_MONGO_URI=mongodb://...  # Your main Railway MongoDB URL
BACKUP_MONGO_URI=mongodb://...   # Your second Railway MongoDB URL
BACKUP_INTERVAL_HOURS=6          # How often to sync (default: 6)
NODE_ENV=production
```

> ⚠️ **IMPORTANT**: PRIMARY_MONGO_URI and BACKUP_MONGO_URI must be DIFFERENT.
> The service will refuse to start if they point to the same database.

## Railway Deployment Steps

1. Create a new **GitHub repository** called `agroflow-backup-service`.
2. Push this code to it.
3. In Railway, click **"+ New"** → **"GitHub Repo"** → select `agroflow-backup-service`.
4. Add the environment variables in Railway's **Variables** tab.
5. The service will start and immediately begin its first full sync.

## Logs

When running correctly, you will see:

```
╔═══════════════════════════════════════════════╗
║       AgroFlow Backup Service v1.0.0          ║
║  ⚠️  READ-ONLY MIRROR — NEVER MODIFIES DATA  ║
╚═══════════════════════════════════════════════╝

  Mode:     production
  Interval: Every 6 hours

🔌 Connecting to Primary MongoDB... ✅
🔌 Connecting to Backup MongoDB...  ✅
🚀 Running initial backup sync on startup...

═══════════════════════════════════════════════
  🔄 AgroFlow Backup Job Started
  📅 Time: 2026-09-10T07:00:00.000Z
═══════════════════════════════════════════════
  📦 Syncing [shops]...           ✅ 24 read, 0 new, 24 already safe
  📦 Syncing [users]...           ✅ 48 read, 0 new, 48 already safe
  📦 Syncing [sales]...           ✅ 3,421 read, 12 new, 3,409 already safe
  ...
───────────────────────────────────────────────
  📊 Summary:
     Total Records Read from Primary: 5,847
     New Records Inserted to Backup:  23
     Records Already Safe (Skipped):  5,824
     Duration: 4.32s
  ✅ Status: ALL COLLECTIONS SYNCED SUCCESSFULLY
═══════════════════════════════════════════════
```
