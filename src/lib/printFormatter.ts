export interface ReceiptOrderItem {
  name: string;
  quantity: number;
  price?: number | string;
  totalPrice: number | string;
  isPizza?: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  flavors?: { flavorName?: string; name?: string; categoryName?: string }[];
}

export interface ReceiptOrder {
  orderNumber: number | string;
  type: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  addressNumber?: string | null;
  reference?: string | null;
  changeFor?: number | string | null;
  subtotal: number | string;
  deliveryFee?: number | string;
  total: number | string;
  notes?: string | null;
  createdAt: string | Date;
  items: ReceiptOrderItem[];
}

// Algoritmo de Formatação Monoespaçado de Cupom para Bobina Térmica de 48 caracteres
export function formatThermalReceipt(order: ReceiptOrder, companyName: string = "ARTISANAL CRUST & EMBER"): string {
  const line = "------------------------------------------------\n";
  const doubleLine = "================================================\n";
  const W = 48;

  // Helper para formatar valores numéricos com segurança
  const formatMoney = (val: number | string | null | undefined): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  // Helper: centraliza texto em 48 colunas
  const center = (text: string): string => {
    const trimmed = text.substring(0, W);
    const pad = Math.max(0, Math.floor((W - trimmed.length) / 2));
    return " ".repeat(pad) + trimmed + "\n";
  };

  // Helper: quebra texto longo em linhas de no máximo W caracteres
  const wrapText = (text: string, prefix: string = ""): string => {
    const maxLen = W - prefix.length;
    const words = text.split(" ");
    let currentLine = prefix;
    let result = "";

    for (const word of words) {
      if ((currentLine + (currentLine === prefix ? "" : " ") + word).length <= W) {
        currentLine += (currentLine === prefix ? "" : " ") + word;
      } else {
        result += currentLine + "\n";
        currentLine = " ".repeat(prefix.length) + word;
      }
    }
    if (currentLine.trim().length > 0) {
      result += currentLine + "\n";
    }
    return result;
  };

  let out = "";
  out += doubleLine;
  out += center(companyName.toUpperCase());
  out += center("AllDelivery Print Service");
  out += doubleLine;

  const dateObj = new Date(order.createdAt);
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  out += `Pedido: #${order.orderNumber}   Data: ${formattedDate}\n`;
  out += `Tipo: ${order.type}   Pagamento: ${order.paymentMethod}\n`;

  const changeNum = typeof order.changeFor === "number" ? order.changeFor : parseFloat(String(order.changeFor || 0));
  if (!isNaN(changeNum) && changeNum > 0) {
    out += `Troco para: R$ ${changeNum.toFixed(2)}\n`;
  }

  out += line;
  out += wrapText(order.customerName || "Cliente", "Cliente: ");
  out += `Tel: ${order.customerPhone || "—"}\n`;

  if (order.customerAddress) {
    const fullAddress = `${order.customerAddress}${order.addressNumber ? `, ${order.addressNumber}` : ""}`;
    out += wrapText(fullAddress, "End: ");
    if (order.reference) {
      out += wrapText(order.reference, "Ref: ");
    }
  }

  out += line;
  out += " Qtd   Item                             Preco   \n";
  out += line;

  for (const item of order.items || []) {
    const qty = item.quantity || 1;
    const qtyStr = qty.toString().padEnd(4, " ");
    const nameStr = (item.name || "").substring(0, 31).padEnd(31, " ");
    const itemTotal = formatMoney(item.totalPrice);
    const priceStr = `R$ ${itemTotal}`.padStart(11, " ");
    out += `${qtyStr} ${nameStr} ${priceStr}\n`;

    if (item.isPizza && item.flavors && item.flavors.length > 0) {
      out += `      Tamanho: ${item.pizzaSize || "—"} | Borda: ${item.crustType || "Tradicional"}\n`;
      out += "      Sabor(es):\n";
      for (const f of item.flavors) {
        const fName = f.flavorName || f.name || "Sabor";
        const cName = f.categoryName ? ` (${f.categoryName})` : "";
        out += `      - ${fName}${cName}\n`;
      }
    }
  }

  out += line;
  out += `Subtotal: `.padEnd(36, " ") + `R$ ${formatMoney(order.subtotal)}`.padStart(12, " ") + "\n";

  const deliveryFeeNum = typeof order.deliveryFee === "number" ? order.deliveryFee : parseFloat(String(order.deliveryFee || 0));
  if (!isNaN(deliveryFeeNum) && deliveryFeeNum > 0) {
    out += `Taxa de Entrega: `.padEnd(36, " ") + `R$ ${deliveryFeeNum.toFixed(2)}`.padStart(12, " ") + "\n";
  }

  out += doubleLine;
  out += `TOTAL GERAL: `.padEnd(36, " ") + `R$ ${formatMoney(order.total)}`.padStart(12, " ") + "\n";
  out += doubleLine;

  if (order.notes && order.notes.trim().length > 0) {
    out += "OBSERVACOES:\n";
    out += wrapText(order.notes, "  ");
    out += doubleLine;
  }

  out += "\n\n\n\n"; // Avanço do papel térmico para corte
  return out;
}
