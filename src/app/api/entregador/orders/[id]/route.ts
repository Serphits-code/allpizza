import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { OrderStatus } from "@prisma/client";
import { clearDriverActiveRoute } from "@/lib/driver-active-route";
import { notifyCustomerOrderStatus } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json(
      { error: "Acesso restrito a entregadores e administradores" },
      { status: 403 }
    );
  }

  const driverId = session.user.id;
  const { id } = params;

  try {
    const body = await request.json();
    const action = body.action || (body.status === "entregue" || body.status === OrderStatus.ENTREGUE ? "deliver" : null);

    // --- AÇÃO: CLAIM (Colocar na Bag com proteção de concorrência) ---
    if (action === "claim") {
      const updateResult = await prisma.order.updateMany({
        where: {
          id,
          status: OrderStatus.EM_ROTA,
          OR: [{ driverId: null }, { driverId }],
        },
        data: {
          driverId,
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Este pedido já foi assumido por outro entregador ou não está mais disponível em rota." },
          { status: 409 }
        );
      }

      const updatedOrder = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { flavors: true, toppings: true },
          },
        },
      });

      // Limpa cache de rota ativa
      await clearDriverActiveRoute(driverId);

      // Notifica SSE
      if (updatedOrder) {
        sseManager.publish("order_updated", updatedOrder);
      }

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    // --- AÇÃO: RELEASE (Remover da Bag / Devolver à fila pública) ---
    if (action === "release") {
      const updateResult = await prisma.order.updateMany({
        where: {
          id,
          status: OrderStatus.EM_ROTA,
          driverId,
        },
        data: {
          driverId: null,
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Você só pode devolver pedidos que estão na sua bag." },
          { status: 403 }
        );
      }

      const updatedOrder = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { flavors: true, toppings: true },
          },
        },
      });

      await clearDriverActiveRoute(driverId);

      if (updatedOrder) {
        sseManager.publish("order_updated", updatedOrder);
      }

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    // --- AÇÃO: DELIVER (Confirmar entrega realizada) ---
    if (action === "deliver") {
      const updateResult = await prisma.order.updateMany({
        where: {
          id,
          status: OrderStatus.EM_ROTA,
          driverId,
        },
        data: {
          status: OrderStatus.ENTREGUE,
          deliveredAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Você precisa colocar o pedido na sua bag antes de concluir a entrega." },
          { status: 403 }
        );
      }

      const updatedOrder = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { flavors: true, toppings: true },
          },
        },
      });

      await clearDriverActiveRoute(driverId);

      // Notifica push e SSE
      await notifyCustomerOrderStatus(id, "ENTREGUE");
      if (updatedOrder) {
        sseManager.publish("order_updated", updatedOrder);
      }

      return NextResponse.json({ success: true, order: updatedOrder });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("Error patching driver order:", error);
    return NextResponse.json({ error: "Erro interno ao processar pedido" }, { status: 500 });
  }
}
