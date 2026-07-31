const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printReceipt: (printerName, receiptText) => ipcRenderer.invoke("print-receipt", { printerName, receiptText }),
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
});
