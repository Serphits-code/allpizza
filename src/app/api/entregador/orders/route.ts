import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/entregador/orders - Lista pedidos na bag do entregador e pedidos disponíveis em rota
export async function GET() {
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

  try {
    // Busca todos os pedidos em rota que estão na bag do motorista ou livres (driverId = null)
    const orders = await prisma.order.findMany({
      where: {
        status: "EM_ROTA",
        type: "DELIVERY",
        OR: [{ driverId: null }, { driverId }],
      },
      include: {
        items: {
          include: {
            flavors: true,
            toppings: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Busca ordem da rota ativa do motorista, se houver
    const activeRoute = await prisma.driverActiveRoute.findUnique({
      where: { driverId },
    });

    const orderedIds = activeRoute?.orderedIds || [];

    // Separa pedidos
    const available = orders.filter((o) => !o.driverId);
    let bag = orders.filter((o) => o.driverId === driverId);

    // Se houver sequência de rota salva, ordena a bag respeitando os orderedIds
    if (orderedIds.length > 0) {
      const bagMap = new Map(bag.map((o) => [o.id, o]));
      const sortedBag: typeof bag = [];
      
      for (const id of orderedIds) {
        const ord = bagMap.get(id);
        if (ord) {
          sortedBag.push(ord);
          bagMap.delete(id);
        }
      }
      // Adiciona eventuais pedidos adicionados após a última rota calculada
      bagMap.forEach((ord) => sortedBag.push(ord));
      bag = sortedBag;
    }

    return NextResponse.json({
      bag,
      available,
      summary: activeRoute?.summary || null,
      routeGeometry: activeRoute?.routeGeometry || null,
    });
  } catch (error) {
    console.error("List driver orders error:", error);
    return NextResponse.json(
      { error: "Erro ao listar pedidos do entregador" },
      { status: 500 }
    );
  }
}
