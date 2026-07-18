import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { OrderStatus } from "@prisma/client";
import { clearDriverActiveRoute } from "@/lib/driver-active-route";
import { notifyCustomerOrderStatus } from "@/lib/push-notifications";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const driverId = session.user.id;
  const { id } = params;

  try {
    const { action, status } = await request.json();

    // Carrega o pedido
    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // --- AÇÃO: CLAIM (Coleta para a Bag) ---
    if (action === "claim") {
      // Regra de concorrência segura utilizando transação/bloqueio ou verificação lógica
      // Verificamos se o pedido já tem outro motorista associado
      if (order.driverId && order.driverId !== driverId) {
        return NextResponse.json(
          { error: "Pedido já está na bag de outro entregador" },
          { status: 409 }
        );
      }

      // Coloca na bag do piloto conectado
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          driverId,
          status: OrderStatus.EM_ROTA, // Garante que está em rota
        },
      });

      // Limpa cache de rota ativa do motorista para recalcular
      await clearDriverActiveRoute(driverId);

      // Dispara SSE para o painel de administração atualizar
      sseManager.publish("order_updated", updatedOrder);

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    // --- AÇÃO: RELEASE (Devolução à fila pública) ---
    if (action === "release") {
      if (order.driverId !== driverId) {
        return NextResponse.json(
          { error: "Você só pode liberar pedidos que estão na sua bag" },
          { status: 403 }
        );
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          driverId: null,
          status: OrderStatus.EM_ROTA, // permanece na fila de entrega pública
        },
      });

      await clearDriverActiveRoute(driverId);

      sseManager.publish("order_updated", updatedOrder);

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    // --- AÇÃO: DELIVER (Confirmar entrega realizada) ---
    if (action === "deliver" || status === "entregue" || status === OrderStatus.ENTREGUE) {
      if (order.driverId !== driverId) {
        return NextResponse.json(
          { error: "Você só pode concluir pedidos que estão na sua bag" },
          { status: 403 }
        );
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.ENTREGUE,
          deliveredAt: new Date(),
        },
      });

      await clearDriverActiveRoute(driverId);

      // Gatilho de notificação push
      await notifyCustomerOrderStatus(id, "ENTREGUE");

      // Publica atualização via SSE
      sseManager.publish("order_updated", updatedOrder);

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("Error patching driver order:", error);
    return NextResponse.json({ error: "Erro interno ao processar pedido" }, { status: 500 });
  }
}
