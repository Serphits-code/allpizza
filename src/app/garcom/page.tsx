import React from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import GarcomMobileDashboard from "@/components/garcom/GarcomMobileDashboard";
import { getStoreConfig } from "@/lib/configHelper";

export const dynamic = "force-dynamic";

export default async function GarcomPage() {
  const session = await getServerSession(authOptions);

  const [comandas, pizzaCategories, standardCategories, config] = await Promise.all([
    prisma.comanda.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: {
        orders: {
          where: {
            status: { in: ["NOVO", "EM_PREPARO", "PRONTO_RETIRADA", "ENTREGUE"] },
          },
          include: {
            items: {
              include: {
                flavors: true,
                toppings: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.pizzaCategory.findMany({
      include: {
        flavors: {
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
          },
        },
      },
      orderBy: {
        priceP: "asc",
      },
    }),
    prisma.category.findMany({
      include: {
        products: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
    getStoreConfig(),
  ]);

  const formattedComandas = comandas.map((c) => {
    const activeOrders = c.orders.filter(
      (o) => o.status !== "ENTREGUE" && (o.status as string) !== "CANCELADO"
    );
    const readyOrders = c.orders.filter((o) => o.status === "PRONTO_RETIRADA");
    const currentConsumption = c.orders
      .filter((o) => (o.status as string) !== "CANCELADO")
      .reduce((sum, o) => sum + o.total, 0);

    return {
      id: c.id,
      number: c.number,
      status: c.status as "LIVRE" | "OCUPADA" | "INATIVA",
      responsibleName: c.responsibleName,
      active: c.active,
      orders: c.orders,
      activeOrdersCount: activeOrders.length,
      readyOrdersCount: readyOrders.length,
      currentConsumption,
    };
  });

  return (
    <GarcomMobileDashboard
      initialComandas={formattedComandas}
      pizzaCategories={pizzaCategories}
      productCategories={standardCategories}
      companyName={config.companyName || "AllPizza"}
      companyLogo={config.companyLogo || ""}
      userName={session?.user?.name || "Garçom"}
    />
  );
}
