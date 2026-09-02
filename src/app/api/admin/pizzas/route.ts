import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: Retorna todas as categorias de pizza (autenticado)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    !["ADMIN", "MANAGER", "GARCOM", "KITCHEN"].includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const categories = await prisma.pizzaCategory.findMany({
      orderBy: { priceP: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar categorias" }, { status: 500 });
  }
}

// POST: Cria uma categoria de pizza
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, priceP, priceM, priceG, priceGG } = body;

    const pP = parseFloat(priceP);
    const pM = parseFloat(priceM);
    const pG = parseFloat(priceG);
    const pGG = parseFloat(priceGG);

    if (!name || isNaN(pP) || isNaN(pM) || isNaN(pG) || isNaN(pGG) || pP < 0 || pM < 0 || pG < 0 || pGG < 0) {
      return NextResponse.json({ error: "Nome e preços válidos (P, M, G, GG) são obrigatórios" }, { status: 400 });
    }

    const category = await prisma.pizzaCategory.create({
      data: {
        name: String(name).trim(),
        priceP: pP,
        priceM: pM,
        priceG: pG,
        priceGG: pGG,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao criar categoria" }, { status: 500 });
  }
}

// PUT: Atualiza uma categoria de pizza
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, priceP, priceM, priceG, priceGG } = body;

    if (!id) {
      return NextResponse.json({ error: "ID da categoria obrigatório" }, { status: 400 });
    }

    const pP = priceP !== undefined ? parseFloat(priceP) : undefined;
    const pM = priceM !== undefined ? parseFloat(priceM) : undefined;
    const pG = priceG !== undefined ? parseFloat(priceG) : undefined;
    const pGG = priceGG !== undefined ? parseFloat(priceGG) : undefined;

    if (
      (pP !== undefined && (isNaN(pP) || pP < 0)) ||
      (pM !== undefined && (isNaN(pM) || pM < 0)) ||
      (pG !== undefined && (isNaN(pG) || pG < 0)) ||
      (pGG !== undefined && (isNaN(pGG) || pGG < 0))
    ) {
      return NextResponse.json({ error: "Preços inválidos" }, { status: 400 });
    }

    const category = await prisma.pizzaCategory.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(pP !== undefined ? { priceP: pP } : {}),
        ...(pM !== undefined ? { priceM: pM } : {}),
        ...(pG !== undefined ? { priceG: pG } : {}),
        ...(pGG !== undefined ? { priceGG: pGG } : {}),
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar categoria" }, { status: 500 });
  }
}

// DELETE: Deleta uma categoria de pizza
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    await prisma.pizzaCategory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar categoria" }, { status: 500 });
  }
}
