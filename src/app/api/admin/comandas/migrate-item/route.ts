import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/migrate-item - Move item de uma comanda para outra
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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

    // 1. Busca pedido ativo na comanda de destino ou cria um novo
    let targetOrder = await prisma.order.findFirst({
      where: {
        comandaId: targetComandaId,
        status: { notIn: ["ENTREGUE", "CANCELADO"] },
      },
    });

    if (!targetOrder) {
      targetOrder = await prisma.order.create({
        data: {
          type: "COMANDA",
          status: "EM_PREPARO",
          customerName: targetComanda.responsibleName || `Mesa ${targetComanda.number}`,
          customerPhone: "00000000000",
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
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { orderId: targetOrder.id },
    });

    // 3. Recalcula totais do pedido de origem
    const remainingSourceItems = await prisma.orderItem.findMany({
      where: { orderId: sourceOrderId },
    });

    if (remainingSourceItems.length === 0) {
      await prisma.order.update({
        where: { id: sourceOrderId },
        data: { status: "CANCELADO", subtotal: 0, total: 0 },
      });
    } else {
      const sourceSubtotal = remainingSourceItems.reduce((sum, i) => sum + i.totalPrice, 0);
      await prisma.order.update({
        where: { id: sourceOrderId },
        data: {
          subtotal: sourceSubtotal,
          total: sourceSubtotal + (item.order.deliveryFee || 0),
        },
      });
    }

    // 4. Recalcula totais do pedido de destino
    const targetItems = await prisma.orderItem.findMany({
      where: { orderId: targetOrder.id },
    });
    const targetSubtotal = targetItems.reduce((sum, i) => sum + i.totalPrice, 0);
    await prisma.order.update({
      where: { id: targetOrder.id },
      data: {
        subtotal: targetSubtotal,
        total: targetSubtotal + (targetOrder.deliveryFee || 0),
      },
    });

    // 5. Atualiza comanda de destino para OCUPADA
    await prisma.comanda.update({
      where: { id: targetComandaId },
      data: { status: "OCUPADA" },
    });

    // 6. Verifica comanda de origem
    if (sourceComandaId) {
      const activeSourceOrders = await prisma.order.count({
        where: {
          comandaId: sourceComandaId,
          status: { notIn: ["ENTREGUE", "CANCELADO"] },
        },
      });
      if (activeSourceOrders === 0) {
        await prisma.comanda.update({
          where: { id: sourceComandaId },
          data: { status: "LIVRE" },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Item migrado com sucesso para a Mesa #${targetComanda.number}!`,
    });
  } catch (error) {
    console.error("Migrate item error:", error);
    return NextResponse.json({ error: "Erro ao migrar item entre comandas" }, { status: 500 });
  }
}
