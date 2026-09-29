import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/:id/close - Fecha a conta/conferência da comanda
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Acesso não autorizado para esta função" }, { status: 403 });
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
