import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

interface DailyPaymentRecord {
  id: string;
  comandaId?: string;
  comandaNumber?: number;
  responsibleName?: string | null;
  method: "PIX" | "DINHEIRO" | "DEBITO" | "CREDITO";
  amount: number;
  changeFor?: number | null;
  troco?: number | null;
  createdAt: string;
}

// GET /api/admin/summary?date=YYYY-MM-DD
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    let startOfDay: Date;
    let endOfDay: Date;
    let dateStr: string;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split("-").map(Number);
      startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
      endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
      dateStr = dateParam;
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    // 1. Busca paralela de pedidos do dia, configs de pagamentos de comanda e pedidos travados
    const [orders, dailyPaymentsConfig, activeComandaConfigs, stalledOrders] = await Promise.all([
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
        where: { key: `daily_comanda_payments_${dateStr}` },
      }),
      prisma.systemConfig.findMany({
        where: { key: { startsWith: "comanda_payments_" } },
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

    // Busca comandas para mapear número e responsável
    const allComandas = await prisma.comanda.findMany({
      select: { id: true, number: true, responsibleName: true },
    });
    const comandaInfoMap = new Map<string, { number: number; responsibleName?: string | null }>();
    allComandas.forEach((c) => comandaInfoMap.set(c.id, { number: c.number, responsibleName: c.responsibleName }));

    // 2. Consolidação de Baixas de Comandas/Mesas do Dia
    const paymentsMap = new Map<string, DailyPaymentRecord>();

    // 2.1 Adiciona baixas salvas no histórico diário permanente
    if (dailyPaymentsConfig?.value) {
      try {
        const parsed: DailyPaymentRecord[] = JSON.parse(dailyPaymentsConfig.value);
        parsed.forEach((p) => {
          const info = p.comandaId ? comandaInfoMap.get(p.comandaId) : undefined;
          paymentsMap.set(p.id, {
            ...p,
            comandaNumber: p.comandaNumber ?? info?.number,
            responsibleName: p.responsibleName ?? info?.responsibleName ?? null,
          });
        });
      } catch (e) {
        console.error("Erro ao ler daily_comanda_payments:", e);
      }
    }

    // 2.2 Adiciona também baixas de comandas ativas hoje que porventura ainda não fecharam a conta
    activeComandaConfigs.forEach((cfg) => {
      try {
        const comandaId = cfg.key.replace("comanda_payments_", "");
        const info = comandaInfoMap.get(comandaId);
        const parsed: any[] = JSON.parse(cfg.value || "[]");
        parsed.forEach((p) => {
          if (p.createdAt) {
            const pDate = new Date(p.createdAt);
            if (pDate >= startOfDay && pDate <= endOfDay) {
              if (!paymentsMap.has(p.id)) {
                paymentsMap.set(p.id, {
                  id: p.id,
                  comandaId,
                  comandaNumber: info?.number,
                  responsibleName: info?.responsibleName || null,
                  method: p.method,
                  amount: roundCurrency(p.amount || 0),
                  changeFor: p.changeFor,
                  troco: p.troco,
                  createdAt: p.createdAt,
                });
              }
            }
          }
        });
      } catch (e) {}
    });

    const comandaPayments = Array.from(paymentsMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 3. Cálculos de Baixas de Comanda
    let comandasPix = 0;
    let comandasDinheiro = 0;
    let comandasDebito = 0;
    let comandasCredito = 0;

    comandaPayments.forEach((p) => {
      const amt = roundCurrency(p.amount || 0);
      if (p.method === "PIX") comandasPix += amt;
      else if (p.method === "DINHEIRO") comandasDinheiro += amt;
      else if (p.method === "DEBITO") comandasDebito += amt;
      else if (p.method === "CREDITO") comandasCredito += amt;
    });

    comandasPix = roundCurrency(comandasPix);
    comandasDinheiro = roundCurrency(comandasDinheiro);
    comandasDebito = roundCurrency(comandasDebito);
    comandasCredito = roundCurrency(comandasCredito);
    const comandasTotal = roundCurrency(comandasPix + comandasDinheiro + comandasDebito + comandasCredito);

    // 4. Cálculos de Pedidos (Delivery e Retirada)
    // Conforme regra de negócio: apenas pedidos que chegaram a ser CONCLUÍDOS no kanban e não cancelados
    // têm seus valores somados nos totais gerais.
    // Pedidos cancelados constam na listagem com seus cards e valores para conferência, mas NÃO somam nos valores gerais.
    const concludedOrders = orders.filter(
      (o) => o.status === "ENTREGUE" || o.status === "PRONTO_RETIRADA"
    );
    const nonComandaConcludedOrders = concludedOrders.filter((o) => o.type !== "COMANDA");

    let ordersPix = 0;
    let ordersDinheiro = 0;
    let ordersDebito = 0;
    let ordersCredito = 0;
    let totalDeliveryFee = 0;

    nonComandaConcludedOrders.forEach((o) => {
      const tot = roundCurrency(o.total || 0);
      if (o.paymentMethod === "PIX") ordersPix += tot;
      else if (o.paymentMethod === "DINHEIRO") ordersDinheiro += tot;
      else if (o.paymentMethod === "DEBITO") ordersDebito += tot;
      else if (o.paymentMethod === "CREDITO") ordersCredito += tot;
    });

    concludedOrders.forEach((o) => {
      if (o.type === "DELIVERY") {
        totalDeliveryFee += roundCurrency(o.deliveryFee || 0);
      }
    });

    ordersPix = roundCurrency(ordersPix);
    ordersDinheiro = roundCurrency(ordersDinheiro);
    ordersDebito = roundCurrency(ordersDebito);
    ordersCredito = roundCurrency(ordersCredito);
    totalDeliveryFee = roundCurrency(totalDeliveryFee);
    const ordersTotal = roundCurrency(ordersPix + ordersDinheiro + ordersDebito + ordersCredito);

    // 5. Consolidado Geral do Caixa do Dia (Pedidos Concluídos Delivery/Retirada + Baixas de Mesa)
    const totalPix = roundCurrency(ordersPix + comandasPix);
    const totalDinheiro = roundCurrency(ordersDinheiro + comandasDinheiro);
    const totalDebito = roundCurrency(ordersDebito + comandasDebito);
    const totalCredito = roundCurrency(ordersCredito + comandasCredito);
    const grandTotalRevenue = roundCurrency(totalPix + totalDinheiro + totalDebito + totalCredito);

    // Métricas operacionais
    const finishedCount = concludedOrders.length;
    const canceledCount = orders.filter((o) => o.status === "CANCELADO").length;
    const count = finishedCount;
    const averageTicket = finishedCount > 0 ? roundCurrency(grandTotalRevenue / finishedCount) : 0;

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

    // Enriquece pedidos de comanda com suas respectivas baixas
    const comandaOrders = orders.filter((o) => o.type === "COMANDA" || Boolean(o.comandaId));
    const orderIds = comandaOrders.map((o) => o.id);
    const orderPaymentConfigs = orderIds.length > 0
      ? await prisma.systemConfig.findMany({
          where: { key: { in: orderIds.map((id) => `order_payments_${id}`) } },
        })
      : [];

    const orderPaymentsMap = new Map<string, any[]>();
    orderPaymentConfigs.forEach((cfg) => {
      const oid = cfg.key.replace("order_payments_", "");
      try {
        orderPaymentsMap.set(oid, JSON.parse(cfg.value));
      } catch (e) {}
    });

    const enrichedOrders = orders.map((o) => {
      let pays = orderPaymentsMap.get(o.id);
      if (!pays || pays.length === 0) {
        if (o.comandaId) {
          pays = comandaPayments.filter((p) => p.comandaId === o.comandaId);
        }
      }
      return {
        ...o,
        payments: pays || [],
      };
    });

    return NextResponse.json({
      date: dateStr,
      total: grandTotalRevenue,
      totalRevenue: grandTotalRevenue,
      totalDeliveryFee,
      totalPix,
      totalDinheiro,
      totalDebito,
      totalCredito,
      financial: {
        totalRevenue: grandTotalRevenue,
        totalDeliveryFee,
        totalPix,
        totalDinheiro,
        totalDebito,
        totalCredito,
        ordersBreakdown: {
          total: ordersTotal,
          pix: ordersPix,
          dinheiro: ordersDinheiro,
          debito: ordersDebito,
          credito: ordersCredito,
          deliveryFee: totalDeliveryFee,
          count: nonComandaConcludedOrders.length,
        },
        comandasBreakdown: {
          total: comandasTotal,
          pix: comandasPix,
          dinheiro: comandasDinheiro,
          debito: comandasDebito,
          credito: comandasCredito,
          count: comandaPayments.length,
          payments: comandaPayments,
        },
      },
      count,
      canceledCount,
      finishedCount,
      averageTicket,
      orders: enrichedOrders,
      comandaPayments,
      stalledDeliveryAlert,
    });
  } catch (error) {
    console.error("Daily summary error:", error);
    return NextResponse.json({ error: "Erro ao gerar resumo diário" }, { status: 500 });
  }
}
