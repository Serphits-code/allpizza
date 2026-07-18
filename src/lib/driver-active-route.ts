import { prisma } from "./prisma";

/**
 * Salva a rota ativa de entrega otimizada de um piloto conectado no banco de dados.
 */
export async function saveDriverActiveRoute(
  driverId: string,
  orderedIds: string[],
  steps: any,
  routeGeometry: any,
  summary: any
) {
  try {
    return await prisma.driverActiveRoute.upsert({
      where: { driverId },
      update: {
        orderedIds,
        steps,
        routeGeometry,
        summary,
        updatedAt: new Date(),
      },
      create: {
        driverId,
        orderedIds,
        steps,
        routeGeometry,
        summary,
      },
    });
  } catch (error) {
    console.error("Error saving driver active route:", error);
    return null;
  }
}

/**
 * Retorna o registro da rota ativa de um piloto.
 */
export async function getDriverActiveRoute(driverId: string) {
  try {
    return await prisma.driverActiveRoute.findUnique({
      where: { driverId },
    });
  } catch (error) {
    console.error("Error fetching driver active route:", error);
    return null;
  }
}

/**
 * Remove a rota ativa do piloto (usado no claim, release e delivery finalizado).
 */
export async function clearDriverActiveRoute(driverId: string) {
  try {
    return await prisma.driverActiveRoute.deleteMany({
      where: { driverId },
    });
  } catch (error) {
    console.error("Error clearing driver active route:", error);
    return null;
  }
}
