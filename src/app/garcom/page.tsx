import React from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import GarcomMobileDashboard from "@/components/garcom/GarcomMobileDashboard";
import { getStoreConfig } from "@/lib/configHelper";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GarcomPage() {
  const session = await getServerSession(authOptions);

  if (
    !session ||
    (session.user.role !== "GARCOM" &&
      session.user.role !== "ADMIN" &&
      session.user.role !== "MANAGER")
  ) {
    redirect("/admin/login");
  }

  const [
    comandas,
    flavors,
    crusts,
    standardCategories,
    toppingCategories,
    config,
  ] = await Promise.all([
    // 1. Busca comandas ativas com seus pedidos
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

    // 2. Busca todos os sabores de pizza com preços das categorias
    prisma.pizzaFlavor.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
            priceP: true,
            priceM: true,
            priceG: true,
            priceGG: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),

    // 3. Busca tipos de borda
    prisma.crustType.findMany({
      orderBy: {
        name: "asc",
      },
    }),

    // 4. Busca categorias convencionais e produtos (bebidas/sobremesas)
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

    // 5. Busca categorias de adicionais e toppings
    prisma.pizzaToppingCategory.findMany({
      include: {
        toppings: {
          select: {
            id: true,
            name: true,
            pricePM: true,
            priceGGG: true,
            isUnit: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),

    // 6. Configurações da loja
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
      flavors={flavors}
      crusts={crusts}
      standardCategories={standardCategories}
      toppingCategories={toppingCategories}
      companyName={config.companyName || "AllPizza"}
      companyLogo={config.companyLogo || ""}
      userName={session?.user?.name || "Garçom"}
    />
  );
}
