import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { open } = await request.json();

    if (open === undefined) {
      return NextResponse.json({ error: "Parâmetro 'open' obrigatório" }, { status: 400 });
    }

    // Upsert na tabela de configs
    const updatedConfig = await prisma.systemConfig.upsert({
      where: { key: "delivery_open" },
      update: { value: String(open) },
      create: { key: "delivery_open", value: String(open) },
    });

    const isOpen = updatedConfig.value === "true";

    // Publica alteração em tempo real para todos os clientes conectados (Kanban e Checkout) via SSE
    sseManager.publish("store_status_changed", { open: isOpen });

    return NextResponse.json({ success: true, open: isOpen });
  } catch (error) {
    console.error("Error setting store status:", error);
    return NextResponse.json({ error: "Erro ao atualizar status do estabelecimento" }, { status: 500 });
  }
}
