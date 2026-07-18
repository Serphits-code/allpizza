import React from "react";
import prisma from "@/lib/prisma";
import MenuPage from "@/components/client/MenuPage";

export const revalidate = 60; // Revalida a cada 60 segundos (Incremental Static Regeneration)

export default async function ClientHomePage() {
  // Busca as categorias de pizza e seus sabores
  const pizzaCategories = await prisma.pizzaCategory.findMany({
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
  });

  // Busca as outras categorias e seus produtos comuns (ex: Bebidas)
  const standardCategories = await prisma.category.findMany({
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
  });

  return (
    <MenuPage
      pizzaCategories={pizzaCategories}
      standardCategories={standardCategories}
    />
  );
}
