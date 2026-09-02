import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findDeliveryZone, ZoneInput } from "@/lib/geo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedLat = parseFloat(body.lat);
    const parsedLng = parseFloat(body.lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return NextResponse.json({ error: "Coordenadas lat e lng válidas são obrigatórias" }, { status: 400 });
    }

    // Busca todas as zonas de entrega ativas
    const zonesFromDb = await prisma.deliveryZone.findMany({
      where: { isActive: true },
    });

    // Mapeamento para tipo ZoneInput esperado pelo helper de geo
    const zones: ZoneInput[] = zonesFromDb.map((z) => ({
      id: z.id,
      title: z.title,
      geometry: z.geometry,
      deliveryFee: z.deliveryFee,
      isActive: z.isActive,
    }));

    const matchedZone = findDeliveryZone(parsedLat, parsedLng, zones);

    if (matchedZone) {
      return NextResponse.json({
        inCoverage: true,
        deliveryFee: matchedZone.deliveryFee,
        zoneTitle: matchedZone.title,
        zoneId: matchedZone.id,
      });
    }

    return NextResponse.json({
      inCoverage: false,
      error: "O endereço informado está fora do nosso raio de entrega.",
    });
  } catch (error) {
    console.error("Delivery zone check error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
