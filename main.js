const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { Licensing } = require('./lib/licensing');

let licensing = null;

function createWindow(){
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 780,
    minHeight: 600,
    backgroundColor: '#15181c',
    title: 'StockAudit',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Keep the default browser-style shortcuts (reload, devtools) but skip a full menu bar clutter
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Handles the "Save workbook" flow from the renderer: shows a native Save As
// dialog, then writes the xlsx bytes to whatever path the user picked.
// Gated by the trial/license check — if the trial is exhausted and there's
// no active license, this returns { trialExhausted: true, status } instead
// of ever opening a dialog, mirroring XML2Excel's 402 response.
ipcMain.handle('save-workbook', async (event, { buffer, defaultName }) => {
  if (!licensing.canUse()) {
    return { trialExhausted: true, status: licensing.getStatus() };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save workbook',
    defaultPath: defaultName || 'stock_audit_report.xlsx',
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });

  if (canceled || !filePath) return { canceled: true };

  await fs.writeFile(filePath, Buffer.from(buffer));
  licensing.recordSuccessfulUse();
  return { canceled: false, filePath, status: licensing.getStatus() };
});

ipcMain.handle('license-status', () => licensing.getStatus());

ipcMain.handle('license-activate', (event, key) => licensing.activate(key));

ipcMain.handle('license-deactivate', () => licensing.deactivate());

app.whenReady().then(() => {
  licensing = new Licensing(app.getPath('userData'));
  licensing.revalidateIfDue().catch(() => {});

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
