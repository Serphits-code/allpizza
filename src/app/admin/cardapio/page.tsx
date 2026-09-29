import React from "react";
import prisma from "@/lib/prisma";
import CardapioManager from "@/components/admin/CardapioManager";

export const dynamic = "force-dynamic";

export default async function AdminCardapioPage() {
  const [categories, products, pizzaCategories, pizzaFlavors, crusts] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.pizzaCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.pizzaFlavor.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.crustType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <CardapioManager
      initialCategories={categories}
      initialProducts={products}
      initialPizzaCategories={pizzaCategories}
      initialPizzaFlavors={pizzaFlavors}
      initialCrusts={crusts}
    />
  );
}
