import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { OrderStatus, OrderType } from "@prisma/client";
import { authenticateApiRequest } from "@/lib/apiAuth";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Autenticação e Autorização RBAC ou API Key do Desktop
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "KITCHEN", "GARCOM"]);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const userRole = auth.user.role;

  try {
    const { id } = params;
    const { status } = await request.json();

    if (!status || !Object.values(OrderStatus).includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    // Carrega dados atuais do pedido
    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // Impede que usuários não-admin revertam pedidos já finalizados/entregues
    if (
      (existingOrder.status === OrderStatus.ENTREGUE || existingOrder.status === OrderStatus.CANCELADO) &&
      status !== existingOrder.status &&
      userRole !== "ADMIN" &&
      userRole !== "MANAGER"
    ) {
      return NextResponse.json(
        { error: "Apenas administradores podem reabrir pedidos entregues ou cancelados" },
        { status: 403 }
      );
    }

    // Define os timestamps de transição de estado
    const updateData: any = { status };

    if (status === OrderStatus.EM_PREPARO && !existingOrder.preparedAt) {
      updateData.preparedAt = new Date();
    } else if (status === OrderStatus.EM_ROTA && !existingOrder.sentAt) {
      updateData.sentAt = new Date();
    } else if (status === OrderStatus.PRONTO_RETIRADA && !existingOrder.readyForPickupAt) {
      updateData.readyForPickupAt = new Date();
    } else if (status === OrderStatus.ENTREGUE && !existingOrder.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    // Salva atualização no banco
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
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

    // Publica alteração de status para o Kanban Board via SSE
    sseManager.publish("order_updated", updatedOrder);

    // Se for pedido de mesa pronto para servir, dispara alerta específico para a tela do garçom
    if (
      status === OrderStatus.PRONTO_RETIRADA &&
      (updatedOrder.type === OrderType.COMANDA || updatedOrder.comandaId)
    ) {
      sseManager.publish("table_order_ready", updatedOrder);
      console.log(`[SSE] Pedido de mesa #${updatedOrder.orderNumber} (Mesa ${updatedOrder.comanda?.number || "—"}) marcado como pronto para servir!`);
    }

    // Se o pedido entra EM_PREPARO, disparamos a notificação estruturada para a bobina térmica
    if (status === OrderStatus.EM_PREPARO) {
      const printPayload = {
        action: "print_receipt",
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          type: updatedOrder.type,
          customerName: updatedOrder.customerName,
          customerPhone: updatedOrder.customerPhone,
          customerAddress: updatedOrder.customerAddress,
          addressNumber: updatedOrder.addressNumber,
          reference: updatedOrder.reference,
          paymentMethod: updatedOrder.paymentMethod,
          changeFor: updatedOrder.changeFor,
          subtotal: updatedOrder.subtotal,
          deliveryFee: updatedOrder.deliveryFee,
          total: updatedOrder.total,
          notes: updatedOrder.notes,
          createdAt: updatedOrder.createdAt,
          items: updatedOrder.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.basePrice,
            totalPrice: item.totalPrice,
            isPizza: item.isPizza,
            pizzaSize: item.pizzaSize,
            crustType: item.crustType,
            crustPrice: item.crustPrice,
            flavors: item.flavors.map((f) => ({
              name: f.flavorName,
              categoryName: f.categoryName,
            })),
          })),
        },
      };

      // Dispara payload específico para impressora térmica no stream SSE
      sseManager.publish("print_order", printPayload);
      console.log(`[SSE] Print payload publicado para pedido #${updatedOrder.orderNumber}`);
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("Order status update error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
