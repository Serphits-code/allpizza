import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/comandas/:id - Detalhe da comanda com pedidos e consumo
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM", "KITCHEN"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const { id } = params;

  try {
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            status: { notIn: ["ENTREGUE", "CANCELADO"] },
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

    if (!comanda) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    const totalConsumption = comanda.orders.reduce((sum, o) => sum + o.total, 0);

    return NextResponse.json({
      comanda,
      totalConsumption,
      orderCount: comanda.orders.length,
    });
  } catch (error) {
    console.error("Get comanda detail error:", error);
    return NextResponse.json({ error: "Erro ao buscar detalhes da comanda" }, { status: 500 });
  }
}

// PATCH /api/admin/comandas/:id - Atualiza status, responsável ou ativo
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const { id } = params;

  try {
    const body = await request.json();
    const { status, responsibleName, active } = body;

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (responsibleName !== undefined) updateData.responsibleName = responsibleName;
    if (active !== undefined) updateData.active = Boolean(active);

    const updated = await prisma.comanda.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, comanda: updated });
  } catch (error) {
    console.error("Update comanda error:", error);
    return NextResponse.json({ error: "Erro ao atualizar comanda" }, { status: 500 });
  }
}

// DELETE /api/admin/comandas/:id - Remove comanda
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Apenas administradores podem excluir comandas" }, { status: 403 });
  }

  const { id } = params;

  try {
    // Desvincula pedidos da comanda antes de excluir
    await prisma.order.updateMany({
      where: { comandaId: id },
      data: { comandaId: null },
    });

    await prisma.comanda.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Comanda excluída com sucesso" });
  } catch (error) {
    console.error("Delete comanda error:", error);
    return NextResponse.json({ error: "Erro ao excluir comanda" }, { status: 500 });
  }
}
