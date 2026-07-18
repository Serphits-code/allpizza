import React from "react";
import prisma from "@/lib/prisma";
import ZoneMapEditor from "@/components/admin/ZoneMapEditor";

export const dynamic = "force-dynamic";

export default async function AdminZonasPage() {
  const zones = await prisma.deliveryZone.findMany({
    orderBy: { createdAt: "desc" },
  });

  return <ZoneMapEditor initialZones={zones} />;
}
