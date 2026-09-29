import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/migrate-item - Move item ou mesa inteira para outra comanda
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Acesso não autorizado para esta função" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { itemId, sourceComandaId, targetComandaId } = body;

    if (!targetComandaId) {
      return NextResponse.json(
        { error: "Comanda de destino é obrigatória" },
        { status: 400 }
      );
    }

    const targetComanda = await prisma.comanda.findUnique({
      where: { id: targetComandaId },
    });

    if (!targetComanda) {
      return NextResponse.json({ error: "Comanda de destino não encontrada" }, { status: 404 });
    }

    // CASO 1: TRANSFERÊNCIA DA MESA INTEIRA (Sem itemId, mas com sourceComandaId)
    if (!itemId && sourceComandaId) {
      const sourceComanda = await prisma.comanda.findUnique({
        where: { id: sourceComandaId },
      });

      if (!sourceComanda) {
        return NextResponse.json({ error: "Comanda de origem não encontrada" }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        // 1. Transfere todos os pedidos não cancelados/entregues para a mesa de destino
        await tx.order.updateMany({
          where: {
            comandaId: sourceComandaId,
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
          },
          data: { comandaId: targetComandaId },
        });

        // 2. Destino fica OCUPADA e herda o responsável se o destino não tiver
        await tx.comanda.update({
          where: { id: targetComandaId },
          data: {
            status: "OCUPADA",
            responsibleName: targetComanda.responsibleName || sourceComanda.responsibleName || null,
          },
        });

        // 3. Origem fica LIVRE
        await tx.comanda.update({
          where: { id: sourceComandaId },
          data: { status: "LIVRE", responsibleName: null },
        });

        // 4. Transfere histórico de pagamentos parciais no SystemConfig
        const sourcePayConfig = await tx.systemConfig.findUnique({
          where: { key: `comanda_payments_${sourceComandaId}` },
        });
        if (sourcePayConfig) {
          const targetPayConfig = await tx.systemConfig.findUnique({
            where: { key: `comanda_payments_${targetComandaId}` },
          });
          const sourcePays = JSON.parse(sourcePayConfig.value || "[]");
          const targetPays = targetPayConfig ? JSON.parse(targetPayConfig.value || "[]") : [];
          const mergedPays = [...targetPays, ...sourcePays];

          await tx.systemConfig.upsert({
            where: { key: `comanda_payments_${targetComandaId}` },
            create: { key: `comanda_payments_${targetComandaId}`, value: JSON.stringify(mergedPays) },
            update: { value: JSON.stringify(mergedPays) },
          });

          await tx.systemConfig.delete({
            where: { key: `comanda_payments_${sourceComandaId}` },
          }).catch(() => {});
        }
      });

      return NextResponse.json({
        success: true,
        message: `Mesa #${sourceComanda.number} transferida inteiramente para a Mesa #${targetComanda.number}!`,
      });
    }

    // CASO 2: MIGRAÇÃO DE UM ITEM ESPECÍFICO
    if (!itemId) {
      return NextResponse.json({ error: "ID do item é obrigatório para migração de item" }, { status: 400 });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const itemSourceOrderId = item.orderId;
    const itemSourceComandaId = item.order.comandaId;

    // Executa migração inteira dentro de transação atômica
    await prisma.$transaction(async (tx) => {
      // 1. Busca pedido ativo na comanda de destino ou cria um novo
      let targetOrder = await tx.order.findFirst({
        where: {
          comandaId: targetComandaId,
          status: { notIn: ["ENTREGUE", "CANCELADO"] },
        },
      });

      if (!targetOrder) {
        targetOrder = await tx.order.create({
          data: {
            type: "COMANDA",
            status: "EM_PREPARO",
            customerName: targetComanda.responsibleName || `Mesa ${targetComanda.number}`,
            customerPhone: item.order.customerPhone || `mesa-${targetComanda.number}`,
            paymentMethod: "DINHEIRO",
            subtotal: item.totalPrice,
            deliveryFee: 0,
            total: item.totalPrice,
            comandaId: targetComandaId,
            preparedAt: new Date(),
          },
        });
      }

      // 2. Transfere o item para o pedido de destino
      await tx.orderItem.update({
        where: { id: itemId },
        data: { orderId: targetOrder.id },
      });

      // 3. Recalcula totais do pedido de origem
      const remainingSourceItems = await tx.orderItem.findMany({
        where: { orderId: itemSourceOrderId },
      });

      if (remainingSourceItems.length === 0) {
        await tx.order.update({
          where: { id: itemSourceOrderId },
          data: { status: "CANCELADO", subtotal: 0, total: 0 },
        });
      } else {
        const sourceSubtotal = roundCurrency(remainingSourceItems.reduce((sum, i) => sum + i.totalPrice, 0));
        await tx.order.update({
          where: { id: itemSourceOrderId },
          data: {
            subtotal: sourceSubtotal,
            total: roundCurrency(sourceSubtotal + (item.order.deliveryFee || 0)),
          },
        });
      }

      // 4. Recalcula totais do pedido de destino
      const targetItems = await tx.orderItem.findMany({
        where: { orderId: targetOrder.id },
      });
      const targetSubtotal = roundCurrency(targetItems.reduce((sum, i) => sum + i.totalPrice, 0));
      await tx.order.update({
        where: { id: targetOrder.id },
        data: {
          subtotal: targetSubtotal,
          total: roundCurrency(targetSubtotal + (targetOrder.deliveryFee || 0)),
        },
      });

      // 5. Atualiza comanda de destino para OCUPADA
      await tx.comanda.update({
        where: { id: targetComandaId },
        data: { status: "OCUPADA" },
      });

      // 6. Verifica comanda de origem
      if (itemSourceComandaId) {
        const activeSourceOrders = await tx.order.count({
          where: {
            comandaId: itemSourceComandaId,
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
          },
        });
        if (activeSourceOrders === 0) {
          await tx.comanda.update({
            where: { id: itemSourceComandaId },
            data: { status: "LIVRE" },
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Item migrado com sucesso para a Mesa #${targetComanda.number}!`,
    });
  } catch (error) {
    console.error("Migrate item error:", error);
    return NextResponse.json({ error: "Erro ao migrar item entre comandas" }, { status: 500 });
  }
}
