import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";

// GET: Busca os dados do cliente por telefone e seu histórico de pedidos
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPhone = searchParams.get("phone");

  if (!rawPhone) {
    return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 });
  }

  const phoneKey = normalizeContactPhoneKey(rawPhone);

  try {
    // 1. Busca perfil do contato
    let profile = await prisma.customerContactProfile.findUnique({
      where: { phoneKey },
    });

    // Se o perfil de contato não existir, mas ele tiver pedidos, criamos
    if (!profile) {
      const ordersCount = await prisma.order.count({ where: { customerPhone: phoneKey } });
      if (ordersCount > 0) {
        profile = await prisma.customerContactProfile.create({
          data: { phoneKey },
        });
      } else {
        return NextResponse.json({ found: false, error: "Nenhum histórico encontrado para este telefone." });
      }
    }

    // 2. Busca histórico de pedidos do cliente
    const orders = await prisma.order.findMany({
      where: { customerPhone: phoneKey },
      include: {
        items: {
          include: {
            flavors: true,
          },
        },
      },
      orderBy: { orderNumber: "desc" },
    });

    return NextResponse.json({
      found: true,
      profile,
      orders,
    });
  } catch (error) {
    console.error("Admin customer lookup error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// PUT: Atualiza notas ou nome customizado do perfil de contato
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { phoneKey, notes, displayNameOverride } = body;

    if (!phoneKey) {
      return NextResponse.json({ error: "Chave do telefone obrigatória" }, { status: 400 });
    }

    const updatedProfile = await prisma.customerContactProfile.update({
      where: { phoneKey },
      data: {
        notes,
        displayNameOverride,
      },
    });

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error("Admin customer update error:", error);
    return NextResponse.json({ error: "Erro ao atualizar dados do cliente" }, { status: 500 });
  }
}
