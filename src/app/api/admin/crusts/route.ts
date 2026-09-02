import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: Retorna todos os tipos de borda (autenticado)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    !["ADMIN", "MANAGER", "GARCOM", "KITCHEN"].includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

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

    const parsedPricePM = parseFloat(pricePM);
    const parsedPriceGGG = parseFloat(priceGGG);

    if (!name || isNaN(parsedPricePM) || isNaN(parsedPriceGGG) || parsedPricePM < 0 || parsedPriceGGG < 0) {
      return NextResponse.json({ error: "Nome e preços válidos são obrigatórios" }, { status: 400 });
    }

    const crust = await prisma.crustType.create({
      data: {
        name: String(name).trim(),
        pricePM: parsedPricePM,
        priceGGG: parsedPriceGGG,
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

    if (!id) {
      return NextResponse.json({ error: "ID da borda é obrigatório" }, { status: 400 });
    }

    const parsedPricePM = pricePM !== undefined ? parseFloat(pricePM) : undefined;
    const parsedPriceGGG = priceGGG !== undefined ? parseFloat(priceGGG) : undefined;

    if (
      (parsedPricePM !== undefined && (isNaN(parsedPricePM) || parsedPricePM < 0)) ||
      (parsedPriceGGG !== undefined && (isNaN(parsedPriceGGG) || parsedPriceGGG < 0))
    ) {
      return NextResponse.json({ error: "Preço inválido" }, { status: 400 });
    }

    const crust = await prisma.crustType.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(parsedPricePM !== undefined ? { pricePM: parsedPricePM } : {}),
        ...(parsedPriceGGG !== undefined ? { priceGGG: parsedPriceGGG } : {}),
        ...(caracol !== undefined ? { caracol: !!caracol } : {}),
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
