import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Retorna todas as categorias de pizza
export async function GET() {
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

    const category = await prisma.pizzaCategory.create({
      data: {
        name,
        priceP: parseFloat(priceP),
        priceM: parseFloat(priceM),
        priceG: parseFloat(priceG),
        priceGG: parseFloat(priceGG),
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

    const category = await prisma.pizzaCategory.update({
      where: { id },
      data: {
        name,
        priceP: parseFloat(priceP),
        priceM: parseFloat(priceM),
        priceG: parseFloat(priceG),
        priceGG: parseFloat(priceGG),
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
