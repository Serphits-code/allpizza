import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateContacts } from "@/lib/admin-contacts";
import { normalizeContactPhoneKey } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
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

    // Busca pedidos apenas com metadados necessários para sumarização (sem itens/sabores pesados)
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        customerName: true,
        customerPhone: true,
        total: true,
        createdAt: true,
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

    // Enriquecimento leve de categoria favorita apenas para os contatos da página atual
    const paginatedPhones = paginatedItems.map((c) => c.phoneKey).filter(Boolean);
    if (paginatedPhones.length > 0) {
      try {
        const pageFlavors = await prisma.orderItemFlavor.findMany({
          where: {
            orderItem: {
              order: {
                customerPhone: { in: paginatedPhones },
                status: { not: "CANCELADO" },
              },
            },
          },
          select: {
            categoryName: true,
            orderItem: {
              select: {
                order: {
                  select: { customerPhone: true },
                },
              },
            },
          },
        });

        const countsByPhone = new Map<string, Map<string, number>>();
        for (const pf of pageFlavors) {
          const rawP = pf.orderItem?.order?.customerPhone;
          if (!rawP) continue;
          const pKey = normalizeContactPhoneKey(rawP);
          const cat = pf.categoryName || "Pizzas";
          if (!countsByPhone.has(pKey)) {
            countsByPhone.set(pKey, new Map<string, number>());
          }
          const catMap = countsByPhone.get(pKey)!;
          catMap.set(cat, (catMap.get(cat) || 0) + 1);
        }

        for (const item of paginatedItems) {
          const catMap = countsByPhone.get(item.phoneKey);
          if (catMap && catMap.size > 0) {
            let maxCnt = 0;
            let fav = "Diversos";
            for (const [cat, cnt] of catMap.entries()) {
              if (cnt > maxCnt) {
                maxCnt = cnt;
                fav = cat;
              }
            }
            item.favoriteCategory = fav;
          }
        }
      } catch (flavorErr) {
        console.warn("Could not enrich favorite categories for paginated contacts:", flavorErr);
      }
    }

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
