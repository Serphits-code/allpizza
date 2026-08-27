import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/comandas - Lista todas as comandas/mesas
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const comandas = await prisma.comanda.findMany({
      include: {
        orders: {
          where: {
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
          },
          select: {
            id: true,
            total: true,
            status: true,
          },
        },
      },
      orderBy: { number: "asc" },
    });

    const formatted = comandas.map((c) => {
      const activeOrdersCount = c.orders.length;
      const currentConsumption = c.orders.reduce((sum, o) => sum + o.total, 0);

      return {
        id: c.id,
        number: c.number,
        status: c.status,
        responsibleName: c.responsibleName,
        active: c.active,
        activeOrdersCount,
        currentConsumption,
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({ comandas: formatted });
  } catch (error) {
    console.error("List comandas error:", error);
    return NextResponse.json({ error: "Erro ao listar comandas" }, { status: 500 });
  }
}

// POST /api/admin/comandas - Cria comandas em lote
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Apenas administradores e gerentes podem gerar comandas" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const startNumber = parseInt(body.startNumber || "1", 10);
    const quantity = parseInt(body.quantity || "1", 10);

    if (isNaN(startNumber) || isNaN(quantity) || quantity < 1 || quantity > 100) {
      return NextResponse.json(
        { error: "Número inicial e quantidade (1 a 100) são obrigatórios" },
        { status: 400 }
      );
    }

    const createdComandas = [];
    for (let i = 0; i < quantity; i++) {
      const comandaNumber = startNumber + i;

      // Cria ou atualiza se já existir
      const comanda = await prisma.comanda.upsert({
        where: { number: comandaNumber },
        create: {
          number: comandaNumber,
          status: "LIVRE",
          active: true,
        },
        update: {
          active: true,
        },
      });
      createdComandas.push(comanda);
    }

    return NextResponse.json({
      success: true,
      message: `${createdComandas.length} comandas geradas com sucesso!`,
      comandas: createdComandas,
    });
  } catch (error) {
    console.error("Create batch comandas error:", error);
    return NextResponse.json({ error: "Erro ao gerar comandas em lote" }, { status: 500 });
  }
}
