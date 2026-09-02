import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed process...");

  // 1. Clean the database
  await prisma.orderItemTopping.deleteMany();
  await prisma.orderItemFlavor.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.pizzaFlavor.deleteMany();
  await prisma.pizzaCategory.deleteMany();
  await prisma.crustType.deleteMany();
  await prisma.pizzaTopping.deleteMany();
  await prisma.pizzaToppingCategory.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.customerContactProfile.deleteMany();

  console.log("Database cleaned.");

  // 2. Seed Admin User
  const defaultPassword = process.env.ADMIN_SEED_PASSWORD || "admin123456";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const admin = await prisma.adminUser.create({
    data: {
      email: "admin@alldelivery.com",
      name: "Administrador Geral",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log("Admin user created:", admin.email);

  // 3. Seed Pizza Categories with placeholder prices
  const categoriesData = [
    { name: "Tradicionais", priceP: 30.0, priceM: 40.0, priceG: 50.0, priceGG: 60.0 },
    { name: "Especiais", priceP: 35.0, priceM: 45.0, priceG: 55.0, priceGG: 65.0 },
    { name: "Executivas", priceP: 40.0, priceM: 50.0, priceG: 60.0, priceGG: 70.0 },
    { name: "Premium", priceP: 45.0, priceM: 55.0, priceG: 65.0, priceGG: 75.0 },
    { name: "Doces", priceP: 35.0, priceM: 45.0, priceG: 55.0, priceGG: 65.0 },
    { name: "Doces Premium", priceP: 45.0, priceM: 55.0, priceG: 65.0, priceGG: 75.0 },
  ];

  const categoriesMap: { [key: string]: string } = {};

  for (const cat of categoriesData) {
    const createdCat = await prisma.pizzaCategory.create({
      data: cat,
    });
    categoriesMap[cat.name] = createdCat.id;
  }
  console.log("Pizza categories seeded.");

  // 4. Seed Pizza Flavors (62 flavors)
  const flavorsData = [
    // Tradicionais
    { name: "Atum", description: "Mussarela, atum, cebola, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Bauru", description: "Mussarela, presunto, tomate, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Dois Queijos", description: "Mussarela, catupiry, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Frango Cheddar", description: "Frango, mussarela, cheddar, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Frango Mussarela", description: "Frango, mussarela, tomate, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Frango Catupiry", description: "Frango, mussarela, catupiry, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Milho Verde", description: "Mussarela, milho verde, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Mussarela", description: "Mussarela, tomate, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Marguerita", description: "Mussarela, tomate, parmesão, manjericão, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Lombo", description: "Mussarela, lombo canadense, cebola, orégano e azeitona.", categoryName: "Tradicionais" },
    { name: "Três Queijos", description: "Mussarela, catupiry, parmesão, orégano e azeitona.", categoryName: "Tradicionais" },

    // Especiais
    { name: "Água na Boca", description: "Mussarela, milho, bacon, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Bacon", description: "Mussarela, bacon, ovo, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Baiana", description: "Calabresa ralada, mussarela, ovo, pimenta, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Carne Seca", description: "Mussarela, charque, catupiry, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Carne de Sol", description: "Mussarela, carne de sol, queijo coalho, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Calabresa", description: "Mussarela, calabresa, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Calabresa Catupiry (ou) Cheddar", description: "Mussarela, calabresa, catupiry ou cheddar, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Nordestina", description: "Mussarela, frango, charque, ovo, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Charque", description: "Mussarela, charque, cebola, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Frango Cheese", description: "Mussarela, frango, cream cheese, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Frango Bacon", description: "Frango, mussarela, bacon, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Italiana", description: "Mussarela, salaminho italiano, cebola, tomate, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Lombo Cremoso", description: "Mussarela, lombo canadense, requeijão, orégano e azeitona.", categoryName: "Especiais" },
    { name: "Peperone", description: "Mussarela, peperone, cebola, orégano e azeitona.", categoryName: "Especiais" },

    // Executivas
    { name: "Brasileira", description: "Presunto, mussarela, charque, ovo, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Charque Cheese", description: "Mussarela, charque, cream cheese, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Caipira", description: "Mussarela, frango, milho, ovo, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Calabresa Cheese", description: "Calabresa, mussarela, cream cheese, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Campestre", description: "Mussarela, bacon, ovo, milho, tomate, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Canadense", description: "Lombo canadense, mussarela, bacon, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Especial", description: "Mussarela, presunto, frango, bacon, calabresa, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Mista", description: "Mussarela, calabresa ralada, frango, requeijão, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Moda do Cheff", description: "Mussarela, calabresa ralada, charque, ovo, bacon, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Moda da Casa", description: "Mussarela, catupiry, carne de sol, queijo coalho, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Portuguesa", description: "Mussarela, presunto, milho, ervilha, ovo, tomate, cebola, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Quatro Queijos", description: "Mussarela, catupiry, provolone, parmesão, orégano e azeitona.", categoryName: "Executivas" },
    { name: "Saborosa", description: "Mussarela, frango, cream cheese, bacon, milho, orégano e azeitona.", categoryName: "Executivas" },

    // Premium
    { name: "Camarão", description: "Mussarela, catupiry, camarão, cebola, orégano e azeitona.", categoryName: "Premium" },
    { name: "Catupiry Original", description: "Frango, mussarela, catupiry original, orégano e azeitona.", categoryName: "Premium" },
    { name: "Charque Top", description: "Mussarela, charque, queijo coalho, cebola, orégano e azeitona.", categoryName: "Premium" },
    { name: "Cheddar Original", description: "Frango, mussarela, cheddar original, orégano e azeitona.", categoryName: "Premium" },
    { name: "Bacon X", description: "Mussarela, calabresa, bacon, cream cheese original, orégano e azeitona.", categoryName: "Premium" },
    { name: "Paulista", description: "Calabresa ralada, mussarela, cheddar original, bacon, orégano e azeitona.", categoryName: "Premium" },
    { name: "Peperone Bacon", description: "Mussarela, peperone, bacon, cheddar original, orégano e azeitona.", categoryName: "Premium" },
    { name: "Frango X Original", description: "Frango, mussarela, cream cheese original, orégano e azeitona.", categoryName: "Premium" },

    // Doces
    { name: "Brigadeiro", description: "Mussarela, chocolate ao leite, granulado, M&M's.", categoryName: "Doces" },
    { name: "Bis", description: "Mussarela, chocolate ao leite, Bis, M&M's.", categoryName: "Doces" },
    { name: "Banana com Canela", description: "Mussarela, banana, canela, leite condensado.", categoryName: "Doces" },
    { name: "Sensação", description: "Mussarela, chocolate branco, chocolate ao leite, M&M's.", categoryName: "Doces" },
    { name: "Romeu e Julieta", description: "Mussarela, queijo coalho e goiabada.", categoryName: "Doces" },
    { name: "Prestígio", description: "Mussarela, chocolate ao leite, coco ralado, M&M's.", categoryName: "Doces" },

    // Doces Premium
    { name: "KitKat", description: "Mussarela, chocolate ao leite, KitKat, M&M's.", categoryName: "Doces Premium" },
    { name: "Banana Nevada", description: "Mussarela, banana, chocolate branco gratinado.", categoryName: "Doces Premium" },
    { name: "Cartola", description: "Mussarela, banana, queijo coalho, chocolate branco.", categoryName: "Doces Premium" },
    { name: "Nutella", description: "Mussarela, Nutella, chocolate avelã, morango.", categoryName: "Doces Premium" },
    { name: "Ninho com Nutella", description: "Mussarela, Nutella, chocolate avelã, leite Ninho.", categoryName: "Doces Premium" },
    { name: "Oreo", description: "Mussarela, chocolate ao leite, Oreo, morango.", categoryName: "Doces Premium" },
    { name: "Sensação Especial", description: "Mussarela, chocolate ao leite, chocolate branco, morango, M&M's.", categoryName: "Doces Premium" },
    { name: "Sonho de Valsa (ou) Ouro Branco", description: "Mussarela, chocolate ao leite/branco, Sonho de Valsa/Ouro Branco.", categoryName: "Doces Premium" },
    { name: "Tutti Frutti", description: "Mussarela, chocolate ao leite, chocolate avelã, morango, uva, banana.", categoryName: "Doces Premium" },
    { name: "Uva dos Sonhos", description: "Mussarela, chocolate ao leite, chocolate branco, uva.", categoryName: "Doces Premium" },
  ];

  for (const flavor of flavorsData) {
    const categoryId = categoriesMap[flavor.categoryName];
    if (!categoryId) {
      console.warn(`Category not found for flavor: ${flavor.name}`);
      continue;
    }
    await prisma.pizzaFlavor.create({
      data: {
        name: flavor.name,
        description: flavor.description,
        imageUrl: `/images/flavors/${flavor.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`,
        pizzaCategoryId: categoryId,
      },
    });
  }
  console.log("Pizza flavors seeded.");

  // 5. Seed Crust Types (Bordas recheadas)
  const crustsData = [
    { name: "Catupiry", pricePM: 5.0, priceGGG: 8.0, caracol: false },
    { name: "Cheddar", pricePM: 5.0, priceGGG: 8.0, caracol: false },
    { name: "Requeijão", pricePM: 6.0, priceGGG: 9.0, caracol: false },
    { name: "Cream Cheese", pricePM: 6.0, priceGGG: 9.0, caracol: false },
    { name: "Mussarela", pricePM: 7.0, priceGGG: 10.0, caracol: false },
    { name: "Chocolate", pricePM: 7.0, priceGGG: 10.0, caracol: false },
    { name: "Nutella", pricePM: 8.0, priceGGG: 11.0, caracol: false },
    { name: "Catupiry Original", pricePM: 8.0, priceGGG: 11.0, caracol: false },
    { name: "Cheddar Original", pricePM: 8.0, priceGGG: 11.0, caracol: false },
    { name: "Cream Cheese Original", pricePM: 8.0, priceGGG: 11.0, caracol: false },
  ];

  for (const crust of crustsData) {
    await prisma.crustType.create({
      data: crust,
    });
  }
  console.log("Crust types seeded.");

  // 6. Seed Product Categories and Products
  const beveragesCategory = await prisma.category.create({
    data: { name: "Bebidas" },
  });

  const beverages = [
    { name: "Coca-Cola 2L", description: "Refrigerante Coca-Cola Garrafa 2 Litros", price: 10.0, imageUrl: "/images/products/coca-cola-2l.png" },
    { name: "Coca-Cola Lata", description: "Refrigerante Coca-Cola Lata 350ml", price: 5.0, imageUrl: "/images/products/coca-cola-lata.png" },
    { name: "Guaraná Antártica 2L", description: "Refrigerante Guaraná Garrafa 2 Litros", price: 9.0, imageUrl: "/images/products/guarana-2l.png" },
    { name: "Água Mineral 500ml", description: "Água mineral sem gás", price: 3.0, imageUrl: "/images/products/agua-500ml.png" },
  ];

  for (const bev of beverages) {
    await prisma.product.create({
      data: {
        ...bev,
        categoryId: beveragesCategory.id,
      },
    });
  }
  console.log("Beverages seeded.");

  // 7. Seed Delivery Zone (GeoJSON polygon wrapper around Recife central area)
  // Latitude: -8.05, Longitude: -34.90
  const recifeZoneGeometry = {
    type: "Polygon",
    coordinates: [
      [
        [-34.95, -8.10],
        [-34.85, -8.10],
        [-34.85, -8.00],
        [-34.95, -8.00],
        [-34.95, -8.10],
      ],
    ],
  };

  const zone = await prisma.deliveryZone.create({
    data: {
      title: "Zona Centro (Recife)",
      geometry: recifeZoneGeometry,
      deliveryFee: 5.0,
      isActive: true,
    },
  });
  console.log("Delivery zone created:", zone.title);

  // 8. Seed Pizza Toppings & Categories
  const toppingsData = [
    // INGREDIENTES
    { category: "INGREDIENTES", name: "Azeitona", pricePM: 3.0, priceGGG: 6.0, isUnit: false },
    { category: "INGREDIENTES", name: "Atum", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Bacon", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Charque", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Camarão", pricePM: 14.0, priceGGG: 25.0, isUnit: false },
    { category: "INGREDIENTES", name: "Calabresa", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Carne de Sol", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Frango", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Lombo Canadense", pricePM: 8.0, priceGGG: 15.0, isUnit: false },
    { category: "INGREDIENTES", name: "Presunto", pricePM: 7.0, priceGGG: 12.0, isUnit: false },
    { category: "INGREDIENTES", name: "Queijo Coalho", pricePM: 7.0, priceGGG: 12.0, isUnit: false },
    { category: "INGREDIENTES", name: "Queijo Provolone", pricePM: 7.0, priceGGG: 12.0, isUnit: false },
    { category: "INGREDIENTES", name: "Mussarela", pricePM: 10.0, priceGGG: 16.0, isUnit: false },
    { category: "INGREDIENTES", name: "Peperone", pricePM: 8.0, priceGGG: 14.0, isUnit: false },
    { category: "INGREDIENTES", name: "Parmesão", pricePM: 8.0, priceGGG: 14.0, isUnit: false },
    { category: "INGREDIENTES", name: "Salaminho Italiano", pricePM: 8.0, priceGGG: 14.0, isUnit: false },
    { category: "INGREDIENTES", name: "Tomate", pricePM: 2.0, priceGGG: 4.0, isUnit: false },
    { category: "INGREDIENTES", name: "Cebola", pricePM: 2.0, priceGGG: 4.0, isUnit: false },
    { category: "INGREDIENTES", name: "Ovo", pricePM: 3.0, priceGGG: 5.0, isUnit: false },
    { category: "INGREDIENTES", name: "Ervilha", pricePM: 3.0, priceGGG: 5.0, isUnit: false },
    { category: "INGREDIENTES", name: "Milho", pricePM: 3.0, priceGGG: 5.0, isUnit: false },

    // CREMES
    { category: "CREMES", name: "Catupiry", pricePM: 4.0, priceGGG: 6.0, isUnit: false },
    { category: "CREMES", name: "Cheddar", pricePM: 4.0, priceGGG: 6.0, isUnit: false },
    { category: "CREMES", name: "Cream Cheese", pricePM: 9.0, priceGGG: 14.0, isUnit: false },
    { category: "CREMES", name: "Catupiry Original", pricePM: 11.0, priceGGG: 18.0, isUnit: false },
    { category: "CREMES", name: "Cheddar Original", pricePM: 11.0, priceGGG: 18.0, isUnit: false },
    { category: "CREMES", name: "Cream Cheese Original", pricePM: 11.0, priceGGG: 18.0, isUnit: false },
    { category: "CREMES", name: "Requeijão", pricePM: 7.0, priceGGG: 10.0, isUnit: false },

    // DOCES
    { category: "DOCES", name: "Bis", pricePM: 4.0, priceGGG: 8.0, isUnit: false },
    { category: "DOCES", name: "Chocolate Branco", pricePM: 8.0, priceGGG: 12.0, isUnit: false },
    { category: "DOCES", name: "Chocolate ao Leite", pricePM: 8.0, priceGGG: 12.0, isUnit: false },
    { category: "DOCES", name: "Chocolate Avelã", pricePM: 10.0, priceGGG: 16.0, isUnit: false },
    { category: "DOCES", name: "Goiabada", pricePM: 6.0, priceGGG: 10.0, isUnit: false },
    { category: "DOCES", name: "Granulado", pricePM: 4.0, priceGGG: 8.0, isUnit: false },
    { category: "DOCES", name: "M.&.M", pricePM: 6.0, priceGGG: 10.0, isUnit: false },
    { category: "DOCES", name: "Nutella", pricePM: 10.0, priceGGG: 16.0, isUnit: false },
    { category: "DOCES", name: "Sonho de Valsa (Unidade)", pricePM: 2.0, priceGGG: 2.0, isUnit: true },
    { category: "DOCES", name: "Ouro Branco (Unidade)", pricePM: 2.0, priceGGG: 2.0, isUnit: true },
    { category: "DOCES", name: "Kit.Kat (Unidade)", pricePM: 6.0, priceGGG: 6.0, isUnit: true },
    { category: "DOCES", name: "Cocô Ralado", pricePM: 6.0, priceGGG: 10.0, isUnit: false },

    // FRUTAS
    { category: "FRUTAS", name: "Morango", pricePM: 8.0, priceGGG: 14.0, isUnit: false },
    { category: "FRUTAS", name: "Banana", pricePM: 5.0, priceGGG: 10.0, isUnit: false },
    { category: "FRUTAS", name: "Uva", pricePM: 8.0, priceGGG: 14.0, isUnit: false },
  ];

  const toppingCategoryMap: { [catName: string]: string } = {};

  for (const item of toppingsData) {
    if (!toppingCategoryMap[item.category]) {
      const createdCat = await prisma.pizzaToppingCategory.create({
        data: { name: item.category },
      });
      toppingCategoryMap[item.category] = createdCat.id;
    }

    await prisma.pizzaTopping.create({
      data: {
        name: item.name,
        pricePM: item.pricePM,
        priceGGG: item.priceGGG,
        isUnit: item.isUnit,
        categoryId: toppingCategoryMap[item.category],
      },
    });
  }

  console.log("Pizza toppings seeded successfully.");

  console.log("Seed process completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error running seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
