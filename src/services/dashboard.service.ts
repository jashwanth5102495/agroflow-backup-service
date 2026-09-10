import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { getBackupConn } from '../config/database';

const ADMIN_ID = 'admin';
const ADMIN_PASSWORD = 'admin1234';

// Collections to display stats for
const COLLECTIONS = [
  'shops', 'users', 'sales', 'purchases', 'farmers',
  'products', 'suppliers', 'inventories',
  'creditaccounts', 'credittransactions', 'notifications', 'datarequests',
];

// Middleware: require login
const requireLogin = (req: Request, res: Response, next: NextFunction) => {
  if ((req.session as any).loggedIn) {
    return next();
  }
  res.redirect('/backup/login');
};

export const startDashboardServer = (lastSyncGetter: () => string | null, syncCountGetter: () => number): void => {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({
    secret: 'agroflow-backup-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
  }));

  // ─── LOGIN PAGE ───────────────────────────────────────────
  app.get('/backup/login', (req: Request, res: Response) => {
    const error = (req.query.error as string) || '';
    res.send(loginPage(error));
  });

  app.post('/backup/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (username === ADMIN_ID && password === ADMIN_PASSWORD) {
      (req.session as any).loggedIn = true;
      res.redirect('/backup');
    } else {
      res.redirect('/backup/login?error=Invalid+username+or+password');
    }
  });

  app.get('/backup/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {});
    res.redirect('/backup/login');
  });

  // ─── MAIN DASHBOARD ───────────────────────────────────────
  app.get('/backup', requireLogin, async (req: Request, res: Response) => {
    try {
      const backup = getBackupConn();
      const stats: { name: string; count: number }[] = [];
      let totalRecords = 0;

      for (const col of COLLECTIONS) {
        const count = await backup.collection(col).countDocuments();
        stats.push({ name: col, count });
        totalRecords += count;
      }

      const lastSync = lastSyncGetter() || 'Not yet synced';
      const syncCount = syncCountGetter();

      res.send(dashboardPage(stats, totalRecords, lastSync, syncCount));
    } catch (err: any) {
      res.status(500).send(`<h2 style="font-family:sans-serif;color:red">Error loading backup stats: ${err.message}</h2>`);
    }
  });

  // ─── API: JSON stats ──────────────────────────────────────
  app.get('/backup/api/stats', requireLogin, async (req: Request, res: Response) => {
    try {
      const backup = getBackupConn();
      const stats: Record<string, number> = {};
      let total = 0;
      for (const col of COLLECTIONS) {
        const count = await backup.collection(col).countDocuments();
        stats[col] = count;
        total += count;
      }
      res.json({
        status: 'healthy',
        lastSync: lastSyncGetter(),
        totalSyncRuns: syncCountGetter(),
        totalRecords: total,
        collections: stats,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Health check (no auth) ───────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'agroflow-backup-service', timestamp: new Date().toISOString() });
  });

  app.get('/', (_req: Request, res: Response) => res.redirect('/backup'));

  app.listen(PORT, () => {
    console.log(`🌐 Backup Dashboard running at http://localhost:${PORT}/backup`);
  });
};

// ─────────────────────────────────────────────────────────────
//  HTML Templates
// ─────────────────────────────────────────────────────────────

const loginPage = (error: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AgroFlow Backup — Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #0f1117 0%, #1a1f2e 50%, #0f1117 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1e2332;
      border: 1px solid #2d3348;
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo-icon {
      width: 60px; height: 60px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border-radius: 16px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 28px; margin-bottom: 16px;
    }
    h1 { color: #f1f5f9; font-size: 24px; font-weight: 700; }
    p.sub { color: #64748b; font-size: 14px; margin-top: 4px; }
    .badge {
      background: rgba(34,197,94,0.1);
      color: #22c55e;
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
      margin-top: 8px;
    }
    .error {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      color: #f87171;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .field { margin-bottom: 20px; }
    label { display: block; color: #94a3b8; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
    input {
      width: 100%;
      background: #0f1117;
      border: 1px solid #2d3348;
      border-radius: 8px;
      color: #f1f5f9;
      padding: 12px 16px;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #22c55e; }
    button {
      width: 100%;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
      margin-top: 8px;
    }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">🛡️</div>
      <h1>AgroFlow Backup</h1>
      <p class="sub">Secure Backup Dashboard</p>
      <span class="badge">🔒 Admin Access Only</span>
    </div>
    ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
    <form method="POST" action="/backup/login">
      <div class="field">
        <label>Admin Username</label>
        <input type="text" name="username" placeholder="Enter username" required autofocus/>
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" placeholder="Enter password" required/>
      </div>
      <button type="submit">🔓 Sign In to Dashboard</button>
    </form>
  </div>
</body>
</html>`;

const dashboardPage = (
  stats: { name: string; count: number }[],
  totalRecords: number,
  lastSync: string,
  syncCount: number
) => {
  const formattedDate = lastSync !== 'Not yet synced'
    ? new Date(lastSync).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not yet synced';

  const rows = stats.map(s => `
    <tr>
      <td><span class="col-dot"></span>${s.name}</td>
      <td class="count">${s.count.toLocaleString()}</td>
      <td><div class="bar-wrap"><div class="bar" style="width:${totalRecords > 0 ? Math.round((s.count/totalRecords)*100) : 0}%"></div></div></td>
      <td class="pct">${totalRecords > 0 ? ((s.count/totalRecords)*100).toFixed(1) : 0}%</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AgroFlow Backup Dashboard</title>
  <meta http-equiv="refresh" content="60"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #f1f5f9;
      min-height: 100vh;
    }
    header {
      background: #1e2332;
      border-bottom: 1px solid #2d3348;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 40px; height: 40px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
    }
    .brand-text h1 { font-size: 18px; font-weight: 700; }
    .brand-text p { font-size: 12px; color: #64748b; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live-badge {
      background: rgba(34,197,94,0.1);
      color: #22c55e;
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .live-dot {
      width: 8px; height: 8px;
      background: #22c55e;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    a.logout {
      color: #64748b;
      font-size: 13px;
      text-decoration: none;
      border: 1px solid #2d3348;
      padding: 6px 14px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    a.logout:hover { color: #f87171; border-color: #f87171; }
    main { padding: 32px; max-width: 1100px; margin: 0 auto; }
    h2.section { font-size: 20px; font-weight: 700; margin-bottom: 20px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card {
      background: #1e2332;
      border: 1px solid #2d3348;
      border-radius: 12px;
      padding: 20px 24px;
    }
    .card-label { font-size: 12px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 800; color: #f1f5f9; }
    .card-value.green { color: #22c55e; }
    .card-sub { font-size: 12px; color: #475569; margin-top: 4px; }
    .table-wrap {
      background: #1e2332;
      border: 1px solid #2d3348;
      border-radius: 12px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #161b27; }
    th { padding: 14px 20px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 14px 20px; border-top: 1px solid #2d3348; font-size: 14px; }
    tr:hover td { background: #1a2030; }
    .col-dot {
      width: 8px; height: 8px;
      background: #22c55e;
      border-radius: 50%;
      display: inline-block;
      margin-right: 10px;
    }
    .count { font-weight: 700; color: #22c55e; font-size: 16px; }
    .bar-wrap { background: #2d3348; border-radius: 4px; height: 6px; width: 200px; }
    .bar { background: linear-gradient(90deg, #22c55e, #16a34a); border-radius: 4px; height: 6px; transition: width 0.5s; }
    .pct { color: #64748b; font-size: 12px; }
    .refresh-note { text-align: center; color: #475569; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">🛡️</div>
      <div class="brand-text">
        <h1>AgroFlow Backup Dashboard</h1>
        <p>Secondary MongoDB Mirror — Read-only view</p>
      </div>
    </div>
    <div class="header-right">
      <span class="live-badge"><span class="live-dot"></span>LIVE</span>
      <a class="logout" href="/backup/logout">Sign Out</a>
    </div>
  </header>

  <main>
    <h2 class="section">Backup Database Overview</h2>
    <div class="cards">
      <div class="card">
        <div class="card-label">Total Records Backed Up</div>
        <div class="card-value green">${totalRecords.toLocaleString()}</div>
        <div class="card-sub">Across all collections</div>
      </div>
      <div class="card">
        <div class="card-label">Last Sync</div>
        <div class="card-value" style="font-size:18px">${formattedDate}</div>
        <div class="card-sub">Auto-refreshes every 60s</div>
      </div>
      <div class="card">
        <div class="card-label">Total Sync Runs</div>
        <div class="card-value">${syncCount}</div>
        <div class="card-sub">Since last deployment</div>
      </div>
      <div class="card">
        <div class="card-label">Collections Monitored</div>
        <div class="card-value">${stats.length}</div>
        <div class="card-sub">All data types covered</div>
      </div>
    </div>

    <h2 class="section">Collection Breakdown</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Collection</th>
            <th>Total Records</th>
            <th>Distribution</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <p class="refresh-note">🔄 Page auto-refreshes every 60 seconds &nbsp;·&nbsp; Data is append-only and never deleted</p>
  </main>
</body>
</html>`;
};
