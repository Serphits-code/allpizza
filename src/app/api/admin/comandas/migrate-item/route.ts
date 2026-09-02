import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/migrate-item - Move item de uma comanda para outra
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "GARCOM")) {
    return NextResponse.json({ error: "Acesso não autorizado para esta função" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { itemId, targetComandaId } = body;

    if (!itemId || !targetComandaId) {
      return NextResponse.json(
        { error: "ID do item e ID da comanda de destino são obrigatórios" },
        { status: 400 }
      );
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const sourceOrderId = item.orderId;
    const sourceComandaId = item.order.comandaId;

    const targetComanda = await prisma.comanda.findUnique({
      where: { id: targetComandaId },
    });

    if (!targetComanda) {
      return NextResponse.json({ error: "Comanda de destino não encontrada" }, { status: 404 });
    }

    // Executa migração inteira dentro de transação atômica
    await prisma.$transaction(async (tx) => {
      // 1. Busca pedido ativo na comanda de destino ou cria um novo herdando o telefone/contato real
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
        where: { orderId: sourceOrderId },
      });

      if (remainingSourceItems.length === 0) {
        await tx.order.update({
          where: { id: sourceOrderId },
          data: { status: "CANCELADO", subtotal: 0, total: 0 },
        });
      } else {
        const sourceSubtotal = roundCurrency(remainingSourceItems.reduce((sum, i) => sum + i.totalPrice, 0));
        await tx.order.update({
          where: { id: sourceOrderId },
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
      if (sourceComandaId) {
        const activeSourceOrders = await tx.order.count({
          where: {
            comandaId: sourceComandaId,
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
          },
        });
        if (activeSourceOrders === 0) {
          await tx.comanda.update({
            where: { id: sourceComandaId },
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
