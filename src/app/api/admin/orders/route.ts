import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { normalizeContactPhoneKey } from "@/lib/phone";
import { roundCurrency } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// POST /api/admin/orders - Cria pedido manual / subpedido de comanda
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const role = session.user.role;
  if (!["ADMIN", "MANAGER", "GARCOM", "KITCHEN"].includes(role)) {
    return NextResponse.json({ error: "Acesso não autorizado para esta função" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      type = "COMANDA",
      comandaId,
      customerName,
      customerPhone,
      customerAddress,
      addressNumber,
      reference,
      paymentMethod = "DINHEIRO",
      changeFor,
      deliveryFee = 0,
      notes,
      items,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "O pedido precisa conter ao menos um item" }, { status: 400 });
    }

    // Calcula subtotal e total com arredondamento seguro
    let subtotal = 0;
    const itemsData = items.map((item: any) => {
      const quantity = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
      const basePrice = Math.max(0, parseFloat(item.basePrice || item.price || "0") || 0);
      const crustPrice = Math.max(0, parseFloat(item.crustPrice || "0") || 0);

      const toppingsTotal = (item.toppings || []).reduce(
        (sum: number, t: any) => sum + Math.max(0, parseFloat(t.price || "0") || 0),
        0
      );

      const unitTotal = roundCurrency(basePrice + crustPrice + toppingsTotal);
      const finalItemTotal = roundCurrency(unitTotal * quantity);
      subtotal += finalItemTotal;

      return {
        name: item.name || "Item",
        quantity,
        basePrice: unitTotal,
        totalPrice: finalItemTotal,
        isPizza: Boolean(item.isPizza),
        pizzaSize: item.pizzaSize || null,
        crustType: item.crustType || null,
        crustPrice,
        flavors: {
          create: (item.flavors || []).map((f: any) => ({
            flavorName: typeof f === "string" ? f : f.flavorName || f.name || "Sabor",
            categoryName: f.categoryName || "Pizza",
          })),
        },
        toppings: {
          create: (item.toppings || []).map((t: any) => ({
            toppingName: t.toppingName || t.name || "Adicional",
            targetType: t.targetType || "INTEIRA",
            flavorName: t.flavorName || null,
            slicesCount: t.slicesCount || 1,
            totalSlices: t.totalSlices || 1,
            price: Math.max(0, parseFloat(t.price || "0") || 0),
          })),
        },
      };
    });

    subtotal = roundCurrency(subtotal);
    const parsedDeliveryFee = Math.max(0, parseFloat(deliveryFee) || 0);
    const total = roundCurrency(subtotal + parsedDeliveryFee);

    // Determina o status inicial (padrão NOVO para passar pelas etapas Novos > Na Cozinha > Comanda de Mesa)
    const isComanda = type === "COMANDA" || Boolean(comandaId);
    const initialStatus = body.status || "NOVO";

    let comandaNumber = null;
    let effectiveCustomerName = customerName || "Cliente";

    if (comandaId) {
      const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
      if (comanda) {
        comandaNumber = comanda.number;
        if (!customerName || customerName === "Cliente") {
          effectiveCustomerName = comanda.responsibleName || `Mesa ${comanda.number}`;
        }
      }
    }

    const phoneKey = customerPhone ? normalizeContactPhoneKey(customerPhone) : "00000000000";

    // Cria o Pedido em transação atômica
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          type: isComanda ? "COMANDA" : type,
          status: initialStatus,
          customerName: effectiveCustomerName,
          customerPhone: phoneKey,
          customerAddress: customerAddress || null,
          addressNumber: addressNumber || null,
          reference: reference || null,
          paymentMethod,
          changeFor: changeFor ? parseFloat(changeFor) : null,
          subtotal,
          deliveryFee: parsedDeliveryFee,
          total,
          notes: notes || null,
          comandaId: comandaId || null,
          preparedAt: initialStatus === "EM_PREPARO" ? new Date() : null,
          items: {
            create: itemsData,
          },
        },
        include: {
          comanda: true,
          items: {
            include: {
              flavors: true,
              toppings: true,
            },
          },
        },
      });

      // Se vinculado a comanda, marca comanda como OCUPADA
      if (comandaId) {
        await tx.comanda.update({
          where: { id: comandaId },
          data: { status: "OCUPADA" },
        });
      }

      return created;
    });

    // Publica no barramento SSE para Kanban e Impressora Desktop
    sseManager.publish("order_created", order);

    // Se nasceu em EM_PREPARO, dispara evento de impressão
    if (initialStatus === "EM_PREPARO") {
      const printPayload = {
        action: "print_receipt",
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          comandaNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress,
          addressNumber: order.addressNumber,
          reference: order.reference,
          paymentMethod: order.paymentMethod,
          changeFor: order.changeFor,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          total: order.total,
          notes: order.notes,
          createdAt: order.createdAt,
          items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.basePrice,
            totalPrice: item.totalPrice,
            isPizza: item.isPizza,
            pizzaSize: item.pizzaSize,
            crustType: item.crustType,
            crustPrice: item.crustPrice,
            flavors: item.flavors.map((f) => ({
              name: f.flavorName,
              categoryName: f.categoryName,
            })),
          })),
        },
      };
      sseManager.publish("print_order", printPayload);
    }

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
    console.error("Create admin order error:", error);
    return NextResponse.json({ error: "Erro interno ao criar pedido" }, { status: 500 });
  }
}
