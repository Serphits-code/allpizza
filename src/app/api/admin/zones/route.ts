import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// GET: Retorna todas as zonas de entrega
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

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
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, geometry, deliveryFee, isActive } = body;

    const parsedFee = parseFloat(deliveryFee);
    if (!title || isNaN(parsedFee) || parsedFee < 0) {
      return NextResponse.json({ error: "Título e taxa de entrega válida são obrigatórios" }, { status: 400 });
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        title: String(title).trim(),
        geometry, // Objeto JSON contendo coordenadas do polígono GeoJSON
        deliveryFee: parsedFee,
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
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, geometry, deliveryFee, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: "ID da zona obrigatório" }, { status: 400 });
    }

    const parsedFee = deliveryFee !== undefined ? parseFloat(deliveryFee) : undefined;
    if (parsedFee !== undefined && (isNaN(parsedFee) || parsedFee < 0)) {
      return NextResponse.json({ error: "Taxa de entrega inválida" }, { status: 400 });
    }

    const zone = await prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(title ? { title: String(title).trim() } : {}),
        ...(geometry !== undefined ? { geometry } : {}),
        ...(parsedFee !== undefined ? { deliveryFee: parsedFee } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
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
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
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
