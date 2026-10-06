import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET /api/public/table-account?tableNumber=X - Consulta conta da mesa em tempo real via QR Code
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableParam = searchParams.get("tableNumber");

    if (!tableParam) {
      return NextResponse.json({ error: "Número da mesa é obrigatório" }, { status: 400 });
    }

    const tableNumber = parseInt(tableParam, 10);
    if (isNaN(tableNumber) || tableNumber < 1) {
      return NextResponse.json({ error: "Número da mesa inválido" }, { status: 400 });
    }

    // Busca a comanda correspondente com todos os pedidos não cancelados
    const comanda = await prisma.comanda.findUnique({
      where: { number: tableNumber },
      include: {
        orders: {
          where: {
            status: { not: "CANCELADO" },
          },
          orderBy: { createdAt: "asc" },
          include: {
            items: {
              include: {
                flavors: true,
                toppings: true,
              },
            },
          },
        },
      },
    });

    if (!comanda) {
      return NextResponse.json({
        exists: false,
        tableNumber,
        responsibleName: `Mesa ${tableNumber}`,
        status: "LIVRE",
        totalConsumption: 0,
        totalPaid: 0,
        remainingBalance: 0,
        orders: [],
        payments: [],
      });
    }

    const totalConsumption = roundCurrency(
      comanda.orders.reduce((sum, o) => sum + (o.total || 0), 0)
    );

    // Consulta pagamentos / baixas da comanda em SystemConfig
    const config = await prisma.systemConfig.findUnique({
      where: { key: `comanda_payments_${comanda.id}` },
    });

    const payments = config ? JSON.parse(config.value || "[]") : [];
    const totalPaid = roundCurrency(
      payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
    );
    const remainingBalance = Math.max(0, roundCurrency(totalConsumption - totalPaid));

    return NextResponse.json({
      exists: true,
      tableNumber: comanda.number,
      comandaId: comanda.id,
      responsibleName: comanda.responsibleName || `Mesa ${comanda.number}`,
      status: comanda.status,
      totalConsumption,
      totalPaid,
      remainingBalance,
      orderCount: comanda.orders.length,
      orders: comanda.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        type: o.type,
        customerName: o.customerName,
        notes: o.notes,
        total: o.total,
        createdAt: o.createdAt,
        items: o.items.map((it) => ({
          id: it.id,
          name: it.name,
          quantity: it.quantity,
          basePrice: it.basePrice,
          totalPrice: it.totalPrice,
          isPizza: it.isPizza,
          pizzaSize: it.pizzaSize,
          crustType: it.crustType,
          crustPrice: it.crustPrice,
          flavors: it.flavors,
          toppings: it.toppings,
        })),
      })),
      payments,
    });
  } catch (error) {
    console.error("Get table account error:", error);
    return NextResponse.json({ error: "Erro ao buscar conta da mesa" }, { status: 500 });
  }
}

// POST /api/public/table-account - Chamar garçom ou pedir a conta
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tableNumber, type = "BILL" } = body; // BILL (Pedir a conta) ou WAITER (Chamar garçom)

    const parsedTable = parseInt(String(tableNumber), 10);
    if (isNaN(parsedTable) || parsedTable < 1) {
      return NextResponse.json({ error: "Mesa inválida" }, { status: 400 });
    }

    const callRecord = {
      tableNumber: parsedTable,
      type,
      timestamp: new Date().toISOString(),
    };

    // Publica no SSE para que o Admin e Garçons recebam o chamado
    try {
      const { sseManager } = await import("@/lib/sse");
      sseManager.publish("table_assistance", callRecord);
    } catch (e) {
      // Ignora erro SSE
    }

    return NextResponse.json({
      success: true,
      message: type === "BILL" ? "Pedido de conta enviado ao garçom!" : "Garçom chamado com sucesso!",
    });
  } catch (error) {
    console.error("Call waiter error:", error);
    return NextResponse.json({ error: "Erro ao chamar garçom" }, { status: 500 });
  }
}
