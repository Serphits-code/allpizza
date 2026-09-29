import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const orderLookupLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 500,
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request);
  const rateLimitResult = orderLookupLimiter.check(30, `order_track_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Muitas consultas ao status do pedido. Aguarde um instante." },
      { status: 429 }
    );
  }

  try {
    const { id } = params;

    if (!id || id.trim() === "") {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            flavors: true,
            toppings: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // Retorna os dados necessários para acompanhamento do cliente
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        type: order.type,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        addressNumber: order.addressNumber,
        reference: order.reference,
        customerLat: order.customerLat,
        customerLng: order.customerLng,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        notes: order.notes,
        createdAt: order.createdAt,
        items: order.items,
      },
    });
  } catch (error) {
    console.error("Error fetching public order details:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
