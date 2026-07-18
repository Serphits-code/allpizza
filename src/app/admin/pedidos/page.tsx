import React from "react";
import prisma from "@/lib/prisma";
import KanbanBoard from "@/components/admin/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function AdminPedidosPage() {
  // Busca inicial dos pedidos (dos últimos 3 dias para não sobrecarregar o painel)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const initialOrders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: threeDaysAgo,
      },
    },
    include: {
      items: {
        include: {
          flavors: true,
        },
      },
    },
    orderBy: {
      orderNumber: "desc",
    },
  });

  // Busca inicial do status do delivery
  const config = await prisma.systemConfig.findUnique({
    where: { key: "delivery_open" },
  });
  const initialStoreOpen = config ? config.value === "true" : true;

  return <KanbanBoard initialOrders={initialOrders} initialStoreOpen={initialStoreOpen} />;
}
