// Gives the CreativeFlow page a small, safe window into the desktop app: its version and
// automatic updates. The page checks for window.creativeflowDesktop, so the same page still
// works in a normal browser (where it doesn't exist).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('creativeflowDesktop', {
  appInfo: () => ipcRenderer.invoke('app-info'),
  getUpdateStatus: () => ipcRenderer.invoke('update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status)),
  // Google/Apple sign-in in the normal browser: open the page, then hear back when it returns.
  openSignIn: (url) => ipcRenderer.invoke('open-sign-in', url),
  onOAuthCallback: (callback) => ipcRenderer.on('oauth-callback', (_event, url) => callback(url))
});
