import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Retorna todos os tipos de borda
export async function GET() {
  try {
    const crusts = await prisma.crustType.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(crusts);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar bordas" }, { status: 500 });
  }
}

// POST: Cria um tipo de borda
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, pricePM, priceGGG, caracol } = body;

    const crust = await prisma.crustType.create({
      data: {
        name,
        pricePM: parseFloat(pricePM),
        priceGGG: parseFloat(priceGGG),
        caracol: !!caracol,
      },
    });

    return NextResponse.json(crust);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao criar borda" }, { status: 500 });
  }
}

// PUT: Atualiza um tipo de borda
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, pricePM, priceGGG, caracol } = body;

    const crust = await prisma.crustType.update({
      where: { id },
      data: {
        name,
        pricePM: parseFloat(pricePM),
        priceGGG: parseFloat(priceGGG),
        caracol: !!caracol,
      },
    });

    return NextResponse.json(crust);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar borda" }, { status: 500 });
  }
}

// DELETE: Deleta um tipo de borda
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

    await prisma.crustType.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar borda" }, { status: 500 });
  }
}
