import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Acesso restrito a entregadores e administradores" }, { status: 403 });
  }

  const driverId = session.user.id;

  try {
    const { lat, lng } = await request.json();

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return NextResponse.json({ error: "Coordenadas lat e lng válidas são obrigatórias" }, { status: 400 });
    }

    // Atualiza localização e carimbo de data/hora no banco
    const updatedUser = await prisma.adminUser.update({
      where: { id: driverId },
      data: {
        driverLat: parsedLat,
        driverLng: parsedLng,
        driverUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      driver: {
        id: updatedUser.id,
        name: updatedUser.name,
        lat: updatedUser.driverLat,
        lng: updatedUser.driverLng,
        updatedAt: updatedUser.driverUpdatedAt,
      },
    });
  } catch (error) {
    console.error("Driver location update error:", error);
    return NextResponse.json({ error: "Erro ao atualizar localização" }, { status: 500 });
  }
}
