import React from "react";
import prisma from "@/lib/prisma";
import ZoneMapEditor from "@/components/admin/ZoneMapEditor";

export const dynamic = "force-dynamic";

export default async function AdminZonasPage() {
  const [zones, configs] = await Promise.all([
    prisma.deliveryZone.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.systemConfig.findMany(),
  ]);

  const configMap = new Map(configs.map((c) => [c.key, c.value]));
  const depotLat = parseFloat(configMap.get("vroom_depot_lat") || "-8.05");
  const depotLng = parseFloat(configMap.get("vroom_depot_lng") || "-34.90");

  return <ZoneMapEditor initialZones={zones} depotLat={depotLat} depotLng={depotLng} />;
}
