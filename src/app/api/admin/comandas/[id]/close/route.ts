import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/:id/close - Fecha a conta/conferência da comanda
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "GARCOM")) {
    return NextResponse.json({ error: "Acesso não autorizado para esta função" }, { status: 403 });
  }

  const { id } = params;

  try {
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { not: "CANCELADO" } },
          include: {
            items: {
              include: {
                flavors: true,
                toppings: true,
              },
            },
          },
        },
      },
    });

    if (!comanda) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    const total = roundCurrency(comanda.orders.reduce((sum, o) => sum + (o.total || 0), 0));
    const orderCount = comanda.orders.length;

    return NextResponse.json({
      success: true,
      comandaNumber: comanda.number,
      responsibleName: comanda.responsibleName,
      total,
      orderCount,
      orders: comanda.orders,
    });
  } catch (error) {
    console.error("Close comanda error:", error);
    return NextResponse.json({ error: "Erro ao consultar fechamento da comanda" }, { status: 500 });
  }
}
