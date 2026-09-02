import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { sseManager } from "@/lib/sse";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { z } from "zod";
import {
  calcPizzaBasePrice,
  calcCrustPrice,
  calcSingleToppingPrice,
  roundCurrency,
  FlavorInput,
} from "@/lib/pricing";
import { findDeliveryZone } from "@/lib/geo";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Rate limiter para criação pública de pedidos: 10 pedidos por minuto por IP
const orderRateLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 1000,
});

// Validador Zod do payload do pedido
const orderItemToppingSchema = z.object({
  toppingName: z.string(),
  targetType: z.string().default("INTEIRA"),
  flavorName: z.string().optional().nullable(),
  slicesCount: z.number().default(1),
  totalSlices: z.number().default(1),
  price: z.number().optional(), // Aceito mas recalculado server-side
});

const orderItemSchema = z.object({
  name: z.string(),
  isPizza: z.boolean(),
  quantity: z.number().min(1),
  price: z.number().optional(), // Recalculado server-side
  pizzaSize: z.string().optional(),
  crustType: z.string().optional().nullable(),
  crustPrice: z.number().optional(),
  caracolRequested: z.boolean().optional(),
  flavors: z
    .array(
      z.object({
        name: z.string(),
        categoryName: z.string().optional(),
      })
    )
    .optional(),
  toppings: z.array(orderItemToppingSchema).optional(),
});

const orderSchema = z.object({
  customerName: z.string().min(2, "Nome é muito curto"),
  customerPhone: z.string().min(10, "Telefone é muito curto"),
  type: z.nativeEnum(OrderType),
  customerAddress: z.string().optional().nullable(),
  addressNumber: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  customerLat: z.number().optional().nullable(),
  customerLng: z.number().optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  changeFor: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  deliveryFee: z.number().optional(), // Recalculado server-side
  items: z.array(orderItemSchema).min(1, "O pedido deve ter pelo menos um item"),
});

export async function POST(request: Request) {
  // 1. Rate Limiting por IP
  const ip = getClientIp(request);
  const rateLimitResult = orderRateLimiter.check(10, `order_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Muitas tentativas de criação de pedido. Por favor, aguarde um minuto." },
      { status: 429 }
    );
  }

  try {
    const json = await request.json();
    const result = orderSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: "Payload inválido", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // 2. Valida se o estabelecimento está aberto
    const config = await prisma.systemConfig.findUnique({
      where: { key: "delivery_open" },
    });
    const storeOpen = config ? config.value === "true" : true;
    if (!storeOpen) {
      return NextResponse.json(
        { error: "O estabelecimento está fechado no momento e não está aceitando novos pedidos." },
        { status: 400 }
      );
    }

    const phoneKey = normalizeContactPhoneKey(data.customerPhone);
    if (!phoneKey || phoneKey.length < 10) {
      return NextResponse.json({ error: "Telefone do cliente inválido" }, { status: 400 });
    }

    // 3. Carrega base de precificação do banco para recálculo server-side
    const [dbProducts, dbFlavors, dbCrusts, dbToppings, dbZones] = await Promise.all([
      prisma.product.findMany(),
      prisma.pizzaFlavor.findMany({ include: { category: true } }),
      prisma.crustType.findMany(),
      prisma.pizzaTopping.findMany(),
      prisma.deliveryZone.findMany({ where: { isActive: true } }),
    ]);

    const productMap = new Map(dbProducts.map((p) => [p.name.toLowerCase().trim(), p]));
    const flavorMap = new Map(dbFlavors.map((f) => [f.name.toLowerCase().trim(), f]));
    const crustMap = new Map(dbCrusts.map((c) => [c.name.toLowerCase().trim(), c]));
    const toppingMap = new Map(dbToppings.map((t) => [t.name.toLowerCase().trim(), t]));

    // 4. Recálculo dos Itens do Pedido no Servidor
    let subtotal = 0;
    const validatedItemsData: any[] = [];

    for (const item of data.items) {
      const quantity = Math.max(1, item.quantity);

      if (item.isPizza) {
        const size = (item.pizzaSize || "G").toUpperCase();
        if (!["P", "M", "G", "GG"].includes(size)) {
          return NextResponse.json(
            { error: `Tamanho de pizza inválido: ${item.pizzaSize}` },
            { status: 400 }
          );
        }

        // Valida sabores e obtém preços de categoria do banco
        const itemFlavors = item.flavors || [];
        if (itemFlavors.length === 0) {
          return NextResponse.json(
            { error: "A pizza precisa conter ao menos 1 sabor selecionado." },
            { status: 400 }
          );
        }

        const flavorInputs: FlavorInput[] = [];
        const validatedFlavorsData: { flavorName: string; categoryName: string }[] = [];

        for (const f of itemFlavors) {
          const rawName = f.name.trim();
          // Remove prefixos como "4 fatias Atum", "2 fatias - Calabresa", etc.
          const cleanedName = rawName
            .replace(/^\d+\s+fatias?\s*[-–—:]?\s*/i, "")
            .replace(/\s*\(\d+\s*fatias?\)$/i, "")
            .trim();

          const dbFlavor =
            flavorMap.get(cleanedName.toLowerCase()) ||
            flavorMap.get(rawName.toLowerCase());

          if (!dbFlavor) {
            return NextResponse.json(
              { error: `Sabor de pizza não encontrado no cardápio: ${f.name}` },
              { status: 400 }
            );
          }
          flavorInputs.push({
            name: dbFlavor.name,
            category: {
              priceP: dbFlavor.category.priceP,
              priceM: dbFlavor.category.priceM,
              priceG: dbFlavor.category.priceG,
              priceGG: dbFlavor.category.priceGG,
            },
          });
          validatedFlavorsData.push({
            flavorName: dbFlavor.name,
            categoryName: dbFlavor.category.name,
          });
        }

        // Preço base da pizza
        const basePizzaPrice = calcPizzaBasePrice(size, flavorInputs);

        // Borda recheada
        let calculatedCrustPrice = 0;
        let crustTypeName: string | null = null;

        if (item.crustType && item.crustType.trim() !== "" && item.crustType !== "Tradicional") {
          const dbCrust = crustMap.get(item.crustType.toLowerCase().trim());
          if (dbCrust) {
            crustTypeName = dbCrust.name;
            calculatedCrustPrice = calcCrustPrice(size, dbCrust, !!item.caracolRequested);
          }
        }

        // Adicionais / Toppings
        let toppingsUnitTotal = 0;
        const validatedToppingsData: any[] = [];

        if (item.toppings && item.toppings.length > 0) {
          for (const t of item.toppings) {
            const dbTopping = toppingMap.get(t.toppingName.toLowerCase().trim());
            if (dbTopping) {
              const toppingPrice = calcSingleToppingPrice(
                dbTopping,
                size,
                t.slicesCount || 1,
                t.totalSlices || 1,
                1
              );
              toppingsUnitTotal += toppingPrice;
              validatedToppingsData.push({
                toppingName: dbTopping.name,
                targetType: t.targetType || "INTEIRA",
                flavorName: t.flavorName || null,
                slicesCount: t.slicesCount || 1,
                totalSlices: t.totalSlices || 1,
                price: toppingPrice,
              });
            }
          }
        }

        const unitItemPrice = roundCurrency(basePizzaPrice + calculatedCrustPrice + toppingsUnitTotal);
        const itemTotalPrice = roundCurrency(unitItemPrice * quantity);
        subtotal += itemTotalPrice;

        validatedItemsData.push({
          name: item.name,
          quantity,
          basePrice: unitItemPrice,
          totalPrice: itemTotalPrice,
          isPizza: true,
          pizzaSize: size,
          crustType: crustTypeName,
          crustPrice: calculatedCrustPrice,
          flavors: validatedFlavorsData,
          toppings: validatedToppingsData,
        });
      } else {
        // Produto regular (bebida, sobremesa, etc.)
        const dbProduct = productMap.get(item.name.toLowerCase().trim());
        if (!dbProduct) {
          return NextResponse.json(
            { error: `Produto não encontrado no cardápio: ${item.name}` },
            { status: 400 }
          );
        }

        const unitPrice = roundCurrency(dbProduct.price);
        const itemTotalPrice = roundCurrency(unitPrice * quantity);
        subtotal += itemTotalPrice;

        validatedItemsData.push({
          name: dbProduct.name,
          quantity,
          basePrice: unitPrice,
          totalPrice: itemTotalPrice,
          isPizza: false,
          pizzaSize: null,
          crustType: null,
          crustPrice: 0,
          flavors: [],
          toppings: [],
        });
      }
    }

    subtotal = roundCurrency(subtotal);

    // 5. Recálculo da Taxa de Entrega no Servidor
    let deliveryFee = 0;
    if (data.type === OrderType.DELIVERY) {
      if (
        data.customerLat !== null &&
        data.customerLat !== undefined &&
        data.customerLng !== null &&
        data.customerLng !== undefined
      ) {
        const zone = findDeliveryZone(data.customerLat, data.customerLng, dbZones);
        if (zone) {
          deliveryFee = roundCurrency(zone.deliveryFee);
        } else if (dbZones.length > 0) {
          // Se não estiver dentro de nenhuma zona delimitada
          return NextResponse.json(
            { error: "Endereço fora da área de entrega atendida pelo estabelecimento." },
            { status: 400 }
          );
        }
      }
    }

    const total = roundCurrency(subtotal + deliveryFee);

    // 6. Persistência em Transação Atômica
    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          status: OrderStatus.NOVO,
          type: data.type,
          customerName: data.customerName.trim(),
          customerPhone: phoneKey,
          customerAddress: data.type === OrderType.DELIVERY ? data.customerAddress : null,
          addressNumber: data.type === OrderType.DELIVERY ? data.addressNumber : null,
          reference: data.type === OrderType.DELIVERY ? data.reference : null,
          customerLat: data.type === OrderType.DELIVERY ? data.customerLat : null,
          customerLng: data.type === OrderType.DELIVERY ? data.customerLng : null,
          paymentMethod: data.paymentMethod,
          changeFor: data.paymentMethod === PaymentMethod.DINHEIRO ? data.changeFor : null,
          subtotal,
          deliveryFee,
          total,
          notes: data.notes,
        },
      });

      for (const it of validatedItemsData) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            name: it.name,
            quantity: it.quantity,
            basePrice: it.basePrice,
            totalPrice: it.totalPrice,
            isPizza: it.isPizza,
            pizzaSize: it.pizzaSize,
            crustType: it.crustType,
            crustPrice: it.crustPrice,
          },
        });

        if (it.isPizza && it.flavors.length > 0) {
          for (const f of it.flavors) {
            await tx.orderItemFlavor.create({
              data: {
                orderItemId: orderItem.id,
                flavorName: f.flavorName,
                categoryName: f.categoryName,
              },
            });
          }
        }

        if (it.isPizza && it.toppings.length > 0) {
          for (const t of it.toppings) {
            await tx.orderItemTopping.create({
              data: {
                orderItemId: orderItem.id,
                toppingName: t.toppingName,
                targetType: t.targetType,
                flavorName: t.flavorName,
                slicesCount: t.slicesCount,
                totalSlices: t.totalSlices,
                price: t.price,
              },
            });
          }
        }
      }

      await tx.customerContactProfile.upsert({
        where: { phoneKey },
        update: {},
        create: { phoneKey },
      });

      return tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: {
            include: {
              flavors: true,
              toppings: true,
            },
          },
        },
      });
    });

    if (createdOrder) {
      sseManager.publish("order_created", createdOrder);
    }

    return NextResponse.json({ success: true, order: createdOrder }, { status: 201 });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ error: "Erro interno ao processar o pedido" }, { status: 500 });
  }
}
