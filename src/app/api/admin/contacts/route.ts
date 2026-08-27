import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateContacts } from "@/lib/admin-contacts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const sort = searchParams.get("sort") || "recent"; // "recent" | "frequent" | "spent"
    const staleDaysParam = searchParams.get("staleDays");
    const hasNotesParam = searchParams.get("hasNotes");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    // Busca pedidos com itens e sabores
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        addressNumber: true,
        reference: true,
        total: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            totalPrice: true,
            flavors: {
              select: {
                id: true,
                flavorName: true,
                categoryName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Busca perfis de contato salvos
    const profiles = await prisma.customerContactProfile.findMany();

    // Consolida contatos
    let contacts = aggregateContacts(orders, profiles);

    // Filtro por texto de busca (nome, apelido ou telefone)
    if (q) {
      contacts = contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.rawCustomerName.toLowerCase().includes(q) ||
          c.phoneKey.includes(q)
      );
    }

    // Filtro por dias sem pedido
    if (staleDaysParam) {
      const minDays = parseInt(staleDaysParam, 10);
      if (!isNaN(minDays) && minDays > 0) {
        contacts = contacts.filter((c) => c.daysSinceLastOrder >= minDays);
      }
    }

    // Filtro por anotações existentes
    if (hasNotesParam === "true") {
      contacts = contacts.filter((c) => c.hasNotes);
    }

    // Ordenação
    if (sort === "frequent") {
      contacts.sort((a, b) => b.validOrders - a.validOrders || b.totalSpent - a.totalSpent);
    } else if (sort === "spent") {
      contacts.sort((a, b) => b.totalSpent - a.totalSpent || b.validOrders - a.validOrders);
    } else {
      // Default: "recent"
      contacts.sort((a, b) => {
        const timeA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
        const timeB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    // Paginação
    const total = contacts.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = contacts.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error("List contacts error:", error);
    return NextResponse.json({ error: "Erro ao buscar contatos" }, { status: 500 });
  }
}
