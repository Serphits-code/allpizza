import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    // 1. Busca configurações de Centro do Mapa (Depot)
    const configs = await prisma.systemConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    const depotLat = parseFloat(configMap.get("vroom_depot_lat") || configMap.get("depotLat") || "-8.05");
    const depotLng = parseFloat(configMap.get("vroom_depot_lng") || configMap.get("depotLng") || "-34.90");

    // 2. Busca pedidos Delivery ativos das últimas 48h com coordenadas
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const activeOrders = await prisma.order.findMany({
      where: {
        type: "DELIVERY",
        status: {
          in: ["NOVO", "EM_PREPARO", "EM_ROTA"],
        },
        customerLat: { not: null },
        customerLng: { not: null },
        createdAt: { gte: twoDaysAgo },
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            driverLat: true,
            driverLng: true,
            driverUpdatedAt: true,
          },
        },
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Busca entregadores com dados de GPS
    const drivers = await prisma.adminUser.findMany({
      where: {
        role: "DRIVER",
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        driverLat: true,
        driverLng: true,
        driverUpdatedAt: true,
        driverActiveRoute: true,
      },
    });

    // 4. Busca Zonas de Entrega Ativas
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
    });

    // 5. Rotas ativas dos entregadores
    const activeRoutes = await prisma.driverActiveRoute.findMany({
      include: {
        driver: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      orders: activeOrders,
      drivers,
      zones,
      activeRoutes,
      mapCenter: [depotLat, depotLng],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Live map API error:", error);
    return NextResponse.json({ error: "Erro ao buscar dados do mapa" }, { status: 500 });
  }
}
