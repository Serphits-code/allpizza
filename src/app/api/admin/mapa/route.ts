import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Cache curto de zonas e depot (TTL 60s) para não transferir nem buscar do banco em todo polling de 5s
interface StaticMapCache {
  zones: any[];
  depotLat: number;
  depotLng: number;
  cachedAt: number;
}
let staticMapCache: StaticMapCache | null = null;
const STATIC_CACHE_TTL_MS = 60_000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Queries dinâmicas e estáticas executadas em paralelo
    const shouldRefreshStatic = !staticMapCache || now - staticMapCache.cachedAt >= STATIC_CACHE_TTL_MS;

    const [configs, zones, activeOrders, drivers, activeRoutes] = await Promise.all([
      shouldRefreshStatic ? prisma.systemConfig.findMany() : Promise.resolve(null),
      shouldRefreshStatic ? prisma.deliveryZone.findMany({ where: { isActive: true } }) : Promise.resolve(null),
      prisma.order.findMany({
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
      }),
      prisma.adminUser.findMany({
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
      }),
      prisma.driverActiveRoute.findMany({
        include: {
          driver: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (shouldRefreshStatic && configs && zones) {
      const configMap = new Map(configs.map((c) => [c.key, c.value]));
      const depotLat = parseFloat(configMap.get("vroom_depot_lat") || configMap.get("depotLat") || "-8.05");
      const depotLng = parseFloat(configMap.get("vroom_depot_lng") || configMap.get("depotLng") || "-34.90");
      staticMapCache = {
        zones,
        depotLat,
        depotLng,
        cachedAt: now,
      };
    }

    const currentDepotLat = staticMapCache?.depotLat ?? -8.05;
    const currentDepotLng = staticMapCache?.depotLng ?? -34.90;
    const currentZones = staticMapCache?.zones ?? [];

    return NextResponse.json({
      orders: activeOrders,
      drivers,
      zones: currentZones,
      activeRoutes,
      mapCenter: [currentDepotLat, currentDepotLng],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Live map API error:", error);
    return NextResponse.json({ error: "Erro ao buscar dados do mapa" }, { status: 500 });
  }
}
