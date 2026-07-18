import React, { Suspense } from "react";
import prisma from "@/lib/prisma";
import PizzaBuilder from "@/components/client/PizzaBuilder";

export const revalidate = 300; // Revalida a cada 5 minutos

export default async function MonteSuaPizzaPage() {
  // Busca todos os sabores de pizza e suas categorias correspondentes
  const flavors = await prisma.pizzaFlavor.findMany({
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
  });

  // Busca todos os tipos de bordas recheadas
  const crusts = await prisma.crustType.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return (
    <Suspense fallback={<div className="text-center py-20 text-brand-lightGray text-sm">Carregando construtor de pizza...</div>}>
      <PizzaBuilder flavors={flavors} crusts={crusts} />
    </Suspense>
  );
}
