import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/:id/release - Libera a comanda e finaliza os pedidos abertos
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
    const updatedComanda = await prisma.$transaction(async (tx) => {
      // 1. Marca todos os pedidos não-cancelados e não-entregues da comanda como ENTREGUE
      await tx.order.updateMany({
        where: {
          comandaId: id,
          status: { notIn: ["ENTREGUE", "CANCELADO"] },
        },
        data: {
          status: "ENTREGUE",
          deliveredAt: new Date(),
        },
      });

      // 2. Atualiza a comanda para LIVRE e limpa o nome do responsável
      return tx.comanda.update({
        where: { id },
        data: {
          status: "LIVRE",
          responsibleName: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Comanda #${updatedComanda.number} liberada com sucesso!`,
      comanda: updatedComanda,
    });
  } catch (error) {
    console.error("Release comanda error:", error);
    return NextResponse.json({ error: "Erro ao liberar comanda" }, { status: 500 });
  }
}
