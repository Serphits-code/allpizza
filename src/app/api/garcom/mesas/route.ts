import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/garcom/mesas - Lista todas as comandas/mesas e pedidos prontos
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const comandas = await prisma.comanda.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: {
        orders: {
          where: {
            status: { in: ["NOVO", "EM_PREPARO", "PRONTO_RETIRADA", "ENTREGUE"] },
          },
          include: {
            items: {
              include: {
                flavors: true,
                toppings: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const formattedComandas = comandas.map((c) => {
      const activeOrders = c.orders.filter(
        (o) => o.status !== "ENTREGUE" && (o.status as string) !== "CANCELADO"
      );
      const readyOrders = c.orders.filter((o) => o.status === "PRONTO_RETIRADA");
      const currentConsumption = c.orders
        .filter((o) => (o.status as string) !== "CANCELADO")
        .reduce((sum, o) => sum + o.total, 0);

      return {
        id: c.id,
        number: c.number,
        status: c.status,
        responsibleName: c.responsibleName,
        active: c.active,
        orders: c.orders,
        activeOrdersCount: activeOrders.length,
        readyOrdersCount: readyOrders.length,
        currentConsumption,
      };
    });

    return NextResponse.json({
      success: true,
      comandas: formattedComandas,
    });
  } catch (error) {
    console.error("Error fetching garcom mesas:", error);
    return NextResponse.json({ error: "Erro ao buscar mesas" }, { status: 500 });
  }
}

// POST /api/garcom/mesas - Atualiza responsável / abre comanda
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { comandaId, responsibleName, action } = await request.json();

    if (!comandaId) {
      return NextResponse.json({ error: "ID da comanda é obrigatório" }, { status: 400 });
    }

    if (action === "OPEN" || action === "UPDATE_RESPONSIBLE") {
      const updated = await prisma.comanda.update({
        where: { id: comandaId },
        data: {
          responsibleName: responsibleName || null,
          status: "OCUPADA",
        },
      });
      return NextResponse.json({ success: true, comanda: updated });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
  } catch (error) {
    console.error("Error updating garcom mesa:", error);
    return NextResponse.json({ error: "Erro ao atualizar mesa" }, { status: 500 });
  }
}
