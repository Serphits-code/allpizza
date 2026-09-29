import React from "react";
import prisma from "@/lib/prisma";
import MesaMenuClient from "@/components/mesa/MesaMenuClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface MesaPageProps {
  params: {
    id: string;
  };
}

export default async function MesaPage({ params }: MesaPageProps) {
  const tableNumber = parseInt(params.id, 10);
  if (isNaN(tableNumber) || tableNumber < 1) {
    notFound();
  }

  // Busca catálogo completo para auto-atendimento na mesa (pizzas, sabores, bordas, produtos e adicionais)
  const [pizzaCategories, flavors, crustTypes, standardCategories, toppingCategories] = await Promise.all([
    // Categorias de pizza agrupadas para o cardápio inicial
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

    // Todos os sabores com categorias e preços para o construtor dinâmico de pizza
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

    // Bordas recheadas
    prisma.crustType.findMany({
      orderBy: {
        name: "asc",
      },
    }),

    // Produtos padrão (Bebidas, Acompanhamentos, Sobremesas)
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

    // Categorias de adicionais com adicionais para a etapa de toppings
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
    <MesaMenuClient
      tableNumber={tableNumber}
      pizzaCategories={pizzaCategories}
      flavors={flavors}
      crustTypes={crustTypes}
      standardCategories={standardCategories}
      toppingCategories={toppingCategories}
    />
  );
}
