import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// POST /api/public/table-order - Lança pedido direto na Mesa via QR Code (entra direto em EM_PREPARO / NA COZINHA)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tableNumber,
      customerName,
      notes,
      items,
    } = body;

    const parsedTable = parseInt(String(tableNumber), 10);
    if (isNaN(parsedTable) || parsedTable < 1) {
      return NextResponse.json({ error: "Número da mesa inválido" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "O pedido precisa conter ao menos um item" }, { status: 400 });
    }

    // 1. Garante ou localiza a comanda da mesa
    const comanda = await prisma.comanda.upsert({
      where: { number: parsedTable },
      create: {
        number: parsedTable,
        status: "OCUPADA",
        responsibleName: customerName ? String(customerName).trim() : `Mesa ${parsedTable}`,
        active: true,
      },
      update: {
        status: "OCUPADA",
        active: true,
      },
    });

    // 2. Calcula subtotal e total dos itens
    let subtotal = 0;
    const itemsData = items.map((item: any) => {
      const quantity = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
      const basePrice = Math.max(0, parseFloat(item.basePrice || item.price || "0") || 0);
      const crustPrice = Math.max(0, parseFloat(item.crustPrice || "0") || 0);

      const toppingsTotal = (item.toppings || []).reduce(
        (sum: number, t: any) => sum + Math.max(0, parseFloat(t.price || "0") || 0),
        0
      );

      const unitTotal = roundCurrency(basePrice + crustPrice + toppingsTotal);
      const finalItemTotal = roundCurrency(unitTotal * quantity);
      subtotal += finalItemTotal;

      return {
        name: item.name || "Item",
        quantity,
        basePrice: unitTotal,
        totalPrice: finalItemTotal,
        isPizza: Boolean(item.isPizza),
        pizzaSize: item.pizzaSize || null,
        crustType: item.crustType || null,
        crustPrice,
        flavors: {
          create: (item.flavors || []).map((f: any) => {
            const rawName = typeof f === "string" ? f : f.flavorName || f.name || "Sabor";
            const slices = f.slices;
            const hasSlices = /^\d+\s*fatias?/i.test(rawName);
            const flavorLabel = (!hasSlices && slices) ? `${slices} fatias ${rawName}` : rawName;
            return {
              flavorName: flavorLabel,
              categoryName: f.categoryName || "Pizza",
            };
          }),
        },
        toppings: {
          create: (item.toppings || []).map((t: any) => ({
            toppingName: t.toppingName || t.name || "Adicional",
            targetType: t.targetType || "INTEIRA",
            flavorName: t.flavorName || null,
            slicesCount: t.slicesCount || 1,
            totalSlices: t.totalSlices || 1,
            price: Math.max(0, parseFloat(t.price || "0") || 0),
          })),
        },
      };
    });

    subtotal = roundCurrency(subtotal);
    const total = subtotal;

    const effectiveName = customerName ? `${String(customerName).trim()} (Mesa ${parsedTable})` : `Mesa ${parsedTable}`;

    // Reúne observações de itens e do pedido
    const itemNotes = (items || [])
      .filter((it: any) => it.notes && it.notes.trim())
      .map((it: any) => `${(it.name || "Item").split("(")[0].trim()}: "${it.notes.trim()}"`);

    let effectiveNotes = (notes || "").trim();
    if (itemNotes.length > 0) {
      effectiveNotes = effectiveNotes
        ? `${effectiveNotes} | ${itemNotes.join(" | ")}`
        : itemNotes.join(" | ");
    }

    // 3. Cria o pedido diretamente em EM_PREPARO (NA COZINHA)
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          type: "COMANDA",
          status: "EM_PREPARO", // Entra diretamente na cozinha
          customerName: effectiveName,
          customerPhone: `Mesa ${parsedTable}`,
          customerAddress: null,
          addressNumber: null,
          reference: `Auto-atendimento QR Code Mesa ${parsedTable}`,
          paymentMethod: "DINHEIRO", // Acerto no fechamento da comanda
          subtotal,
          deliveryFee: 0,
          total,
          notes: effectiveNotes || null,
          comandaId: comanda.id,
          preparedAt: new Date(),
          items: {
            create: itemsData,
          },
        },
        include: {
          comanda: true,
          items: {
            include: {
              flavors: true,
              toppings: true,
            },
          },
        },
      });

      return created;
    });

    // 4. Publica no barramento SSE para Kanban e Impressoras Desktop
    sseManager.publish("order_created", order);

    // Dispara payload específico para impressora térmica da cozinha
    const printPayload = {
      action: "print_receipt",
      status: "EM_PREPARO",
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        type: order.type,
        comandaNumber: parsedTable,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        deliveryFee: 0,
        total: order.total,
        notes: order.notes,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.basePrice,
          totalPrice: item.totalPrice,
          isPizza: item.isPizza,
          pizzaSize: item.pizzaSize,
          crustType: item.crustType,
          crustPrice: item.crustPrice,
          flavors: item.flavors.map((f) => ({
            name: f.flavorName,
            categoryName: f.categoryName,
          })),
          toppings: (item.toppings || []).map((t) => ({
            toppingName: t.toppingName,
            targetType: t.targetType,
            flavorName: t.flavorName,
            slicesCount: t.slicesCount,
            totalSlices: t.totalSlices,
            price: t.price,
          })),
        })),
      },
    };

    sseManager.publish("print_order", printPayload);
    console.log(`[Table Order] Pedido #${order.orderNumber} para Mesa ${parsedTable} criado e enviado diretamente para a COZINHA!`);

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
    console.error("Table order error:", error);
    return NextResponse.json({ error: "Erro interno ao processar pedido da mesa" }, { status: 500 });
  }
}
