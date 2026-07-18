import React from "react";
import prisma from "@/lib/prisma";
import CardapioManager from "@/components/admin/CardapioManager";

export const dynamic = "force-dynamic";

export default async function AdminCardapioPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const products = await prisma.product.findMany({ include: { category: true }, orderBy: { name: "asc" } });
  const pizzaCategories = await prisma.pizzaCategory.findMany({ orderBy: { name: "asc" } });
  const pizzaFlavors = await prisma.pizzaFlavor.findMany({ include: { category: true }, orderBy: { name: "asc" } });
  const crusts = await prisma.crustType.findMany({ orderBy: { name: "asc" } });

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
