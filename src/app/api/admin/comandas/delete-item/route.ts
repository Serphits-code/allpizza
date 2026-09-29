import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/delete-item - Remove item de um pedido e recalcula totais
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Acesso não autorizado para esta função" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json({ error: "ID do item é obrigatório" }, { status: 400 });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const orderId = item.orderId;
    const comandaId = item.order.comandaId;

    // Executa exclusão e recálculos em transação atômica
    await prisma.$transaction(async (tx) => {
      // 1. Exclui o item
      await tx.orderItem.delete({
        where: { id: itemId },
      });

      // 2. Busca itens restantes do pedido
      const remainingItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      if (remainingItems.length === 0) {
        // Se não sobrou nenhum item, cancela o pedido
        await tx.order.update({
          where: { id: orderId },
          data: { status: "CANCELADO", subtotal: 0, total: 0 },
        });
      } else {
        // Recalcula subtotal e total
        const newSubtotal = roundCurrency(remainingItems.reduce((sum, i) => sum + i.totalPrice, 0));
        const deliveryFee = item.order.deliveryFee || 0;
        await tx.order.update({
          where: { id: orderId },
          data: {
            subtotal: newSubtotal,
            total: roundCurrency(newSubtotal + deliveryFee),
          },
        });
      }

      // 3. Se a comanda não tiver mais pedidos ativos, atualiza status para LIVRE
      if (comandaId) {
        const activeOrdersCount = await tx.order.count({
          where: {
            comandaId,
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
          },
        });

        if (activeOrdersCount === 0) {
          await tx.comanda.update({
            where: { id: comandaId },
            data: { status: "LIVRE" },
          });
        }
      }
    });

    return NextResponse.json({ success: true, message: "Item removido com sucesso!" });
  } catch (error) {
    console.error("Delete comanda item error:", error);
    return NextResponse.json({ error: "Erro ao excluir item do pedido" }, { status: 500 });
  }
}
