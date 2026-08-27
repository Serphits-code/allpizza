import React, { Suspense } from "react";
import prisma from "@/lib/prisma";
import PizzaBuilder from "@/components/client/PizzaBuilder";

export const revalidate = 300; // Revalida a cada 5 minutos

export default async function MonteSuaPizzaPage() {
  // Executa todas as buscas em paralelo para máxima velocidade de carregamento
  const [flavors, crusts, standardCategories, toppingCategories] = await Promise.all([
    // Busca todos os sabores de pizza e suas categorias correspondentes
    prisma.pizzaFlavor.findMany({
      include: {
        category: {
          select: {
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

    // Busca todos os tipos de bordas recheadas
    prisma.crustType.findMany({
      orderBy: {
        name: "asc",
      },
    }),

    // Busca as outras categorias e seus produtos comuns (ex: Bebidas)
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

    // Busca todas as categorias de adicionais e seus respectivos adicionais
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
  ]);

  return (
    <PizzaBuilder
      flavors={flavors}
      crusts={crusts}
      standardCategories={standardCategories}
      toppingCategories={toppingCategories}
    />
  );
}
