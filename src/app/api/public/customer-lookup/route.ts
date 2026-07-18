import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";

export async function GET(request: Request) {
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
      take: 20,
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

    // Agrupa e filtra até 5 endereços únicos
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

      if (addressesMap.size >= 5) {
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
