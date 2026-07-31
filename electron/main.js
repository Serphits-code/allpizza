const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const SETTINGS_PATH = path.join(__dirname, "printer-settings.json");

let mainWindow;

// Helper to load settings
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Erro ao carregar settings:", err);
  }
  return {
    serverUrl: "http://localhost:3000",
    configs: {}
  };
}

// Helper to save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Erro ao salvar settings:", err);
    return false;
  }
}

// Helper to print silently
function printSilently(printerName, receiptText) {
  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0; size: 80mm auto; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 1mm 2mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11.5px;
            font-weight: bold;
            line-height: 1.3;
            color: #000000;
            background-color: #ffffff;
            width: 76mm;
          }
          pre {
            margin: 0;
            padding: 0;
            white-space: pre;
            overflow: hidden;
            font-size: 11.5px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <pre>${receiptText}</pre>
      </body>
      </html>
    `;

    printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));

    printWindow.webContents.on("did-finish-load", () => {
      printWindow.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          margins: { marginType: "none" }
        },
        (success, errorType) => {
          printWindow.destroy();
          if (success) {
            resolve(true);
          } else {
            console.error(`[Electron Print] Falha na impressão: ${errorType}`);
            resolve(false);
          }
        }
      );
    });
  });
}

// Formatacao do cupom termico (largura 32 chars - compativel com 58mm em font 11.5px)
function formatThermalReceipt(order) {
  const W = 32; // largura total da linha
  const line   = "-".repeat(W) + "\n";
  const dline  = "=".repeat(W) + "\n";

  // Helper: formata valor monetario com seguranca (Prisma Decimal pode vir como string)
  const money = (v) => `R$${parseFloat(v || 0).toFixed(2)}`;

  // Helper: linha com label e valor alinhados nas extremidades
  const priceRow = (label, value) => {
    const valStr = money(value);  // ex: "R$71.00" (7 chars)
    const maxLabel = W - valStr.length - 1;
    const labelStr = label.substring(0, maxLabel);
    const spaces = W - labelStr.length - valStr.length;
    return labelStr + " ".repeat(Math.max(1, spaces)) + valStr + "\n";
  };

  // Helper: centraliza texto (trunca se for maior que W)
  const center = (text) => {
    const t = text.substring(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return " ".repeat(pad) + t + "\n";
  };

  // Helper: linha simples que nao ultrapassa W chars
  const row = (str) => str.substring(0, W) + "\n";

  let out = "";
  out += dline;
  out += center("ARTISANAL CRUST & EMBER");
  out += center("AllDelivery");
  out += dline;

  const dataStr = new Date(order.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  out += row(`Pedido: #${order.orderNumber}`);
  out += row(`Data  : ${dataStr}`);
  out += row(`Tipo  : ${order.type}`);
  out += row(`Pagto : ${order.paymentMethod}`);
  if (order.changeFor && parseFloat(order.changeFor) > 0) {
    out += row(`Troco : ${money(order.changeFor)}`);
  }

  out += line;
  out += row(`Cliente: ${order.customerName}`);
  out += row(`Tel    : ${order.customerPhone}`);
  if (order.customerAddress) {
    const addr = `${order.customerAddress}, ${order.addressNumber || ""}`;
    out += "Endereco:\n";
    out += row(`  ${addr}`);
    if (order.reference) out += row(`Ref: ${order.reference}`);
  }

  out += line;
  // Cabecalho da tabela de itens
  const hQty = "Qtd";
  const hPrice = "Preco";
  const hItem = "Item".padEnd(W - hQty.length - hPrice.length - 2, " ");
  out += `${hQty} ${hItem} ${hPrice}\n`;
  out += line;

  for (const item of order.items) {
    const qty   = String(item.quantity).padEnd(3, " ");
    const price = money(item.totalPrice);  // ex: "R$71.00"
    const nameMax = W - qty.length - price.length - 2;
    const name  = (item.name || "").substring(0, nameMax).padEnd(nameMax, " ");
    out += `${qty} ${name} ${price}\n`;

    if (item.isPizza && item.flavors && item.flavors.length > 0) {
      if (item.pizzaSize) out += row(`  Tam: ${item.pizzaSize} Borda: ${item.crustType || "Trad"}`);
      for (const f of item.flavors) {
        const fn = (f.flavorName || f.name || "").substring(0, W - 5);
        out += `  - ${fn}\n`;
      }
    }
  }

  out += line;
  out += priceRow("Subtotal", order.subtotal);
  if (parseFloat(order.deliveryFee || 0) > 0) {
    out += priceRow("Taxa Entrega", order.deliveryFee);
  }
  out += dline;
  out += priceRow("TOTAL", order.total);
  out += dline;

  if (order.notes) {
    out += "Obs:\n";
    // imprime observacoes em linhas de W chars
    const notes = order.notes;
    for (let i = 0; i < notes.length; i += W - 2) {
      out += `  ${notes.substring(i, i + W - 2)}\n`;
    }
    out += line;
  }

  out += "\n\n\n\n";
  return out;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: "AllDelivery | Central de Impressão Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Inicia servidor local de impressão na porta 3001
const localServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/print" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { order, status } = payload;
        const targetStatus = status || order.status;

        const settings = loadSettings();
        const config = settings.configs[targetStatus];

        if (config && config.printer) {
          const receiptText = formatThermalReceipt(order);
          const success = await printSilently(config.printer, receiptText);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Nenhuma impressora configurada para esta etapa" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

localServer.listen(3001, "localhost", () => {
  console.log("[Electron Server] Ouvindo comandos de impressão na porta 3001");
});

app.whenReady().then(() => {
  // IPC handlers
  ipcMain.handle("get-printers", async () => {
    if (!mainWindow) return [];
    try {
      return await mainWindow.webContents.getPrintersAsync();
    } catch (err) {
      console.error(err);
      return [];
    }
  });

  ipcMain.handle("print-receipt", async (event, { printerName, receiptText }) => {
    const success = await printSilently(printerName, receiptText);
    return { success };
  });

  ipcMain.handle("load-settings", () => {
    return loadSettings();
  });

  ipcMain.handle("save-settings", (event, settings) => {
    return saveSettings(settings);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
