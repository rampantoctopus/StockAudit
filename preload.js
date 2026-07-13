// The app does all its XML/CSV parsing and xlsx building inside the renderer
// using bundled libraries. The privileged things it needs — the native
// "Save As" dialog + file write, and license/trial checks against Polar —
// have to happen in the main process. We expose a narrow set of methods for
// that instead of opening up broader fs/ipc/network access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockAudit', {
  // buffer: ArrayBuffer of the built .xlsx file, defaultName: suggested filename
  saveWorkbook: (buffer, defaultName) =>
    ipcRenderer.invoke('save-workbook', { buffer, defaultName }),

  getLicenseStatus: () => ipcRenderer.invoke('license-status'),
  activateLicense: (key) => ipcRenderer.invoke('license-activate', key),
  deactivateLicense: () => ipcRenderer.invoke('license-deactivate')
});
