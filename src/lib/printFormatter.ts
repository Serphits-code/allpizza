// Algoritmo de Formatação Monoespaçado de Cupom para Bobina Térmica de 48 caracteres
export function formatThermalReceipt(order: any): string {
  const line = "------------------------------------------------\n";
  const doubleLine = "================================================\n";
  
  let out = "";
  out += doubleLine;
  out += "           ARTISANAL CRUST & EMBER              \n";
  out += "          AllDelivery Print Service             \n";
  out += doubleLine;
  out += `Pedido: #${order.orderNumber}   Data: ${new Date(order.createdAt).toLocaleString("pt-BR")}\n`;
  out += `Tipo: ${order.type}   Pagamento: ${order.paymentMethod}\n`;
  if (order.changeFor) {
    out += `Troco para: R$ ${order.changeFor.toFixed(2)}\n`;
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

    if (item.isPizza && item.flavors && item.flavors.length > 0) {
      out += `      Tamanho: ${item.pizzaSize} | Borda: ${item.crustType || "Tradicional"}\n`;
      out += "      Sabor(es):\n";
      for (const f of item.flavors) {
        out += `      - ${f.flavorName || f.name} (${f.categoryName})\n`;
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
