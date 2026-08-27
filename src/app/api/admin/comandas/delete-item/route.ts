import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/delete-item - Remove item de um pedido e recalcula totais
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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

    // 1. Exclui o item (as relações flavors e toppings são cascade)
    await prisma.orderItem.delete({
      where: { id: itemId },
    });

    // 2. Busca itens restantes do pedido
    const remainingItems = await prisma.orderItem.findMany({
      where: { orderId },
    });

    if (remainingItems.length === 0) {
      // Se não sobrou nenhum item, cancela ou remove o pedido
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "CANCELADO", subtotal: 0, total: 0 },
      });
    } else {
      // Recalcula subtotal e total
      const newSubtotal = remainingItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const deliveryFee = item.order.deliveryFee || 0;
      await prisma.order.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          total: newSubtotal + deliveryFee,
        },
      });
    }

    // 3. Se a comanda não tiver mais pedidos ativos, pode ser verificada
    if (comandaId) {
      const activeOrdersCount = await prisma.order.count({
        where: {
          comandaId,
          status: { notIn: ["ENTREGUE", "CANCELADO"] },
        },
      });

      if (activeOrdersCount === 0) {
        await prisma.comanda.update({
          where: { id: comandaId },
          data: { status: "LIVRE" },
        });
      }
    }

    return NextResponse.json({ success: true, message: "Item removido com sucesso!" });
  } catch (error) {
    console.error("Delete comanda item error:", error);
    return NextResponse.json({ error: "Erro ao excluir item do pedido" }, { status: 500 });
  }
}
