import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { sseManager } from "@/lib/sse";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { z } from "zod";

// Validador Zod do payload do pedido
const orderItemToppingSchema = z.object({
  toppingName: z.string(),
  targetType: z.string(),
  flavorName: z.string().optional().nullable(),
  slicesCount: z.number().default(1),
  totalSlices: z.number().default(1),
  price: z.number(),
});

const orderItemSchema = z.object({
  name: z.string(),
  isPizza: z.boolean(),
  quantity: z.number().min(1),
  price: z.number(),
  pizzaSize: z.string().optional(),
  crustType: z.string().optional(),
  crustPrice: z.number().optional(),
  flavors: z.array(
    z.object({
      name: z.string(),
      categoryName: z.string(),
    })
  ).optional(),
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
  deliveryFee: z.number().default(0),
  items: z.array(orderItemSchema).min(1, "O pedido deve ter pelo menos um item"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = orderSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json({ error: "Payload inválido", details: result.error.format() }, { status: 400 });
    }

    const data = result.data;

    // Valida se o estabelecimento está aberto
    const config = await prisma.systemConfig.findUnique({
      where: { key: "delivery_open" },
    });
    const storeOpen = config ? config.value === "true" : true;
    if (!storeOpen) {
      return NextResponse.json({ error: "O estabelecimento está fechado no momento e não está aceitando novos pedidos." }, { status: 400 });
    }

    const phoneKey = normalizeContactPhoneKey(data.customerPhone);

    // Calcular subtotal e total final baseado nos itens enviados
    let subtotal = 0;
    for (const item of data.items) {
      subtotal += item.price * item.quantity;
    }

    const deliveryFee = data.type === OrderType.DELIVERY ? data.deliveryFee : 0;
    const total = subtotal + deliveryFee;

    // Inicia transação atômica
    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Cria o Pedido principal
      const order = await tx.order.create({
        data: {
          status: OrderStatus.NOVO,
          type: data.type,
          customerName: data.customerName,
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

      // 2. Cria os Itens do Pedido (com seus respectivos sabores e adicionais)
      for (const item of data.items) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            name: item.name,
            quantity: item.quantity,
            basePrice: item.price,
            totalPrice: item.price * item.quantity,
            isPizza: item.isPizza,
            pizzaSize: item.isPizza ? item.pizzaSize : null,
            crustType: item.isPizza ? item.crustType : null,
            crustPrice: item.isPizza ? (item.crustPrice || 0) : 0,
          },
        });

        if (item.isPizza && item.flavors) {
          for (const flavor of item.flavors) {
            await tx.orderItemFlavor.create({
              data: {
                orderItemId: orderItem.id,
                flavorName: flavor.name,
                categoryName: flavor.categoryName,
              },
            });
          }
        }

        if (item.isPizza && item.toppings) {
          for (const topping of item.toppings) {
            await tx.orderItemTopping.create({
              data: {
                orderItemId: orderItem.id,
                toppingName: topping.toppingName,
                targetType: topping.targetType,
                flavorName: topping.flavorName || null,
                slicesCount: topping.slicesCount || 1,
                totalSlices: topping.totalSlices || 1,
                price: topping.price,
              },
            });
          }
        }
      }

      // 3. Atualiza ou Cria o Perfil de Contato do Cliente
      await tx.customerContactProfile.upsert({
        where: { phoneKey },
        update: {}, // Não sobrescreve display name ou anotações a cada pedido automático
        create: {
          phoneKey,
        },
      });

      // Retorna o pedido completo populado para notificar via SSE
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
      // Publica evento no Server-Sent Events hub
      sseManager.publish("order_created", createdOrder);
      console.log(`[SSE] Pedido #${createdOrder.orderNumber} publicado via SSE.`);
    }

    return NextResponse.json({ success: true, order: createdOrder });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ error: "Erro interno ao processar o pedido" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            flavors: true,
          },
        },
      },
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Error fetching public orders:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
