import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from") || searchParams.get("start");
    const toParam = searchParams.get("to") || searchParams.get("end");
    const weekdayParam = searchParams.get("weekday");

    const parseLocalDate = (dateStr: string, isEndOfDay: boolean = false): Date => {
      const parts = dateStr.split("-").map((v) => parseInt(v, 10));
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const [year, month, day] = parts;
        return isEndOfDay
          ? new Date(year, month - 1, day, 23, 59, 59, 999)
          : new Date(year, month - 1, day, 0, 0, 0, 0);
      }
      const fallback = new Date();
      if (isEndOfDay) {
        fallback.setHours(23, 59, 59, 999);
      } else {
        fallback.setDate(fallback.getDate() - 30);
        fallback.setHours(0, 0, 0, 0);
      }
      return fallback;
    };

    let startDate: Date;
    let endDate: Date;

    if (fromParam) {
      startDate = parseLocalDate(fromParam, false);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    if (toParam) {
      endDate = parseLocalDate(toParam, true);
    } else {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    // Busca pedidos do período
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: {
          include: {
            flavors: true,
            toppings: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalOrdersCount = orders.length;

    // Filtra pedidos não cancelados para faturamento
    const billableOrders = orders.filter((o) => o.status !== "CANCELADO");
    const canceledOrders = orders.filter((o) => o.status === "CANCELADO");

    // 1. KPIs
    const totalSales = billableOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderCount = billableOrders.length;
    const averageTicket = orderCount > 0 ? totalSales / orderCount : 0;
    const itemsSold = billableOrders.reduce(
      (sum, o) => sum + o.items.reduce((iSum, item) => iSum + item.quantity, 0),
      0
    );
    const deliveryFees = billableOrders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const cancellations = canceledOrders.length;
    const cancellationRate = totalOrdersCount > 0 ? (cancellations / totalOrdersCount) * 100 : 0;

    const activeOrders = orders.filter((o) =>
      ["NOVO", "EM_PREPARO", "EM_ROTA"].includes(o.status)
    ).length;

    const pickupCount = billableOrders.filter(
      (o) => o.type === "RETIRADA" || o.status === "PRONTO_RETIRADA"
    ).length;

    // 2. Tempos por Status
    let novoTimes: number[] = [];
    let emPreparoTimes: number[] = [];
    let emRotaTimes: number[] = [];
    let balcaoTimes: number[] = [];

    for (const order of orders) {
      const created = new Date(order.createdAt).getTime();

      // Novo (criação até preparo)
      if (order.preparedAt) {
        const prep = new Date(order.preparedAt).getTime();
        const diffMin = (prep - created) / (1000 * 60);
        if (diffMin >= 0 && diffMin < 2880) novoTimes.push(diffMin);
      }

      // Em preparo (preparo até pronto/saída/entrega)
      if (order.preparedAt) {
        const prep = new Date(order.preparedAt).getTime();
        const endPrep = order.readyForPickupAt || order.sentAt || order.deliveredAt;
        if (endPrep) {
          const end = new Date(endPrep).getTime();
          const diffMin = (end - prep) / (1000 * 60);
          if (diffMin >= 0 && diffMin < 2880) emPreparoTimes.push(diffMin);
        }
      }

      // Em rota (saída até entrega)
      if (order.sentAt && order.deliveredAt) {
        const sent = new Date(order.sentAt).getTime();
        const deliv = new Date(order.deliveredAt).getTime();
        const diffMin = (deliv - sent) / (1000 * 60);
        if (diffMin >= 0 && diffMin < 2880) emRotaTimes.push(diffMin);
      }

      // Até balcão
      if (order.type === "RETIRADA" || order.type === "COMANDA" || order.status === "PRONTO_RETIRADA") {
        const endPoint = order.readyForPickupAt || order.deliveredAt;
        if (endPoint) {
          const end = new Date(endPoint).getTime();
          const diffMin = (end - created) / (1000 * 60);
          if (diffMin >= 0 && diffMin < 2880) balcaoTimes.push(diffMin);
        }
      }
    }

    const calcAvg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const averageStatusTimes = {
      novoMin: calcAvg(novoTimes),
      emPreparoMin: calcAvg(emPreparoTimes),
      emRotaMin: calcAvg(emRotaTimes),
      balcaoMin: calcAvg(balcaoTimes),
    };

    // 3. Pico de Horário
    const hourlyCounts = Array(24).fill(0);
    for (const ord of billableOrders) {
      const h = new Date(ord.createdAt).getHours();
      hourlyCounts[h]++;
    }
    let peakHour = 20;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourlyCounts[h] > peakCount) {
        peakCount = hourlyCounts[h];
        peakHour = h;
      }
    }

    // 4. Status dos Pedidos
    const statusCounts = {
      novo: orders.filter((o) => o.status === "NOVO").length,
      em_preparo: orders.filter((o) => o.status === "EM_PREPARO").length,
      em_rota: orders.filter((o) => o.status === "EM_ROTA").length,
      pronto_retirada: orders.filter((o) => o.status === "PRONTO_RETIRADA").length,
      entregue: orders.filter((o) => o.status === "ENTREGUE").length,
      cancelado: canceledOrders.length,
    };

    // 5. Canais de Pedido
    const deliveryOrders = billableOrders.filter((o) => o.type === "DELIVERY");
    const retiradaOrders = billableOrders.filter((o) => o.type === "RETIRADA");
    const comandaOrders = billableOrders.filter((o) => o.type === "COMANDA");

    const channels = [
      {
        key: "DELIVERY",
        label: "Delivery",
        count: deliveryOrders.length,
        revenue: deliveryOrders.reduce((s, o) => s + o.total, 0),
      },
      {
        key: "RETIRADA",
        label: "Retirada",
        count: retiradaOrders.length,
        revenue: retiradaOrders.reduce((s, o) => s + o.total, 0),
      },
    ];

    if (comandaOrders.length > 0) {
      channels.push({
        key: "COMANDA",
        label: "Mesa / Salão",
        count: comandaOrders.length,
        revenue: comandaOrders.reduce((s, o) => s + o.total, 0),
      });
    }

    // 6. Pagamentos
    const paymentMethods = [
      { key: "DINHEIRO", label: "Dinheiro" },
      { key: "PIX", label: "PIX" },
      { key: "CREDITO", label: "Cartão de Crédito" },
      { key: "DEBITO", label: "Cartão de Débito" },
    ];

    const payments = paymentMethods.map((pm) => {
      const filtered = billableOrders.filter((o) => o.paymentMethod === pm.key);
      return {
        key: pm.key,
        label: pm.label,
        count: filtered.length,
        revenue: filtered.reduce((s, o) => s + o.total, 0),
      };
    });

    // 7. Contagem de Ocorrências dos Dias da Semana
    const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0]; // 0=Dom, 1=Seg, ..., 6=Sab
    const curDate = new Date(startDate);
    while (curDate <= endDate) {
      weekdayOccurrences[curDate.getDay()]++;
      curDate.setDate(curDate.getDate() + 1);
    }

    // Dias ordenados de Segunda (1) a Domingo (0) para bater com a interface do usuário
    const orderedWeekdays = [
      { dayIndex: 1, dayName: "Segunda" },
      { dayIndex: 2, dayName: "Terça" },
      { dayIndex: 3, dayName: "Quarta" },
      { dayIndex: 4, dayName: "Quinta" },
      { dayIndex: 5, dayName: "Sexta" },
      { dayIndex: 6, dayName: "Sábado" },
      { dayIndex: 0, dayName: "Domingo" },
    ];

    const weekdaySales = orderedWeekdays.map((w) => {
      const dayOrders = billableOrders.filter(
        (o) => new Date(o.createdAt).getDay() === w.dayIndex
      );
      const count = dayOrders.length;
      const totalRevenue = dayOrders.reduce((s, o) => s + o.total, 0);
      const occurrences = Math.max(1, weekdayOccurrences[w.dayIndex]);
      const avgOrders = count / occurrences;
      const avgRevenue = totalRevenue / occurrences;

      return {
        dayIndex: w.dayIndex,
        dayName: w.dayName,
        occurrences,
        count,
        averageOrders: Math.round(avgOrders * 10) / 10, // e.g. 8.2, 18.2
        totalRevenue,
        averageRevenue: Math.round(avgRevenue * 100) / 100,
      };
    });

    // 8. Top 6 Produtos
    const productStatsMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of billableOrders) {
      for (const item of order.items) {
        const pName = item.name || "Produto";
        const cur = productStatsMap.get(pName) || { name: pName, quantity: 0, revenue: 0 };
        cur.quantity += item.quantity;
        cur.revenue += item.totalPrice;
        productStatsMap.set(pName, cur);
      }
    }

    const topProducts = Array.from(productStatsMap.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 6);

    // 9. Ingredientes Favoritos
    const flavorStatsMap = new Map<string, { name: string; count: number; baseCount: number; extraCount: number }>();
    let totalIngredientOutputs = 0;

    for (const order of billableOrders) {
      for (const item of order.items) {
        for (const flavor of item.flavors) {
          const fName = flavor.flavorName;
          const cur = flavorStatsMap.get(fName) || { name: fName, count: 0, baseCount: 0, extraCount: 0 };
          cur.count += item.quantity;
          cur.baseCount += item.quantity;
          totalIngredientOutputs += item.quantity;
          flavorStatsMap.set(fName, cur);
        }
        for (const topping of item.toppings) {
          const tName = topping.toppingName;
          const cur = flavorStatsMap.get(tName) || { name: tName, count: 0, baseCount: 0, extraCount: 0 };
          cur.count += item.quantity;
          cur.extraCount += item.quantity;
          totalIngredientOutputs += item.quantity;
          flavorStatsMap.set(tName, cur);
        }
      }
    }

    const ingredientFavorites = Array.from(flavorStatsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return NextResponse.json({
      kpis: {
        totalSales,
        orderCount,
        averageTicket,
        itemsSold,
        activeOrders,
        deliveryFees,
        cancellations,
        cancellationRate,
        pickupCount,
      },
      averageStatusTimes,
      peakHour: {
        hour: peakHour,
        count: peakCount,
        label: `Pico: ${peakHour}h com ${peakCount} pedidos`,
      },
      statusCounts,
      channels,
      payments,
      weekdaySales,
      topProducts,
      ingredientFavorites: {
        totalOutputs: totalIngredientOutputs,
        items: ingredientFavorites,
      },
      period: {
        from: startDate.toISOString().split("T")[0],
        to: endDate.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Erro ao gerar indicadores" }, { status: 500 });
  }
}
