import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET /api/admin/summary?date=YYYY-MM-DD
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    const targetDate = dateParam ? new Date(dateParam) : new Date();
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Busca paralela de pedidos do dia, config e pedidos travados
    const [orders, config, stalledOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          driver: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            include: {
              flavors: true,
              toppings: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.systemConfig.findUnique({
        where: { key: "delivery_last_closed_at" },
      }),
      prisma.order.findMany({
        where: {
          type: "DELIVERY",
          status: { in: ["NOVO", "EM_PREPARO", "EM_ROTA"] },
          createdAt: { lte: startOfDay },
        },
        include: {
          driver: {
            select: { id: true, name: true },
          },
          items: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const billableOrders = orders.filter((o) => o.status !== "CANCELADO");
    const total = roundCurrency(billableOrders.reduce((sum, o) => sum + (o.total || 0), 0));
    const count = billableOrders.length;
    const canceledCount = orders.filter((o) => o.status === "CANCELADO").length;
    const finishedCount = billableOrders.filter(
      (o) => o.status === "ENTREGUE" || o.status === "PRONTO_RETIRADA"
    ).length;
    const averageTicket = count > 0 ? roundCurrency(total / count) : 0;

    const now = new Date();
    const stalledDeliveryAlert = stalledOrders.map((o) => {
      const diffMs = now.getTime() - new Date(o.createdAt).getTime();
      const elapsedHours = Math.floor(diffMs / (1000 * 60 * 60));
      const elapsedMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerAddress: o.customerAddress,
        addressNumber: o.addressNumber,
        total: o.total,
        driverName: o.driver?.name || null,
        itemsCount: o.items.length,
        createdAt: o.createdAt,
        elapsedTimeFormatted: `${elapsedHours}h ${elapsedMinutes}min`,
      };
    });

    return NextResponse.json({
      date: startOfDay.toISOString().split("T")[0],
      total,
      count,
      canceledCount,
      finishedCount,
      averageTicket,
      orders,
      stalledDeliveryAlert,
    });
  } catch (error) {
    console.error("Daily summary error:", error);
    return NextResponse.json({ error: "Erro ao gerar resumo diário" }, { status: 500 });
  }
}
