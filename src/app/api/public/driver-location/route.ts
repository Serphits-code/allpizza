import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const driverLocationLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 500,
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = driverLocationLimiter.check(40, `driver_loc_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Muitas requisições de localização. Aguarde alguns segundos." },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Parâmetro 'orderId' é obrigatório" }, { status: 400 });
    }

    // Busca o pedido no banco
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        driverId: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // Se o pedido não estiver em rota ou não tiver motorista atribuído
    if (order.status !== "EM_ROTA" || !order.driverId) {
      return NextResponse.json({ active: false });
    }

    // Busca a geolocalização e data de atualização do motorista
    const driver = await prisma.adminUser.findUnique({
      where: { id: order.driverId },
      select: {
        id: true,
        name: true,
        driverLat: true,
        driverLng: true,
        driverUpdatedAt: true,
      },
    });

    if (!driver || driver.driverLat === null || driver.driverLng === null || !driver.driverUpdatedAt) {
      return NextResponse.json({ active: false });
    }

    // Validação de Desconexão (Data Stale - 5 minutos / 300 segundos)
    const now = new Date();
    const lastUpdate = new Date(driver.driverUpdatedAt);
    const diffSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (diffSeconds > 300) {
      return NextResponse.json({
        active: false,
        stale: true,
        error: "Coordenadas do entregador obsoletas",
      });
    }

    // Busca geometria do traçado de ruas salvo se houver
    const activeRoute = await prisma.driverActiveRoute.findUnique({
      where: { driverId: driver.id },
      select: {
        routeGeometry: true,
      },
    });

    return NextResponse.json({
      active: true,
      stale: false,
      driverName: driver.name,
      lat: driver.driverLat,
      lng: driver.driverLng,
      routeGeometry: activeRoute?.routeGeometry || null,
      updatedAt: driver.driverUpdatedAt,
    });
  } catch (error) {
    console.error("Error reading driver location:", error);
    return NextResponse.json({ error: "Erro interno ao ler geolocalização" }, { status: 500 });
  }
}
