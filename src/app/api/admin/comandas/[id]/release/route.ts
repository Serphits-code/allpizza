import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/apiAuth";
import { sseManager } from "@/lib/sse";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/:id/release - Libera a comanda e finaliza os pedidos abertos
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Acesso não autorizado para esta função" }, { status: 403 });
  }

  const { id } = params;

  try {
    const comanda = await prisma.comanda.findUnique({
      where: { id },
    });

    if (!comanda) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    // 1. Busca todos os pedidos ativos da comanda
    const activeOrders = await prisma.order.findMany({
      where: {
        comandaId: id,
        status: { notIn: ["CANCELADO"] },
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

    // 2. Busca pagamentos / baixas da comanda no SystemConfig
    const paymentsConfig = await prisma.systemConfig.findUnique({
      where: { key: `comanda_payments_${id}` },
    });
    const comandaPayments = paymentsConfig?.value ? JSON.parse(paymentsConfig.value) : [];

    // Formata o resumo das baixas para observação/conferência
    const baixasSummary = comandaPayments
      .map((p: any) => `${p.method}: R$ ${Number(p.amount || 0).toFixed(2).replace(".", ",")}`)
      .join(" | ");

    // Determina o método de pagamento predominante para o enum
    let primaryMethod: "PIX" | "DINHEIRO" | "CREDITO" | "DEBITO" = "PIX";
    if (comandaPayments.length > 0) {
      const methodTotals: Record<string, number> = {};
      comandaPayments.forEach((p: any) => {
        methodTotals[p.method] = (methodTotals[p.method] || 0) + Number(p.amount || 0);
      });
      let maxMethod = "PIX";
      let maxVal = -1;
      for (const [m, val] of Object.entries(methodTotals)) {
        if (val > maxVal && ["PIX", "DINHEIRO", "CREDITO", "DEBITO"].includes(m)) {
          maxVal = val;
          maxMethod = m;
        }
      }
      primaryMethod = maxMethod as any;
    }

    // 3. Garante que todas as baixas estejam consolidadas no histórico diário permanente
    const todayStr = new Date().toISOString().split("T")[0];
    const dailyKey = `daily_comanda_payments_${todayStr}`;
    const dailyConfig = await prisma.systemConfig.findUnique({ where: { key: dailyKey } });
    const dailyPayments: any[] = dailyConfig ? JSON.parse(dailyConfig.value || "[]") : [];
    comandaPayments.forEach((p: any) => {
      if (!dailyPayments.some((dp) => dp.id === p.id)) {
        dailyPayments.push({
          ...p,
          comandaId: id,
          comandaNumber: comanda.number,
          responsibleName: comanda.responsibleName || null,
        });
      }
    });
    await prisma.systemConfig.upsert({
      where: { key: dailyKey },
      create: { key: dailyKey, value: JSON.stringify(dailyPayments) },
      update: { value: JSON.stringify(dailyPayments) },
    });

    // 4. Executa a transação atômica de finalização dos pedidos e liberação da mesa
    const updatedOrdersList = await prisma.$transaction(async (tx) => {
      const finishedOrders = [];

      for (const ord of activeOrders) {
        let noteWithBaixas = ord.notes || "";
        if (baixasSummary && !noteWithBaixas.includes("Baixas:")) {
          noteWithBaixas = noteWithBaixas ? `${noteWithBaixas} | Baixas: ${baixasSummary}` : `Baixas: ${baixasSummary}`;
        }

        const updated = await tx.order.update({
          where: { id: ord.id },
          data: {
            status: "ENTREGUE",
            deliveredAt: new Date(),
            paymentMethod: primaryMethod,
            notes: noteWithBaixas || null,
            // Mantém comandaId: id para preservar o vínculo histórico e identificação da mesa
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

        // Salva os pagamentos (baixas) vinculados a este pedido
        await tx.systemConfig.upsert({
          where: { key: `order_payments_${ord.id}` },
          create: { key: `order_payments_${ord.id}`, value: JSON.stringify(comandaPayments) },
          update: { value: JSON.stringify(comandaPayments) },
        });

        finishedOrders.push({
          ...updated,
          payments: comandaPayments,
        });
      }

      // Limpa os pagamentos temporários da mesa aberta (pois agora foi 100% quitada e liberada)
      await tx.systemConfig.delete({
        where: { key: `comanda_payments_${id}` },
      }).catch(() => {});

      // Atualiza a comanda para LIVRE e limpa o nome do responsável
      await tx.comanda.update({
        where: { id },
        data: {
          status: "LIVRE",
          responsibleName: null,
        },
      });

      return finishedOrders;
    });

    // 5. Publica eventos SSE para cada pedido atualizado (vai direto para a coluna Concluídos no Kanban)
    for (const ord of updatedOrdersList) {
      sseManager.publish("order_updated", ord);
    }
    sseManager.publish("table_released", { comandaId: id, number: comanda.number });

    return NextResponse.json({
      success: true,
      message: `Comanda #${comanda.number} quitada e liberada com sucesso! ${updatedOrdersList.length} pedido(s) concluído(s).`,
      comanda: { ...comanda, status: "LIVRE", responsibleName: null },
      orders: updatedOrdersList,
    });
  } catch (error) {
    console.error("Release comanda error:", error);
    return NextResponse.json({ error: "Erro ao liberar comanda" }, { status: 500 });
  }
}
