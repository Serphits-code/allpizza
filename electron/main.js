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
    serverUrl: "http://localhost:3001",
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

// Gera o card completo da pizza no padrão idêntico ao modelo (Círculo central com fatias e FAT + Cards individuais de sabores abaixo)
function generatePizzaCardReceipt(item, options = {}) {
  const { totalSlices, flavors } = parsePizzaFlavorsWithSlices(item);
  const isKitchen = Boolean(options.isKitchen);
  const size = (item.pizzaSize || "G").toUpperCase();
  const unitLabel = options.totalUnits && options.totalUnits > 1
    ? ` (${options.unitIndex || 1}/${options.totalUnits})`
    : "";

  // Mapeia adicionais por sabor e adicionais da pizza toda
  const toppingsByFlavor = {};
  const fullToppings = [];

  (item.toppings || []).forEach((t) => {
    const tName = t.toppingName || t.name || "";
    const qty = t.quantity || 1;
    const price = parseFloat(t.price || 0);

    if (t.targetType === "FULL" || t.targetType === "INTEIRA" || !t.flavorName) {
      fullToppings.push({ name: tName, quantity: qty, price });
    } else {
      const target = (t.flavorName || "").toLowerCase().replace(/^\d+\s*fatias?\s*/i, "").trim();
      const matched = flavors.find((f) => {
        const fn = f.cleanName.toLowerCase().replace(/^\d+\s*fatias?\s*/i, "").trim();
        return fn === target || fn.includes(target) || target.includes(fn);
      });
      const key = matched ? matched.cleanName : flavors[0]?.cleanName || "default";
      if (!toppingsByFlavor[key]) toppingsByFlavor[key] = [];
      toppingsByFlavor[key].push({ name: tName, quantity: qty, price });
    }
  });

  // GERAÇÃO DO GRÁFICO CIRCULAR SVG DA PIZZA
  const svgWidth = 160;
  const svgHeight = 160;
  const cx = 80;
  const cy = 80;
  const r = 64;
  const count = flavors.length;

  let svgContent = "";
  // Círculo base da pizza
  svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#000000" stroke-width="3.2" />`;

  if (count <= 1) {
    const s = flavors[0]?.slices || totalSlices;
    svgContent += `
      <text x="${cx}" y="${cy - 7}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${s}</text>
      <text x="${cx}" y="${cy + 13}" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" letter-spacing="0.5">FAT</text>
    `;
  } else if (count === 2) {
    const s1 = flavors[0].slices;
    const s2 = flavors[1].slices;
    if (s1 === s2) {
      svgContent += `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="#000000" stroke-width="2.6" />`;
      svgContent += `
        <text x="${cx - 28}" y="${cy - 6}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${s1}</text>
        <text x="${cx - 28}" y="${cy + 13}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
      svgContent += `
        <text x="${cx + 28}" y="${cy - 6}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${s2}</text>
        <text x="${cx + 28}" y="${cy + 13}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
    } else {
      const total = s1 + s2;
      const angle1 = (s1 / total) * 360;
      const rad0 = -Math.PI / 2;
      const rad1 = rad0 + (angle1 * Math.PI) / 180;
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r}" stroke="#000000" stroke-width="2.6" />`;
      const x1 = cx + r * Math.cos(rad1);
      const y1 = cy + r * Math.sin(rad1);
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#000000" stroke-width="2.6" />`;

      const midRad1 = rad0 + ((angle1 / 2) * Math.PI) / 180;
      const tx1 = cx + (r * 0.52) * Math.cos(midRad1);
      const ty1 = cy + (r * 0.52) * Math.sin(midRad1);
      svgContent += `
        <text x="${tx1.toFixed(1)}" y="${(ty1 - 6).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${s1}</text>
        <text x="${tx1.toFixed(1)}" y="${(ty1 + 12).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;

      const midRad2 = rad1 + (((360 - angle1) / 2) * Math.PI) / 180;
      const tx2 = cx + (r * 0.52) * Math.cos(midRad2);
      const ty2 = cy + (r * 0.52) * Math.sin(midRad2);
      svgContent += `
        <text x="${tx2.toFixed(1)}" y="${(ty2 - 6).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${s2}</text>
        <text x="${tx2.toFixed(1)}" y="${(ty2 + 12).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
    }
  } else if (count === 3) {
    const s1 = flavors[0].slices;
    const s2 = flavors[1].slices;
    const s3 = flavors[2].slices;

    if ((s1 === 3 && s2 === 3 && s3 === 2) || (s1 === 3 && s2 === 2 && s3 === 3) || (s1 === 2 && s2 === 3 && s3 === 3)) {
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r}" stroke="#000000" stroke-width="2.6" />`;
      const xSE = cx + r * Math.cos((45 * Math.PI) / 180);
      const ySE = cy + r * Math.sin((45 * Math.PI) / 180);
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${xSE.toFixed(1)}" y2="${ySE.toFixed(1)}" stroke="#000000" stroke-width="2.6" />`;
      const xSW = cx + r * Math.cos((135 * Math.PI) / 180);
      const ySW = cy + r * Math.sin((135 * Math.PI) / 180);
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${xSW.toFixed(1)}" y2="${ySW.toFixed(1)}" stroke="#000000" stroke-width="2.6" />`;

      let topEsquerdaFlavor = flavors[0];
      let topDireitaFlavor = flavors[1];
      let baseFlavor = flavors[2];

      if (flavors[0].slices === 2) {
        baseFlavor = flavors[0];
        topDireitaFlavor = flavors[1];
        topEsquerdaFlavor = flavors[2];
      } else if (flavors[1].slices === 2) {
        baseFlavor = flavors[1];
        topEsquerdaFlavor = flavors[0];
        topDireitaFlavor = flavors[2];
      }

      svgContent += `
        <text x="${cx - 23}" y="${cy - 19}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${topEsquerdaFlavor.slices}</text>
        <text x="${cx - 23}" y="${cy - 2}" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
      svgContent += `
        <text x="${cx + 23}" y="${cy - 19}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${topDireitaFlavor.slices}</text>
        <text x="${cx + 23}" y="${cy - 2}" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
      svgContent += `
        <text x="${cx}" y="${cy + 22}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${baseFlavor.slices}</text>
        <text x="${cx}" y="${cy + 39}" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
    } else {
      const total = s1 + s2 + s3;
      let currAngle = -90;
      flavors.forEach((f) => {
        const sweep = (f.slices / total) * 360;
        const radLine = (currAngle * Math.PI) / 180;
        const lx = cx + r * Math.cos(radLine);
        const ly = cy + r * Math.sin(radLine);
        svgContent += `<line x1="${cx}" y1="${cy}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#000000" stroke-width="2.6" />`;

        const midAngle = currAngle + sweep / 2;
        const midRad = (midAngle * Math.PI) / 180;
        const tx = cx + (r * 0.54) * Math.cos(midRad);
        const ty = cy + (r * 0.54) * Math.sin(midRad);
        svgContent += `
          <text x="${tx.toFixed(1)}" y="${(ty - 5).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${f.slices}</text>
          <text x="${tx.toFixed(1)}" y="${(ty + 11).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
        `;
        currAngle += sweep;
      });
    }
  } else {
    const total = flavors.reduce((a, f) => a + f.slices, 0) || totalSlices;
    let currAngle = -90;
    flavors.forEach((f) => {
      const sweep = (f.slices / total) * 360;
      const radLine = (currAngle * Math.PI) / 180;
      const lx = cx + r * Math.cos(radLine);
      const ly = cy + r * Math.sin(radLine);
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#000000" stroke-width="2.6" />`;

      const midAngle = currAngle + sweep / 2;
      const midRad = (midAngle * Math.PI) / 180;
      const tx = cx + (r * 0.58) * Math.cos(midRad);
      const ty = cy + (r * 0.58) * Math.sin(midRad);
      const fNumSize = count === 4 ? 20 : 16;
      const fFatSize = count === 4 ? 10 : 8;
      svgContent += `
        <text x="${tx.toFixed(1)}" y="${(ty - 4).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${fNumSize}" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">${f.slices}</text>
        <text x="${tx.toFixed(1)}" y="${(ty + 9).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${fFatSize}" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000">FAT</text>
      `;
      currAngle += sweep;
    });
  }

  // Ponto central
  svgContent += `<circle cx="${cx}" cy="${cy}" r="${2}" fill="#000000" />`;

  const pizzaSvg = `
    <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block; margin: 0 auto;">
      ${svgContent}
    </svg>
  `;

  // CARDS DOS SABORES ABAIXO DA PIZZA
  const flavorCardsHtml = flavors.map((f) => {
    const fTops = toppingsByFlavor[f.cleanName] || [];
    let toppingsText = "";
    let toppingsTotalPrice = 0;

    if (fTops.length > 0) {
      toppingsText = fTops.map((t) => {
        toppingsTotalPrice += (t.price || 0) * (t.quantity || 1);
        const qtyPrefix = t.quantity > 1 ? `+${t.quantity}X - ` : `1X - `;
        return `(${qtyPrefix}${t.name.toUpperCase()})`;
      }).join(" ");
    }

    const hasRightPrice = !isKitchen && toppingsTotalPrice > 0;
    const priceFormatted = toppingsTotalPrice.toFixed(2).replace(".", ",");

    return `
      <div style="border: 1.8px solid #000000; border-radius: 12px; margin-top: 7px; display: flex; align-items: stretch; background: #ffffff; min-height: 40px; overflow: hidden;">
        <div style="padding: 6px 10px; flex: 1; display: flex; flex-direction: column; justify-content: center; font-size: 13px; font-weight: 900; line-height: 1.25; color: #000000;">
          <div>
            <strong>${f.slices} FAT ${f.cleanName.toUpperCase()}</strong>
            ${toppingsText ? `<span style="font-weight: 700; margin-left: 4px;">+ ${toppingsText}</span>` : ""}
          </div>
        </div>
        ${hasRightPrice ? `
          <div style="border-left: 1.6px solid #000000; width: 58px; padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; background: #ffffff;">
            <div style="font-size: 8px; font-weight: 800; line-height: 1; margin-bottom: 2px;">R$</div>
            <div style="font-size: 13px; font-weight: 900; line-height: 1; letter-spacing: -0.5px;">${priceFormatted}</div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  // Borda Recheada (se houver)
  let crustHtml = "";
  if (item.crustType && item.crustType !== "Tradicional") {
    const cPrice = parseFloat(item.crustPrice || 0);
    const hasPrice = !isKitchen && cPrice > 0;
    crustHtml = `
      <div style="border: 1.8px solid #000000; border-radius: 12px; margin-top: 7px; display: flex; align-items: stretch; background: #ffffff; min-height: 38px; overflow: hidden;">
        <div style="padding: 6px 10px; flex: 1; display: flex; align-items: center; font-size: 12px; font-weight: 900; color: #000000;">
          🧀 BORDA: ${item.crustType.toUpperCase()}${item.caracolRequested ? " (CARACOL)" : ""}
        </div>
        ${hasPrice ? `
          <div style="border-left: 1.6px solid #000000; width: 58px; padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
            <div style="font-size: 8px; font-weight: 800; line-height: 1; margin-bottom: 2px;">R$</div>
            <div style="font-size: 13px; font-weight: 900; line-height: 1;">${cPrice.toFixed(2).replace(".", ",")}</div>
          </div>
        ` : ""}
      </div>
    `;
  }

  // Adicionais na Pizza Toda (FULL) se houver
  let fullToppingsHtml = "";
  if (fullToppings.length > 0) {
    const fullTotalPrice = fullToppings.reduce((acc, t) => acc + (t.price || 0) * (t.quantity || 1), 0);
    const hasPrice = !isKitchen && fullTotalPrice > 0;
    const fullNames = fullToppings.map(t => `${t.quantity > 1 ? `${t.quantity}X ` : ""}${t.name.toUpperCase()}`).join(", ");
    fullToppingsHtml = `
      <div style="border: 1.8px solid #000000; border-radius: 12px; margin-top: 7px; display: flex; align-items: stretch; background: #ffffff; min-height: 38px; overflow: hidden;">
        <div style="padding: 6px 10px; flex: 1; display: flex; align-items: center; font-size: 11.5px; font-weight: 900; color: #000000;">
          ✨ ADICIONAIS NA PIZZA TODA: ${fullNames}
        </div>
        ${hasPrice ? `
          <div style="border-left: 1.6px solid #000000; width: 58px; padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
            <div style="font-size: 8px; font-weight: 800; line-height: 1; margin-bottom: 2px;">R$</div>
            <div style="font-size: 13px; font-weight: 900; line-height: 1;">${fullTotalPrice.toFixed(2).replace(".", ",")}</div>
          </div>
        ` : ""}
      </div>
    `;
  }

  // Observações da pizza
  let notesHtml = "";
  if (item.notes && item.notes.trim()) {
    notesHtml = `
      <div style="border: 1.5px dashed #000000; border-radius: 10px; margin-top: 7px; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #000000; background: #ffffff;">
        📝 Obs: &quot;${item.notes}&quot;
      </div>
    `;
  }

  // CARD COMPLETO DA PIZZA NO PADRÃO EXATO DA IMAGEM
  return `
    <div style="border: 2.8px solid #000000; border-radius: 18px; padding: 12px 10px; background: #ffffff; color: #000000; box-sizing: border-box; width: 100%; margin: 8px 0;">
      <!-- CABEÇALHO -->
      <div style="text-align: center; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 15px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 8px; color: #000000;">
        TAMANHO ${size} (${totalSlices} FATIAS)${unitLabel}
      </div>

      <!-- LINHA TRACEJADA -->
      <div style="border-top: 2px dashed #000000; margin: 0 0 10px 0;"></div>

      <!-- GRÁFICO CIRCULAR DA PIZZA -->
      ${pizzaSvg}

      <!-- CARDS DOS SABORES -->
      <div style="margin-top: 9px;">
        ${flavorCardsHtml}
      </div>

      <!-- BORDA -->
      ${crustHtml}

      <!-- ADICIONAIS NA PIZZA TODA -->
      ${fullToppingsHtml}

      <!-- OBSERVAÇÕES -->
      ${notesHtml}
    </div>
  `;
}

// Compatibilidade retroativa
function generatePizzaCalloutSvgReceipt(item, options = {}) {
  const { totalSlices, flavors } = parsePizzaFlavorsWithSlices(item);
  return {
    totalSlices,
    flavors,
    fullToppings: [],
    pizzaSvg: generatePizzaCardReceipt(item, options),
  };
}

function formatThermalReceipt(order, layout = "completo") {
  const isTable = order.type === "COMANDA" || Boolean(order.comandaId);
  const tableNum = order.comanda?.number || order.comandaNumber;
  const isKitchen = layout === "cozinha";

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const money = (v) => `R$ ${parseFloat(v || 0).toFixed(2)}`;

  // Itens HTML com Card Oficial da Pizza para cada Pizza do pedido
  const itemsHtml = (order.items || []).map((item) => {
    const qty = Math.max(1, item.quantity || 1);
    const priceStr = money(item.totalPrice);

    const isPizzaItem = Boolean(item.isPizza) || (item.name && item.name.toLowerCase().includes("pizza")) || (item.flavors && item.flavors.length > 0);
    
    if (isPizzaItem) {
      // Se tiver mais de 1 pizza do mesmo item, gera um card para cada pizza
      let pizzaCards = "";
      for (let q = 1; q <= qty; q++) {
        pizzaCards += generatePizzaCardReceipt(item, {
          isKitchen,
          unitIndex: q,
          totalUnits: qty,
        });
      }

      return `
        <div style="margin: 6px 0 10px 0; padding-bottom: 6px; border-bottom: 1px dashed #777;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; font-weight: 900; margin-bottom: 2px;">
            <div>[ ${qty}x ] ${item.name}</div>
            ${!isKitchen ? `<div>${priceStr}</div>` : ""}
          </div>
          ${pizzaCards}
        </div>
      `;
    }

    // Itens que não são pizza (bebidas, porções, etc.)
    return `
      <div style="margin: 6px 0; padding-bottom: 4px; border-bottom: 1px dashed #aaa;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; font-size:12px; font-weight:900;">
          <div>[ ${qty}x ] ${item.name}</div>
          ${!isKitchen ? `<div>${priceStr}</div>` : ""}
        </div>
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
    const target = `http://${reqHost}:3001/mesa/${tableId}`;
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Rota não encontrada no daemon local" }));
});

// Servidor HTTP local opcional para comandos externos em 0.0.0.0 (Porta 4005+)
let currentPrintPort = parseInt(process.env.ELECTRON_PRINT_PORT || "4005", 10);
let retryCount = 0;
const MAX_PORT_RETRIES = 3;

function startLocalPrintServer() {
  localServer.once("error", (err) => {
    if (err.code === "EADDRINUSE" && retryCount < MAX_PORT_RETRIES) {
      retryCount++;
      currentPrintPort++;
      console.warn(`[Electron Server] Porta em uso. Tentando porta alternativa ${currentPrintPort}...`);
      setTimeout(startLocalPrintServer, 300);
    } else {
      console.warn("[Electron Server] Servidor HTTP local desativado devido a porta em uso:", err.message);
    }
  });

  try {
    localServer.listen(currentPrintPort, "0.0.0.0", () => {
      console.log(`[Electron Server] Ouvindo comandos de impressão e rede em 0.0.0.0:${currentPrintPort}`);
    });
  } catch (err) {
    console.warn("[Electron Server] Falha ao iniciar daemon HTTP:", err.message);
  }
}

startLocalPrintServer();

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

  ipcMain.handle("print-order", async (event, { order, status }) => {
    try {
      const targetStatus = status || order.status || "NOVO";
      const settings = loadSettings();
      const config = settings.configs?.[targetStatus];

      if (config && config.printer) {
        const receiptText = formatThermalReceipt(order, config.layout || "completo");
        const copies = Math.max(1, config.copies || 1);
        let allSuccess = true;
        for (let i = 0; i < copies; i++) {
          const success = await printSilently(config.printer, receiptText);
          if (!success) allSuccess = false;
        }
        return { success: allSuccess };
      }
      return { success: false, error: "Nenhuma impressora configurada para esta etapa" };
    } catch (err) {
      console.error("Erro no IPC print-order:", err);
      return { success: false, error: err.message };
    }
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
