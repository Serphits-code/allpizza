import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Rate limiting restrito para impedir varredura de base de clientes por telefone
const lookupLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 500,
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = lookupLimiter.check(6, `lookup_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Limite de consultas excedido. Por favor, tente novamente mais tarde." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawPhone = searchParams.get("phone");

  if (!rawPhone) {
    return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 });
  }

  const phoneKey = normalizeContactPhoneKey(rawPhone);

  if (!phoneKey || phoneKey.length < 10) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }

  try {
    // Busca os pedidos mais recentes do cliente por telefone
    const pastOrders = await prisma.order.findMany({
      where: { customerPhone: phoneKey },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        customerName: true,
        customerAddress: true,
        addressNumber: true,
        reference: true,
        customerLat: true,
        customerLng: true,
      },
    });

    if (pastOrders.length === 0) {
      return NextResponse.json({ found: false });
    }

    // Pega o nome do pedido mais recente
    const name = pastOrders[0].customerName;

    // Agrupa e filtra até 3 endereços únicos para auto-completar do próprio cliente
    const addressesMap = new Map<string, any>();
    for (const order of pastOrders) {
      if (!order.customerAddress) continue;

      const key = `${order.customerAddress.toLowerCase()}|${(order.addressNumber || "").toLowerCase()}`;
      if (!addressesMap.has(key)) {
        addressesMap.set(key, {
          address: order.customerAddress,
          number: order.addressNumber || "",
          reference: order.reference || "",
          lat: order.customerLat,
          lng: order.customerLng,
        });
      }

      if (addressesMap.size >= 3) {
        break;
      }
    }

    const uniqueAddresses = Array.from(addressesMap.values());

    return NextResponse.json({
      found: true,
      name,
      addresses: uniqueAddresses,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
