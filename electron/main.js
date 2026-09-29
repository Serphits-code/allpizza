const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
const QRCode = require("qrcode");

const SETTINGS_PATH = path.join(__dirname, "printer-settings.json");

let mainWindow;

// Helper to load settings
function loadSettings() {
  const defaultSettings = {
    serverUrl: "http://localhost:3000",
    apiKey: "alldelivery_internal_print_secret",
    soundEnabled: true,
    configs: {
      NOVO: { printer: "", auto: false, copies: 1, layout: "caixa" },
      EM_PREPARO: { printer: "", auto: true, copies: 1, layout: "cozinha" },
      PRONTO_RETIRADA: { printer: "", auto: false, copies: 1, layout: "balcao" },
      EM_ROTA: { printer: "", auto: false, copies: 1, layout: "entrega" },
      ENTREGUE: { printer: "", auto: false, copies: 1, layout: "caixa" },
    },
  };

  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
      return {
        ...defaultSettings,
        ...parsed,
        configs: {
          ...defaultSettings.configs,
          ...(parsed.configs || {}),
        },
      };
    }
  } catch (err) {
    console.error("Erro ao carregar printer-settings.json:", err);
  }
  return defaultSettings;
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

// Retorna os IPs da rede local (priorizando Wi-Fi ou Ethernet)
function getNetworkIps() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        // Filtra endereços APIPA (169.254.x.x) e interfaces virtuais/VPN
        if (net.address.startsWith("169.254.")) continue;
        const nameLower = name.toLowerCase();
        if (nameLower.includes("tailscale") || nameLower.includes("vmware") ||
            nameLower.includes("virtualbox") || nameLower.includes("docker") ||
            nameLower.includes("vethernet")) continue;

        const isWifi =
          nameLower.includes("wi-fi") ||
          nameLower.includes("wlan") ||
          nameLower.includes("wireless");

        results.push({
          name,
          address: net.address,
          isWifi,
        });
      }
    }
  }

  // Ordena para que Wi-Fi venha primeiro se disponível
  results.sort((a, b) => (b.isWifi ? 1 : 0) - (a.isWifi ? 1 : 0));
  return results;
}

// Janela de impressão reutilizável para economizar memória e evitar spawning contínuo do Chromium
let sharedPrintWindow = null;

function getSharedPrintWindow() {
  if (!sharedPrintWindow || sharedPrintWindow.isDestroyed()) {
    sharedPrintWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
  }
  return sharedPrintWindow;
}

// Impressão silenciosa usando janela oculta reutilizável
function printHtmlSilently(printerName, htmlContent) {
  return new Promise((resolve) => {
    const printWindow = getSharedPrintWindow();

    printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));

    printWindow.webContents.once("did-finish-load", () => {
      // Se não especificou impressora, usa a padrão do sistema
      const printOptions = {
        silent: true,
        margins: { marginType: "none" },
      };

      if (printerName && printerName.trim()) {
        printOptions.deviceName = printerName.trim();
      }

      printWindow.webContents.print(printOptions, (success, errorType) => {
        if (success) {
          resolve(true);
        } else {
          console.error(`[Electron Print] Falha na impressão: ${errorType}`);
          resolve(false);
        }
      });
    });
  });
}

// Imprime texto térmico monoespaçado
// Imprime texto térmico ou documento HTML
function printSilently(printerName, content) {
  if (typeof content === "string" && (content.includes("<!DOCTYPE html") || content.includes("<html"))) {
    return printHtmlSilently(printerName, content);
  }
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
          padding: 1.5mm 2mm;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 11.5px;
          font-weight: bold;
          line-height: 1.25;
          color: #000000;
          background-color: #ffffff;
          width: 76mm;
        }
        pre {
          margin: 0;
          padding: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 11.5px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <pre>${content}</pre>
    </body>
    </html>
  `;
  return printHtmlSilently(printerName, htmlContent);
}

// Analisador inteligente de sabores e fatias da pizza (compatível com Garçom, QR Code Mesa e Delivery)
function parsePizzaFlavorsWithSlices(item) {
  const size = (item.pizzaSize || "G").toUpperCase();
  const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
  const rawFlavors = item.flavors || [];

  let list = [];
  if (rawFlavors.length > 0) {
    list = rawFlavors.map((f, idx) => {
      const raw = (typeof f === "string" ? f : (f.flavorName || f.name || "")).trim();
      let slices = typeof f.slices === "number" && f.slices > 0 ? f.slices : null;
      if (!slices) {
        const m = raw.match(/^(\d+)\s*fatias?/i) || raw.match(/\((\d+)\s*fatias?\)/i);
        if (m) slices = parseInt(m[1], 10);
      }
      if (!slices && item.name) {
        const cleanTest = raw.replace(/^\d+\s*fatias?\s*/i, "").trim();
        const safe = cleanTest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m2 = item.name.match(new RegExp("(\\d+)\\s*fatias?\\s+(?:de\\s+)?" + safe, "i"));
        if (m2) slices = parseInt(m2[1], 10);
      }
      const cleanName = raw
        .replace(/^\d+\s*fatias?\s*(?:de\s*)?[-–—:]?\s*/i, "")
        .replace(/\s*\(\d+\s*fatias?\)$/i, "")
        .trim() || `Sabor ${idx + 1}`;
      return { cleanName, slices, raw };
    });
  } else if (item.name) {
    const matchParen = item.name.match(/\(([^)]+)\)/);
    if (matchParen) {
      const parts = matchParen[1].split(/\s*[\/+]\s*/);
      list = parts.map((p, idx) => {
        const raw = p.trim();
        const m = raw.match(/^(\d+)\s*fatias?\s*(?:de\s*)?(.*)/i);
        if (m) return { cleanName: m[2].trim(), slices: parseInt(m[1], 10), raw };
        return { cleanName: raw || `Sabor ${idx + 1}`, slices: null, raw };
      });
    }
  }

  if (list.length === 0) {
    list = [{ cleanName: item.name || "Pizza Inteira", slices: totalSlices, raw: item.name }];
  }

  // Se algum sabor ficou sem número de fatias, faz a distribuição proporcional padrão
  const assigned = list.reduce((acc, f) => acc + (f.slices || 0), 0);
  const unassigned = list.filter((f) => !f.slices);
  if (unassigned.length > 0) {
    const remaining = Math.max(0, totalSlices - assigned);
    if (list.length === 2 && !list[0].slices && !list[1].slices) {
      const half = Math.floor(totalSlices / 2);
      list[0].slices = half;
      list[1].slices = totalSlices - half;
    } else if (list.length === 3 && unassigned.length === 3) {
      if (totalSlices === 6) { list[0].slices = 2; list[1].slices = 2; list[2].slices = 2; }
      else if (totalSlices === 8) { list[0].slices = 3; list[1].slices = 3; list[2].slices = 2; }
      else { list[0].slices = 4; list[1].slices = 3; list[2].slices = 3; }
    } else {
      const per = Math.max(1, Math.floor(remaining / unassigned.length));
      unassigned.forEach((f, idx) => {
        f.slices = idx === unassigned.length - 1 ? (remaining - per * (unassigned.length - 1)) : per;
      });
    }
  }

  return { totalSlices, flavors: list };
}

// Gera o diagrama completo da pizza com setores, fatias em negrito e callouts diagonais com adicionais
function generatePizzaCalloutSvgReceipt(item, options = {}) {
  const { totalSlices, flavors } = parsePizzaFlavorsWithSlices(item);
  const isDarkUi = Boolean(options.dark);

  const strokeColor = isDarkUi ? "#ffffff" : "#000000";
  const crustColor = isDarkUi ? "#d97706" : "#000000";
  const numColor = isDarkUi ? "#ffffff" : "#000000";
  const textColor = isDarkUi ? "#ffffff" : "#000000";
  const toppingColor = isDarkUi ? "#34d399" : "#000000";
  const pointerColor = isDarkUi ? "#e31837" : "#000000";

  // Mapeia adicionais por sabor e inteira
  const toppingsByFlavor = {};
  const fullToppings = [];

  (item.toppings || []).forEach((t) => {
    const tName = t.toppingName || t.name || "";
    if (t.targetType === "FULL" || t.targetType === "INTEIRA" || !t.flavorName) {
      fullToppings.push(tName);
    } else {
      const target = (t.flavorName || "").toLowerCase().replace(/^\d+\s*fatias?\s*/i, "").trim();
      const matched = flavors.find((f) => {
        const fn = f.cleanName.toLowerCase().replace(/^\d+\s*fatias?\s*/i, "").trim();
        return fn === target || fn.includes(target) || target.includes(fn);
      });
      const key = matched ? matched.cleanName : flavors[0]?.cleanName || "default";
      if (!toppingsByFlavor[key]) toppingsByFlavor[key] = [];
      toppingsByFlavor[key].push(tName);
    }
  });

  const width = 290;
  const cx = 145;
  const cy = 75;
  const r = 38;

  const count = flavors.length;
  let leftFlavors = [];
  let rightFlavors = [];

  if (count <= 1) {
    rightFlavors = [{ ...flavors[0], sectorAngle: 0, toppings: toppingsByFlavor[flavors[0]?.cleanName] || [] }];
  } else if (count === 2) {
    leftFlavors = [{ ...flavors[0], sectorAngle: 180, toppings: toppingsByFlavor[flavors[0]?.cleanName] || [] }];
    rightFlavors = [{ ...flavors[1], sectorAngle: 0, toppings: toppingsByFlavor[flavors[1]?.cleanName] || [] }];
  } else if (count === 3) {
    leftFlavors = [{ ...flavors[0], sectorAngle: 180, toppings: toppingsByFlavor[flavors[0]?.cleanName] || [] }];
    rightFlavors = [
      { ...flavors[1], sectorAngle: 320, toppings: toppingsByFlavor[flavors[1]?.cleanName] || [] },
      { ...flavors[2], sectorAngle: 50, toppings: toppingsByFlavor[flavors[2]?.cleanName] || [] },
    ];
  } else {
    leftFlavors = [
      { ...flavors[0], sectorAngle: 225, toppings: toppingsByFlavor[flavors[0]?.cleanName] || [] },
      { ...flavors[1], sectorAngle: 135, toppings: toppingsByFlavor[flavors[1]?.cleanName] || [] },
    ];
    rightFlavors = [
      { ...flavors[2], sectorAngle: 315, toppings: toppingsByFlavor[flavors[2]?.cleanName] || [] },
      { ...flavors[3], sectorAngle: 45, toppings: toppingsByFlavor[flavors[3]?.cleanName] || [] },
    ];
  }

  // Calcula altura dinamica para comportar perfeitamente todos os adicionais
  let maxY = 145;
  leftFlavors.forEach((f, i) => {
    const callY = leftFlavors.length === 1 ? cy : (i === 0 ? cy - 26 : cy + 32);
    const bottom = callY + 12 + (f.toppings.length * 10);
    if (bottom > maxY) maxY = bottom;
  });
  rightFlavors.forEach((f, i) => {
    const callY = rightFlavors.length === 1 ? cy : (i === 0 ? cy - 26 : cy + 32);
    const bottom = callY + 12 + (f.toppings.length * 10);
    if (bottom > maxY) maxY = bottom;
  });
  const height = maxY + 8;

  const getFontSize = (txt) => {
    if (!txt) return 10;
    if (txt.length > 17) return 8;
    if (txt.length > 13) return 9;
    return 10;
  };

  let svgElements = "";

  // Borda da pizza
  svgElements += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${isDarkUi ? "#201810" : "#ffffff"}" stroke="${crustColor}" stroke-width="2.5" />`;
  svgElements += `<circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="${crustColor}" stroke-width="0.8" stroke-dasharray="2,2" />`;

  // Divisórias dos setores e números de fatias
  if (count <= 1) {
    const s = flavors[0]?.slices || totalSlices;
    svgElements += `
      <text x="${cx}" y="${cy - 3}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="20" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${s}</text>
      <text x="${cx}" y="${cy + 10}" font-family="Arial, sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
  } else if (count === 2) {
    svgElements += `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${strokeColor}" stroke-width="2" />`;
    svgElements += `
      <text x="${cx - 17}" y="${cy - 3}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${flavors[0].slices}</text>
      <text x="${cx - 17}" y="${cy + 10}" font-family="Arial, sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
    svgElements += `
      <text x="${cx + 17}" y="${cy - 3}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${flavors[1].slices}</text>
      <text x="${cx + 17}" y="${cy + 10}" font-family="Arial, sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
  } else if (count === 3) {
    svgElements += `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy}" stroke="${strokeColor}" stroke-width="2" />`;
    svgElements += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(0.2 * Math.PI)}" y2="${cy + r * Math.sin(0.2 * Math.PI)}" stroke="${strokeColor}" stroke-width="2" />`;
    svgElements += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(0.68 * Math.PI)}" y2="${cy + r * Math.sin(0.68 * Math.PI)}" stroke="${strokeColor}" stroke-width="2" />`;

    svgElements += `
      <text x="${cx - 18}" y="${cy - 3}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="17" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${flavors[0].slices}</text>
      <text x="${cx - 18}" y="${cy + 11}" font-family="Arial, sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
    svgElements += `
      <text x="${cx + 16}" y="${cy - 15}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="15" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${flavors[1].slices}</text>
      <text x="${cx + 16}" y="${cy - 3}" font-family="Arial, sans-serif" font-size="7" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
    svgElements += `
      <text x="${cx + 14}" y="${cy + 15}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="15" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${flavors[2].slices}</text>
      <text x="${cx + 14}" y="${cy + 26}" font-family="Arial, sans-serif" font-size="7" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
    `;
  } else {
    const total = flavors.reduce((a, f) => a + f.slices, 0) || totalSlices;
    let curr = -90;
    flavors.forEach((f) => {
      const sweep = (f.slices / total) * 360;
      const rad = (curr * Math.PI) / 180;
      svgElements += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(rad)}" y2="${cy + r * Math.sin(rad)}" stroke="${strokeColor}" stroke-width="2" />`;
      const mid = ((curr + sweep / 2) * Math.PI) / 180;
      const tx = cx + r * 0.55 * Math.cos(mid);
      const ty = cy + r * 0.55 * Math.sin(mid);
      svgElements += `
        <text x="${tx}" y="${ty - 3}" font-family="'Arial Black', Impact, Arial, sans-serif" font-size="14" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">${f.slices}</text>
        <text x="${tx}" y="${ty + 8}" font-family="Arial, sans-serif" font-size="6.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${numColor}">FAT</text>
      `;
      curr += sweep;
    });
  }

  // Ponto central da pizza
  svgElements += `<circle cx="${cx}" cy="${cy}" r="3" fill="${crustColor}" />`;

  // CALLOUTS LADO ESQUERDO (Linha diagonal/apontador + Linha horizontal abaixo do sabor + Adicionais com +)
  if (leftFlavors.length === 1) {
    const f = leftFlavors[0];
    const callY = cy;
    const px = cx - r;
    const py = cy;
    const lineEndX = cx - r - 4;
    const maxTxt = Math.max(f.cleanName.length * 7.2, ...f.toppings.map(t => (t.length + 1) * 6.2), 40);
    const lineStartX = Math.max(5, lineEndX - maxTxt - 6);
    const fSize = getFontSize(f.cleanName);

    svgElements += `<polyline points="${px},${py} ${lineEndX},${callY} ${lineStartX},${callY}" stroke="${pointerColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
    svgElements += `<text x="${lineStartX + 1}" y="${callY - 3}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="${fSize}" font-weight="900" fill="${textColor}" text-anchor="start">${f.cleanName.toUpperCase()}</text>`;

    f.toppings.forEach((top, idx) => {
      svgElements += `<text x="${lineStartX + 2}" y="${callY + 11 + idx * 10}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="8" font-weight="bold" fill="${toppingColor}" text-anchor="start">+${top.toUpperCase()}</text>`;
    });
  } else if (leftFlavors.length > 1) {
    leftFlavors.forEach((f, i) => {
      const callY = i === 0 ? cy - 24 : cy + 30;
      const rad = (f.sectorAngle * Math.PI) / 180;
      const px = cx + r * Math.cos(rad);
      const py = cy + r * Math.sin(rad);
      const lineEndX = cx - r - 4;
      const maxTxt = Math.max(f.cleanName.length * 7.2, ...f.toppings.map(t => (t.length + 1) * 6.2), 40);
      const lineStartX = Math.max(5, lineEndX - maxTxt - 6);
      const fSize = getFontSize(f.cleanName);

      svgElements += `<polyline points="${px.toFixed(1)},${py.toFixed(1)} ${lineEndX},${callY} ${lineStartX},${callY}" stroke="${pointerColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
      svgElements += `<text x="${lineStartX + 1}" y="${callY - 3}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="${fSize}" font-weight="900" fill="${textColor}" text-anchor="start">${f.cleanName.toUpperCase()}</text>`;

      f.toppings.forEach((top, idx) => {
        svgElements += `<text x="${lineStartX + 2}" y="${callY + 11 + idx * 10}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="8" font-weight="bold" fill="${toppingColor}" text-anchor="start">+${top.toUpperCase()}</text>`;
      });
    });
  }

  // CALLOUTS LADO DIREITO (Linha diagonal/apontador + Linha horizontal abaixo do sabor + Adicionais com +)
  if (rightFlavors.length === 1) {
    const f = rightFlavors[0];
    const callY = cy;
    const px = cx + r;
    const py = cy;
    const lineStartX = cx + r + 4;
    const maxTxt = Math.max(f.cleanName.length * 7.2, ...f.toppings.map(t => (t.length + 1) * 6.2), 40);
    const lineEndX = Math.min(width - 5, lineStartX + maxTxt + 6);
    const fSize = getFontSize(f.cleanName);

    svgElements += `<polyline points="${px},${py} ${lineStartX},${callY} ${lineEndX},${callY}" stroke="${pointerColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
    svgElements += `<text x="${lineStartX + 1}" y="${callY - 3}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="${fSize}" font-weight="900" fill="${textColor}" text-anchor="start">${f.cleanName.toUpperCase()}</text>`;

    f.toppings.forEach((top, idx) => {
      svgElements += `<text x="${lineStartX + 2}" y="${callY + 11 + idx * 10}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="8" font-weight="bold" fill="${toppingColor}" text-anchor="start">+${top.toUpperCase()}</text>`;
    });
  } else if (rightFlavors.length > 1) {
    rightFlavors.forEach((f, i) => {
      const callY = i === 0 ? cy - 24 : cy + 30;
      const rad = (f.sectorAngle * Math.PI) / 180;
      const px = cx + r * Math.cos(rad);
      const py = cy + r * Math.sin(rad);
      const lineStartX = cx + r + 4;
      const maxTxt = Math.max(f.cleanName.length * 7.2, ...f.toppings.map(t => (t.length + 1) * 6.2), 40);
      const lineEndX = Math.min(width - 5, lineStartX + maxTxt + 6);
      const fSize = getFontSize(f.cleanName);

      svgElements += `<polyline points="${px.toFixed(1)},${py.toFixed(1)} ${lineStartX},${callY} ${lineEndX},${callY}" stroke="${pointerColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
      svgElements += `<text x="${lineStartX + 1}" y="${callY - 3}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="${fSize}" font-weight="900" fill="${textColor}" text-anchor="start">${f.cleanName.toUpperCase()}</text>`;

      f.toppings.forEach((top, idx) => {
        svgElements += `<text x="${lineStartX + 2}" y="${callY + 11 + idx * 10}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="8" font-weight="bold" fill="${toppingColor}" text-anchor="start">+${top.toUpperCase()}</text>`;
      });
    });
  }

  const pizzaSvg = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block; margin: 2px auto;">
      ${svgElements}
    </svg>
  `;

  return { totalSlices, flavors, fullToppings, pizzaSvg };
}

// Formatador de cupom térmico completo com Pizza Dinâmica e alta legibilidade
function formatThermalReceipt(order, layout = "completo") {
  const isTable = order.type === "COMANDA" || Boolean(order.comandaId);
  const tableNum = order.comanda?.number || order.comandaNumber;
  const isKitchen = layout === "cozinha";

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const money = (v) => `R$ ${parseFloat(v || 0).toFixed(2)}`;

  // Itens HTML com Pizza Dinâmica e Apontadores de Sabores e Adicionais
  const itemsHtml = (order.items || []).map((item) => {
    const qty = item.quantity || 1;
    const priceStr = money(item.totalPrice);

    let pizzaBlock = "";
    const isPizzaItem = Boolean(item.isPizza) || (item.name && item.name.toLowerCase().includes("pizza")) || (item.flavors && item.flavors.length > 0);
    if (isPizzaItem) {
      const { fullToppings, pizzaSvg, totalSlices } = generatePizzaCalloutSvgReceipt(item, { dark: false });

      let crustInfo = "";
      if (item.crustType && item.crustType !== "Tradicional") {
        const cPrice = parseFloat(item.crustPrice || 0);
        const cPriceStr = cPrice > 0 && !isKitchen ? ` (+${money(cPrice)})` : "";
        crustInfo = ` | BORDA: <strong>${item.crustType}${cPriceStr}</strong>`;
      }
      if (item.caracolRequested) {
        crustInfo += ` <span style="font-weight:900; border:1px solid #000; padding:0 3px;">(CARACOL)</span>`;
      }

      let fullToppingsHtml = "";
      if (fullToppings.length > 0) {
        fullToppingsHtml = `
          <div style="font-size:10px; font-weight:bold; border-top:1px dashed #000; margin-top:2px; padding-top:2px; text-align:center;">
            ADICIONAIS INTEIRA: ${fullToppings.map((t) => `<strong>+ ${t}</strong>`).join(" | ")}
          </div>
        `;
      }

      let toppingsBreakdownHtml = "";
      if (item.toppings && item.toppings.length > 0 && !isKitchen) {
        toppingsBreakdownHtml = `
          <div style="font-size:10px; font-weight:normal; border-top:1px dashed #777; margin-top:3px; padding-top:2px;">
            <div style="font-weight:900; font-size:10px; text-transform:uppercase; margin-bottom:1px;">ADICIONAIS / EXTRAS:</div>
            ${item.toppings.map((t) => {
              const tName = t.toppingName || t.name || "Adicional";
              const targetDesc = t.targetType === "FULL" || t.targetType === "INTEIRA" || !t.flavorName
                ? "Inteira"
                : `${t.slicesCount || 1} fat. ${t.flavorName.replace(/^\d+\s*fatias?\s*/i, "")}`;
              const tPrice = parseFloat(t.price || 0);
              return `
                <div style="display:flex; justify-content:space-between; font-size:9.5px;">
                  <span>+ ${tName} (${targetDesc})</span>
                  <span>${tPrice > 0 ? money(tPrice) : "Incluso"}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      pizzaBlock = `
        <div style="border:2px solid #000; border-radius:6px; padding:4px 5px; margin:5px 0 6px 0; background:#fff;">
          <div style="text-align:center; font-size:10.5px; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px dashed #000; padding-bottom:2px; margin-bottom:2px;">
            TAMANHO: <strong>${item.pizzaSize || "G"}</strong> (${totalSlices} FATIAS)${crustInfo}
          </div>
          ${pizzaSvg}
          ${fullToppingsHtml}
          ${toppingsBreakdownHtml}
        </div>
      `;
    }

    return `
      <div style="margin:6px 0; padding-bottom:4px; border-bottom:1px dashed #aaa;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; font-size:12px; font-weight:900;">
          <div>[ ${qty}x ] ${item.name}</div>
          ${!isKitchen ? `<div>${priceStr}</div>` : ""}
        </div>
        ${pizzaBlock}
        ${item.notes ? `<div style="font-size:11px; font-style:italic; margin-top:2px;">Obs Item: "${item.notes}"</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 2mm 3mm;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 11.5px;
          font-weight: bold;
          line-height: 1.25;
          color: #000000;
          background-color: #ffffff;
          width: 74mm;
        }
        .center { text-align: center; }
        .dline { border-bottom: 2px dashed #000; margin: 4px 0; }
        .sline { border-bottom: 1px dashed #000; margin: 4px 0; }
        .table-box {
          border: 3px solid #000;
          padding: 4px;
          margin: 6px 0;
          text-align: center;
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .kitchen-title {
          background: #000;
          color: #fff;
          padding: 3px;
          text-align: center;
          font-size: 13px;
          font-weight: 900;
          margin: 4px 0;
        }
        .row { display: flex; justify-content: space-between; }
        .cut-space { height: 35mm; }
      </style>
    </head>
    <body>
      <div class="center dline" style="padding-bottom: 2px;">
        <div style="font-size: 14px; font-weight: 900;">ARTISANAL CRUST & EMBER</div>
        <div style="font-size: 12px; font-weight: 900;">AllDelivery</div>
      </div>

      ${isTable ? `
        <div class="table-box">
          &gt;&gt;&gt; MESA ${tableNum || "—"} &lt;&lt;&lt;
        </div>
      ` : ""}

      ${isKitchen ? `
        <div class="kitchen-title">
          *** VIA COZINHA (PIZZAIOLO) ***
        </div>
      ` : ""}

      <div style="font-size: 11.5px; margin: 4px 0;">
        <div class="row"><span>Pedido: #${order.orderNumber}</span><span>${dateStr}</span></div>
        <div class="row"><span>Tipo  : <strong>${isTable ? "COMANDA / MESA" : order.type}</strong></span><span>${!isKitchen && !isTable ? `Pg: ${order.paymentMethod || "Pendente"}` : (isTable ? `PAGAR NO BALCÃO` : "")}</span></div>
        ${!isKitchen && order.paymentMethod === "DINHEIRO" && parseFloat(order.changeFor || 0) > 0 ? `
          <div class="row" style="background:#000; color:#fff; padding:2px 4px; margin:3px 0; font-size:11px; font-weight:900;">
            <span>TROCO P/: ${money(order.changeFor)}</span>
            <span>LEVAR: ${money(Math.max(0, parseFloat(order.changeFor) - parseFloat(order.total || 0)))}</span>
          </div>
        ` : ""}
      </div>

      <div class="sline"></div>

      <div style="font-size: 11.5px; margin: 4px 0;">
        <div>Cliente: <strong>${order.customerName || "Cliente"}</strong></div>
        ${order.customerPhone && !order.customerPhone.includes("Mesa") ? `<div>Tel    : ${order.customerPhone}</div>` : ""}
        ${order.customerAddress && !isKitchen ? `
          <div>End    : ${order.customerAddress}, ${order.addressNumber || ""}</div>
          ${order.reference ? `<div>Ref    : ${order.reference}</div>` : ""}
        ` : ""}
      </div>

      <div class="dline"></div>

      <div style="font-weight: 900; font-size: 11px; margin-bottom: 2px;">
        ${isKitchen ? "ITENS PARA PREPARO:" : "ITENS DO PEDIDO:"}
      </div>

      ${itemsHtml}

      ${!isKitchen ? `
        <div style="margin-top: 6px; font-size: 12px;">
          <div class="row"><span>Subtotal:</span><span>${money(order.subtotal)}</span></div>
          ${parseFloat(order.deliveryFee || 0) > 0 ? `<div class="row"><span>Taxa Entrega:</span><span>${money(order.deliveryFee)}</span></div>` : ""}
          <div class="dline"></div>
          <div class="row" style="font-size: 15px; font-weight: 900;"><span>TOTAL:</span><span>${money(order.total)}</span></div>
          <div class="dline"></div>
        </div>
      ` : ""}

      ${order.notes ? `
        <div style="margin-top: 6px; border: 2.5px solid #000; padding: 5px 6px; font-size: 12px; background: #fff;">
          <div style="font-weight: 900; text-transform: uppercase;">⚠️ OBSERVAÇÃO DA COZINHA:</div>
          <div style="font-size: 11.5px; font-weight: 900; margin-top: 2px;">&quot;${order.notes}&quot;</div>
        </div>
      ` : ""}

      <div class="cut-space"></div>
    </body>
    </html>
  `;
}

// Cria flyer térmico com QR Code para colocar na mesa
async function formatTableQrFlyer(tableNumber, qrDataUrl, mesaUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        body {
          margin: 0;
          padding: 4mm;
          font-family: Arial, sans-serif;
          color: #000;
          background: #fff;
          text-align: center;
          width: 72mm;
        }
        .header {
          border-bottom: 2px dashed #000;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }
        .title {
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .subtitle {
          font-size: 11px;
          font-weight: bold;
        }
        .table-box {
          border: 3px solid #000;
          border-radius: 8px;
          padding: 2mm;
          margin: 3mm 0;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .qr-img {
          width: 52mm;
          height: 52mm;
          margin: 2mm auto;
          display: block;
        }
        .instructions {
          font-size: 11px;
          font-weight: bold;
          line-height: 1.3;
          margin: 3mm 0;
        }
        .url {
          font-family: monospace;
          font-size: 9px;
          word-break: break-all;
          border-top: 1px dashed #000;
          padding-top: 2mm;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">ARTISANAL CRUST & EMBER</div>
        <div class="subtitle">CARDÁPIO DIGITAL NA MESA</div>
      </div>

      <div class="table-box">MESA ${tableNumber}</div>

      <img class="qr-img" src="${qrDataUrl}" alt="QR Code Mesa ${tableNumber}" />

      <div class="instructions">
        Aponte a câmera do seu celular para escanear o QR Code e faça o seu pedido diretamente na cozinha!
      </div>

      <div class="url">${mesaUrl}</div>
      <div style="height: 10mm;"></div>
    </body>
    </html>
  `;
}

function createWindow() {
  console.log("[Electron] Inicializando janela principal...");

  // Configura partição persistente para o WhatsApp Web (mantém login e sessão salvas)
  const waSession = session.fromPartition("persist:whatsapp");
  waSession.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  waSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["notifications", "audioCapture", "media"];
    if (allowed.includes(permission)) return callback(true);
    callback(false);
  });

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    center: true,
    title: "AllDelivery Desktop | Central de Pedidos, WhatsApp e Impressão",
    backgroundColor: "#121212",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setMenuBarVisibility(false);

  function bringToFront() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.restore();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.flashFrame(true);
    mainWindow.focus();
    console.log("[Electron] Bounds:", JSON.stringify(mainWindow.getBounds()), "Visible:", mainWindow.isVisible(), "Minimized:", mainWindow.isMinimized());
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 2000);
  }

  mainWindow.once("ready-to-show", () => {
    console.log("[Electron] Janela pronta para exibição (ready-to-show).");
    bringToFront();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[Electron] Interface HTML carregada com sucesso.");
    bringToFront();
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("[Electron] Falha ao carregar HTML:", errorCode, errorDescription);
  });

  setTimeout(() => {
    console.log("[Electron] Timer de garantia de exibição acionado.");
    bringToFront();
  }, 2000);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Inicia servidor local de integração e proxy na porta 3001
const localServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-print-auth, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "online",
        version: "2.0.0",
        app: "AllDelivery Desktop",
        ips: getNetworkIps(),
      })
    );
    return;
  }

  // Print command
  if (req.url === "/print" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { order, status, layout } = payload;
        const targetStatus = status || order.status || "NOVO";

        const settings = loadSettings();
        const config = settings.configs[targetStatus];

        if (config && config.printer) {
          const receiptText = formatThermalReceipt(order, layout || config.layout || "completo");
          const copies = Math.max(1, config.copies || 1);
          let allSuccess = true;
          for (let i = 0; i < copies; i++) {
            const success = await printSilently(config.printer, receiptText);
            if (!success) allSuccess = false;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: allSuccess }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Nenhuma impressora configurada para esta etapa" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Redirect mesa QR code se acessado via porta 3001
  if (req.url && req.url.startsWith("/mesa/")) {
    const tableId = req.url.replace("/mesa/", "");
    // Usa o IP real da requisição (ex: 10.0.0.186) em vez de localhost
    // para que funcione quando acessado pelo celular na mesma rede
    const reqHost = (req.headers.host || "").split(":")[0] || "localhost";
    const target = `http://${reqHost}:3000/mesa/${tableId}`;
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Rota não encontrada no daemon local" }));
});

// Ouve em 0.0.0.0 com fallback caso a porta 3001 esteja em uso pelo Next.js
const DEFAULT_PRINT_PORT = parseInt(process.env.ELECTRON_PRINT_PORT || "3001", 10);
localServer.listen(DEFAULT_PRINT_PORT, "0.0.0.0", () => {
  console.log(`[Electron Server] Ouvindo comandos de impressão e rede em 0.0.0.0:${DEFAULT_PRINT_PORT}`);
});

localServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const fallbackPort = 3005;
    console.warn(`[Electron Server] Porta ${DEFAULT_PRINT_PORT} já está em uso (provável Next.js). Alternando para porta ${fallbackPort}...`);
    localServer.listen(fallbackPort, "0.0.0.0", () => {
      console.log(`[Electron Server] Ouvindo comandos de impressão e rede em 0.0.0.0:${fallbackPort}`);
    });
  } else {
    console.error("[Electron Server] Erro no servidor local:", err);
  }
});

app.whenReady().then(() => {
  // IPC handlers
  ipcMain.handle("get-printers", async () => {
    if (!mainWindow) return [];
    try {
      return await mainWindow.webContents.getPrintersAsync();
    } catch (err) {
      console.error("Erro ao listar impressoras:", err);
      return [];
    }
  });

  ipcMain.handle("get-network-ips", () => {
    return getNetworkIps();
  });

  ipcMain.handle("generate-qr", async (event, text) => {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        width: 320,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      return { success: true, dataUrl };
    } catch (err) {
      console.error("Erro ao gerar QR Code:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("load-settings", () => {
    return loadSettings();
  });

  ipcMain.handle("save-settings", (event, settings) => {
    return saveSettings(settings);
  });

  ipcMain.handle("print-receipt", async (event, { printerName, receiptText }) => {
    const success = await printSilently(printerName, receiptText);
    return { success };
  });

  ipcMain.handle("print-html-receipt", async (event, { printerName, htmlContent }) => {
    const success = await printHtmlSilently(printerName, htmlContent);
    return { success };
  });

  ipcMain.handle(
    "print-qr-flyer",
    async (event, { printerName, tableNumber, qrDataUrl, mesaUrl }) => {
      try {
        const html = await formatTableQrFlyer(tableNumber, qrDataUrl, mesaUrl);
        const success = await printHtmlSilently(printerName, html);
        return { success };
      } catch (err) {
        console.error("Erro ao imprimir placa QR:", err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("test-print", async (event, { printerName, statusKey }) => {
    const dline = "====================================\n";
    const line = "------------------------------------\n";
    const testText =
      dline +
      "       TESTE DE IMPRESSORA          \n" +
      "      ARTISANAL CRUST & EMBER       \n" +
      "        AllDelivery Desktop         \n" +
      dline +
      `Impressora: ${printerName || "Padrao Windows"}\n` +
      `Modulo    : ${statusKey || "GERAL"}\n` +
      `Data/Hora : ${new Date().toLocaleString("pt-BR")}\n` +
      line +
      "Status: COMUNICACAO BEM SUCEDIDA!\n" +
      "Pronto para impressao de pedidos!\n" +
      dline +
      "\n\n\n\n";

    const success = await printSilently(printerName, testText);
    return { success };
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
