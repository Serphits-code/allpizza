import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getStoreConfig } from "@/lib/configHelper";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: "delivery_open" },
    });

    const isOpen = config ? config.value === "true" : true;
    const storeConfig = await getStoreConfig();

    return NextResponse.json({
      open: isOpen,
      companyName: storeConfig.companyName,
      companyLogo: storeConfig.companyLogo,
      deliveryCities: storeConfig.deliveryCities,
    });
  } catch (error) {
    console.error("Error getting store status:", error);
    return NextResponse.json({ error: "Erro ao buscar status do estabelecimento" }, { status: 500 });
  }
}
