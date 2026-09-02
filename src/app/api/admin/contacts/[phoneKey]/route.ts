import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { ContactAddress, ContactDetail } from "@/lib/admin-contacts";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET /api/admin/contacts/:phoneKey - Busca detalhes completos do cliente
export async function GET(
  request: Request,
  { params }: { params: { phoneKey: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rawPhoneKey = params.phoneKey;
  const phoneKey = normalizeContactPhoneKey(rawPhoneKey);

  try {
    // 1. Busca perfil salvo do contato
    const profile = await prisma.customerContactProfile.findUnique({
      where: { phoneKey },
    });

    // 2. Busca pedidos correspondentes ao telefone diretamente pelo índice do banco
    const customerOrders = await prisma.order.findMany({
      where: {
        customerPhone: phoneKey,
      },
      include: {
        items: {
          include: {
            flavors: true,
            toppings: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (customerOrders.length === 0 && !profile) {
      return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
    }

    const billableOrders = customerOrders.filter((o) => o.status !== "CANCELADO");
    const canceledOrders = customerOrders.filter((o) => o.status === "CANCELADO").length;

    const totalOrders = customerOrders.length;
    const validOrders = billableOrders.length;
    const totalSpent = roundCurrency(billableOrders.reduce((s, o) => s + (o.total || 0), 0));

    // Média de tempo de entrega (em minutos)
    const deliveredOrders = customerOrders.filter(
      (o) => o.status === "ENTREGUE" && o.deliveredAt && o.type === "DELIVERY"
    );
    let avgDeliveryMin = 0;
    if (deliveredOrders.length > 0) {
      const sumMin = deliveredOrders.reduce((sum, o) => {
        const diffMs = new Date(o.deliveredAt!).getTime() - new Date(o.createdAt).getTime();
        return sum + Math.max(0, diffMs / (1000 * 60));
      }, 0);
      avgDeliveryMin = Math.round(sumMin / deliveredOrders.length);
    }

    // Deduplicação de Endereços
    const addressMap = new Map<string, ContactAddress>();
    for (const ord of customerOrders) {
      if (!ord.customerAddress) continue;
      const key = `${ord.customerAddress.toLowerCase().trim()}|${(ord.addressNumber || "").trim()}|${(ord.reference || "").trim()}`;
      if (!addressMap.has(key)) {
        addressMap.set(key, {
          address: ord.customerAddress,
          number: ord.addressNumber || "S/N",
          reference: ord.reference || undefined,
          type: ord.type,
          lastUsedAt: new Date(ord.createdAt).toISOString(),
        });
      }
    }
    const addresses = Array.from(addressMap.values());

    // Categoria favorita
    const categoryCount = new Map<string, number>();
    for (const ord of billableOrders) {
      const seen = new Set<string>();
      for (const item of ord.items) {
        for (const flavor of item.flavors) {
          const cat = flavor.categoryName || "Pizzas";
          if (!seen.has(cat)) {
            seen.add(cat);
            categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
          }
        }
      }
    }
    let favoriteCategory = "Geral";
    let maxCatCount = 0;
    for (const [c, cnt] of categoryCount.entries()) {
      if (cnt > maxCatCount) {
        maxCatCount = cnt;
        favoriteCategory = c;
      }
    }

    const latestOrder = customerOrders[0];
    const rawCustomerName = latestOrder?.customerName || "Cliente";
    const displayNameOverride = profile?.displayNameOverride || "";
    const notes = profile?.notes || "";
    const displayName = displayNameOverride.trim() !== "" ? displayNameOverride : rawCustomerName;

    const lastOrderAt = latestOrder ? new Date(latestOrder.createdAt).toISOString() : null;
    const now = new Date().getTime();
    const daysSinceLastOrder = latestOrder
      ? Math.max(0, Math.floor((now - new Date(latestOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
      : 9999;

    const detail: ContactDetail = {
      phoneKey,
      displayName,
      notes,
      displayNameOverride,
      totalOrders,
      validOrders,
      totalSpent,
      averageDeliveryMinutes: avgDeliveryMin,
      canceledOrders,
      favoriteCategory,
      lastOrderAt,
      daysSinceLastOrder,
      addresses,
      orders: customerOrders,
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Get contact detail error:", error);
    return NextResponse.json({ error: "Erro ao buscar detalhes do contato" }, { status: 500 });
  }
}

// PATCH /api/admin/contacts/:phoneKey - Atualiza anotações ou nome customizado
export async function PATCH(
  request: Request,
  { params }: { params: { phoneKey: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rawPhoneKey = params.phoneKey;
  const phoneKey = normalizeContactPhoneKey(rawPhoneKey);

  try {
    const body = await request.json();
    const { notes, displayNameOverride } = body;

    const updated = await prisma.customerContactProfile.upsert({
      where: { phoneKey },
      create: {
        phoneKey,
        notes: notes !== undefined ? String(notes).trim() : "",
        displayNameOverride: displayNameOverride !== undefined ? String(displayNameOverride).trim() : "",
      },
      update: {
        ...(notes !== undefined ? { notes: String(notes).trim() } : {}),
        ...(displayNameOverride !== undefined ? { displayNameOverride: String(displayNameOverride).trim() } : {}),
      },
    });

    return NextResponse.json({ success: true, profile: updated });
  } catch (error) {
    console.error("Update contact profile error:", error);
    return NextResponse.json({ error: "Erro ao atualizar perfil do contato" }, { status: 500 });
  }
}
