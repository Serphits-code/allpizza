import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Retorna todos os sabores de pizza (autenticado)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    !["ADMIN", "MANAGER", "GARCOM", "KITCHEN"].includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const flavors = await prisma.pizzaFlavor.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(flavors);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar sabores" }, { status: 500 });
  }
}

// POST: Cria um sabor de pizza
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, imageUrl, pizzaCategoryId } = body;

    const flavor = await prisma.pizzaFlavor.create({
      data: {
        name,
        description,
        imageUrl,
        pizzaCategoryId,
      },
    });

    return NextResponse.json(flavor);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao criar sabor" }, { status: 500 });
  }
}

// PUT: Atualiza um sabor de pizza
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, imageUrl, pizzaCategoryId } = body;

    const flavor = await prisma.pizzaFlavor.update({
      where: { id },
      data: {
        name,
        description,
        imageUrl,
        pizzaCategoryId,
      },
    });

    return NextResponse.json(flavor);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar sabor" }, { status: 500 });
  }
}

// DELETE: Deleta um sabor de pizza
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

    await prisma.pizzaFlavor.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar sabor" }, { status: 500 });
  }
}
