import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const customerOrdersLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 500,
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = customerOrdersLimiter.check(40, `cust_orders_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um instante antes de tentar novamente." },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const phoneParam = searchParams.get("phone");
    const idsParam = searchParams.get("ids");

    let whereClause: any = null;

    if (phoneParam && phoneParam.trim().length >= 8) {
      const normalizedPhone = normalizeContactPhoneKey(phoneParam);
      whereClause = {
        OR: [
          { customerPhone: normalizedPhone },
          { customerPhone: phoneParam.trim() },
          { customerPhone: { contains: normalizedPhone.slice(-8) } },
        ],
      };
    } else if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        whereClause = {
          id: { in: ids },
        };
      }
    }

    if (!whereClause) {
      return NextResponse.json({
        success: true,
        orders: [],
        customerName: null,
        favoriteCategory: null,
        counts: { total: 0, inProgress: 0, finished: 0, canceled: 0 },
      });
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            flavors: true,
            toppings: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        orders: [],
        customerName: null,
        favoriteCategory: null,
        counts: { total: 0, inProgress: 0, finished: 0, canceled: 0 },
      });
    }

    // Identifica nome mais recente do cliente
    const latestOrder = orders[0];
    const customerName = latestOrder.customerName || "Cliente";

    // Calcula categoria favorita do cliente
    const categoryCounts: { [cat: string]: number } = {};
    orders.forEach((o) => {
      if (o.status !== "CANCELADO") {
        (o.items || []).forEach((it) => {
          (it.flavors || []).forEach((f) => {
            const cat = f.categoryName || "Pizzas";
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          });
          if (!it.isPizza) {
            categoryCounts["Acompanhamentos"] = (categoryCounts["Acompanhamentos"] || 0) + 1;
          }
        });
      }
    });

    let favoriteCategory = "Pizzas";
    let maxCount = 0;
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        favoriteCategory = cat;
      }
    });

    // Contadores de status conforme as abas do Print 1
    let inProgress = 0;
    let finished = 0;
    let canceled = 0;

    orders.forEach((o) => {
      if (o.status === "ENTREGUE") {
        finished++;
      } else if (o.status === "CANCELADO") {
        canceled++;
      } else {
        inProgress++;
      }
    });

    return NextResponse.json({
      success: true,
      orders,
      customerName,
      favoriteCategory,
      counts: {
        total: orders.length,
        inProgress,
        finished,
        canceled,
      },
    });
  } catch (error) {
    console.error("Customer orders API error:", error);
    return NextResponse.json({ error: "Erro interno ao buscar pedidos do cliente" }, { status: 500 });
  }
}
