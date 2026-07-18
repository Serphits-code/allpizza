import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const driverId = session.user.id;

  try {
    const { lat, lng } = await request.json();

    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: "Parâmetros 'lat' e 'lng' obrigatórios" }, { status: 400 });
    }

    // Atualiza localização e carimbo de data/hora no banco
    const updatedUser = await prisma.adminUser.update({
      where: { id: driverId },
      data: {
        driverLat: parseFloat(lat),
        driverLng: parseFloat(lng),
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
