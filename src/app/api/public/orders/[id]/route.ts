import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            flavors: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Error fetching public order details:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
