import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Retorna todas as zonas de entrega
export async function GET() {
  try {
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(zones);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar zonas de entrega" }, { status: 500 });
  }
}

// POST: Cria uma zona de entrega
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, geometry, deliveryFee, isActive } = body;

    const zone = await prisma.deliveryZone.create({
      data: {
        title,
        geometry, // Objeto JSON contendo coordenadas do polígono GeoJSON
        deliveryFee: parseFloat(deliveryFee),
        isActive: isActive !== undefined ? !!isActive : true,
      },
    });

    return NextResponse.json(zone);
  } catch (error) {
    console.error("Create zone error:", error);
    return NextResponse.json({ error: "Erro ao criar zona de entrega" }, { status: 500 });
  }
}

// PUT: Atualiza uma zona de entrega
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, geometry, deliveryFee, isActive } = body;

    const zone = await prisma.deliveryZone.update({
      where: { id },
      data: {
        title,
        geometry,
        deliveryFee: parseFloat(deliveryFee),
        isActive: isActive !== undefined ? !!isActive : true,
      },
    });

    return NextResponse.json(zone);
  } catch (error) {
    console.error("Update zone error:", error);
    return NextResponse.json({ error: "Erro ao atualizar zona de entrega" }, { status: 500 });
  }
}

// DELETE: Deleta uma zona de entrega
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

    await prisma.deliveryZone.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar zona de entrega" }, { status: 500 });
  }
}
