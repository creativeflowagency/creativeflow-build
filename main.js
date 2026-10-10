// CreativeFlow desktop shell: serves the bundled web app from a fixed local address
// (so sign-in and saved data keep working between launches) and shows it in
// its own window.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Where new versions are published (see "publish" in package.json and scripts/publish-update.js).
const UPDATE_CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_UPDATE_CHECK_DELAY_MS = 8000;

// Testing only: CREATIVEFLOW_USER_DATA=<folder> keeps a test run's saved data away from the real app's.
if (process.env.CREATIVEFLOW_USER_DATA) app.setPath('userData', process.env.CREATIVEFLOW_USER_DATA);

const PORT = 47831;
const ROOT = path.join(__dirname, 'src');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.json': 'application/json'
};

const OAUTH_DONE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CreativeFlow</title>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E0D14;color:#fff;font:16px Helvetica,Arial,sans-serif;text-align:center">' +
  '<div><div style="font-size:22px;font-weight:700;margin-bottom:8px">Almost done</div>' +
  '<div style="color:#A6A3B3">Go back to the CreativeFlow app. You can close this tab.</div></div></body>';

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // Google/Apple sign-in happens in the person's normal browser, which comes back here when
      // done. The result goes to the app window, and the browser tab says it can be closed.
      if (urlPath === '/oauth-callback') {
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth-callback', `http://127.0.0.1:${PORT}${req.url}`);
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          if (process.platform === 'darwin') app.focus({ steal: true });
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(OAUTH_DONE_PAGE);
      }
      const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'slate.html' : urlPath));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0A0712',
    title: 'CreativeFlow',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadURL(`http://127.0.0.1:${PORT}/slate.html`);

  // Links that open a new window go to the normal browser instead
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- Automatic updates ----------
// Checks on launch and every few hours, downloads in the background, and tells the page
// ("update-status") so it can offer "Restart to update". Only runs in the installed app.
let updateStatus = { state: app.isPackaged ? 'idle' : 'dev' };

function setUpdateStatus(status) {
  updateStatus = status;
  if (win && !win.isDestroyed()) win.webContents.send('update-status', updateStatus);
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(err => setUpdateStatus({ state: 'error', message: String(err && err.message || err) }));
}

function setUpUpdates() {
  if (!app.isPackaged) return;
  // For testing against a local update server: CREATIVEFLOW_UPDATE_URL=http://127.0.0.1:8790/
  if (process.env.CREATIVEFLOW_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.CREATIVEFLOW_UPDATE_URL });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // a downloaded update also installs next time the app closes
  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'up-to-date', checkedAt: Date.now() }));
  autoUpdater.on('update-available', info => setUpdateStatus({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', p => setUpdateStatus({ ...updateStatus, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', info => setUpdateStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', err => setUpdateStatus({ state: 'error', message: String(err && err.message || err) }));
  setTimeout(checkForUpdates, FIRST_UPDATE_CHECK_DELAY_MS);
  setInterval(checkForUpdates, UPDATE_CHECK_EVERY_MS);
}

// Opens a Google/Apple sign-in page (started by Clerk) in the normal browser. Only the sign-in
// service's own addresses are allowed, so the page can't use this to open anything else.
ipcMain.handle('open-sign-in', (_e, url) => {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return false; }
  if (!/(^|\.)(creativeflow\.media|google\.com|apple\.com)$/.test(host)) return false;
  shell.openExternal(url);
  return true;
});
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform }));
ipcMain.handle('update-status', () => updateStatus);
ipcMain.handle('check-for-updates', () => { checkForUpdates(); return updateStatus; });
// Silent install, then reopen: a visible installer can sit waiting for a click with the app closed.
ipcMain.handle('install-update', () => { if (updateStatus.state === 'ready') autoUpdater.quitAndInstall(true, true); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(async () => {
    await startServer();
    createWindow();
    setUpUpdates();
  });
  app.on('window-all-closed', () => app.quit());
}
