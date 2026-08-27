import React from "react";
import { prisma } from "@/lib/prisma";
import LiveDeliveryMap from "@/components/admin/mapa/LiveDeliveryMap";

export const dynamic = "force-dynamic";

export default async function AdminMapaPage() {
  const configs = await prisma.systemConfig.findMany();
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  const depotLat = parseFloat(
    configMap.get("vroom_depot_lat") || configMap.get("depotLat") || "-8.05"
  );
  const depotLng = parseFloat(
    configMap.get("vroom_depot_lng") || configMap.get("depotLng") || "-34.90"
  );

  return <LiveDeliveryMap initialDepotLat={depotLat} initialDepotLng={depotLng} />;
}
