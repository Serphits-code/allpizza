import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// POST /api/admin/comandas/:id/release - Libera a comanda e finaliza os pedidos abertos
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

      // 2. Limpa pagamentos parciais no SystemConfig
      await tx.systemConfig.delete({
        where: { key: `comanda_payments_${id}` },
      }).catch(() => {});

      // 3. Atualiza a comanda para LIVRE e limpa o nome do responsável
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
