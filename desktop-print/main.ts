import EventSource from "eventsource";
import * as fs from "fs";
import * as path from "path";

// Porta/URL de Conexão com o Servidor Local
const SERVER_URL = "http://localhost:3000/api/print/events";
const SPOOL_FILE = path.join(process.cwd(), "..", "scratch", "receipt_spool.txt");

console.log("[Electron Daemon] Inicializando daemon de impressão...");
console.log(`[Electron Daemon] Escutando rota SSE: ${SERVER_URL}`);

let es: EventSource;

function connectSSE() {
  es = new EventSource(SERVER_URL);

  es.onopen = () => {
    console.log("[Electron Daemon] Conectado com sucesso ao barramento SSE.");
  };

  es.addEventListener("connected", (event: any) => {
    const data = JSON.parse(event.data);
    console.log(`[Electron Daemon] ID da Sessão ativa: ${data.clientId}`);
  });

  // Escuta novos pedidos enviados para preparo
  es.addEventListener("print_order", (event: any) => {
    const payload = JSON.parse(event.data);
    console.log(`[Electron Daemon] Pedido #${payload.order.orderNumber} recebido para impressão.`);
    
    // Formata o pedido
    const formattedReceipt = formatThermalReceipt(payload.order);

    // Salva no arquivo de spool local (/scratch/receipt_spool.txt) para simulação
    try {
      // Garante a existência da pasta scratch
      const scratchDir = path.dirname(SPOOL_FILE);
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      fs.appendFileSync(SPOOL_FILE, formattedReceipt);
      console.log(`[Electron Daemon] Cupom do Pedido #${payload.order.orderNumber} spooled em /scratch/receipt_spool.txt`);
    } catch (err) {
      console.error("[Electron Daemon] Erro ao gravar cupom no spool local:", err);
    }
  });

  es.onerror = (err) => {
    console.error("[Electron Daemon] Erro na conexão SSE. Tentando reconectar em 5 segundos...", err);
    es.close();
    setTimeout(connectSSE, 5000);
  };
}

// Algoritmo de Formatação Monoespaçado de Cupom para Bobina Térmica de 48 caracteres
function formatThermalReceipt(order: any): string {
  const line = "------------------------------------------------\n";
  const doubleLine = "================================================\n";
  
  let out = "";
  out += doubleLine;
  out += "           ARTISANAL CRUST & EMBER              \n";
  out += "          AllDelivery Print Service             \n";
  out += doubleLine;
  const dateStr = new Date(order.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  out += `Pedido: #${order.orderNumber}   Data: ${dateStr}\n`;
  out += `Tipo: ${order.type}   Pagamento: ${order.paymentMethod}\n`;
  if (order.changeFor && parseFloat(order.changeFor) > 0) {
    out += `Troco para: R$ ${parseFloat(order.changeFor).toFixed(2)}\n`;
  }
  out += line;
  out += `Cliente: ${order.customerName}\n`;
  out += `Tel: ${order.customerPhone}\n`;
  if (order.customerAddress) {
    out += `End: ${order.customerAddress}, ${order.addressNumber}\n`;
    if (order.reference) {
      out += `Ref: ${order.reference}\n`;
    }
  }
  out += line;
  out += " Qtd   Item                             Preco   \n";
  out += line;

  for (const item of order.items) {
    const qtyStr = item.quantity.toString().padEnd(4, " ");
    const nameStr = item.name.substring(0, 31).padEnd(31, " ");
    const priceStr = `R$ ${(item.totalPrice).toFixed(2)}`.padStart(11, " ");
    out += `${qtyStr} ${nameStr} ${priceStr}\n`;

    if (item.isPizza && item.flavors.length > 0) {
      out += `      Tamanho: ${item.pizzaSize} | Borda: ${item.crustType}\n`;
      out += "      Sabor(es):\n";
      for (const f of item.flavors) {
        out += `      - ${f.name} (${f.categoryName})\n`;
      }
    }
  }

  out += line;
  out += `Subtotal: `.padEnd(36, " ") + `R$ ${order.subtotal.toFixed(2)}`.padStart(12, " ") + "\n";
  if (order.deliveryFee > 0) {
    out += `Taxa de Entrega: `.padEnd(36, " ") + `R$ ${order.deliveryFee.toFixed(2)}`.padStart(12, " ") + "\n";
  }
  out += doubleLine;
  out += `TOTAL GERAL: `.padEnd(36, " ") + `R$ ${order.total.toFixed(2)}`.padStart(12, " ") + "\n";
  out += doubleLine;
  
  if (order.notes) {
    out += `OBSERVACOES:\n${order.notes}\n`;
    out += doubleLine;
  }
  
  out += "\n\n\n\n"; // Avanço do papel térmico para corte
  return out;
}

// Inicia escuta
connectSSE();
