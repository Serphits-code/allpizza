import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, [
    "ADMIN",
    "MANAGER",
    "GARCOM",
    "KITCHEN",
  ]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  try {
    const [flavors, pizzaCategories, crusts, standardCategories, toppingCategories] =
      await Promise.all([
        // Sabores de pizza com sua categoria e preços por tamanho
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
          orderBy: { name: "asc" },
        }),

        // Categorias de pizza com preços base
        prisma.pizzaCategory.findMany({
          orderBy: { priceP: "asc" },
        }),

        // Tipos de borda
        prisma.crustType.findMany({
          orderBy: { name: "asc" },
        }),

        // Categorias padrão e produtos (bebidas, sobremesas, etc.)
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
          orderBy: { name: "asc" },
        }),

        // Categorias de adicionais e seus toppings
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
              orderBy: { name: "asc" },
            },
          },
          orderBy: { name: "asc" },
        }),
      ]);

    return NextResponse.json({
      flavors,
      pizzaCategories,
      crusts,
      standardCategories,
      toppingCategories,
    });
  } catch (error) {
    console.error("Error loading admin menu catalog:", error);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo do cardápio" },
      { status: 500 }
    );
  }
}
