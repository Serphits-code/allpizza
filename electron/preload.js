const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  getNetworkIps: () => ipcRenderer.invoke("get-network-ips"),
  generateQr: (text) => ipcRenderer.invoke("generate-qr", text),
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  printReceipt: (printerName, receiptText) =>
    ipcRenderer.invoke("print-receipt", { printerName, receiptText }),
  printHtmlReceipt: (printerName, htmlContent) =>
    ipcRenderer.invoke("print-html-receipt", { printerName, htmlContent }),
  printQrFlyer: (printerName, tableNumber, qrDataUrl, mesaUrl) =>
    ipcRenderer.invoke("print-qr-flyer", { printerName, tableNumber, qrDataUrl, mesaUrl }),
  testPrint: (printerName, statusKey) =>
    ipcRenderer.invoke("test-print", { printerName, statusKey }),
});
