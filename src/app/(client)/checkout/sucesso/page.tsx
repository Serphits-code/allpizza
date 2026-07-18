import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { OrderType, PaymentMethod } from "@prisma/client";

import { getStoreConfig } from "@/lib/configHelper";

interface SuccessPageProps {
  searchParams: {
    orderId?: string;
  };
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const orderId = searchParams.orderId;

  if (!orderId) {
    notFound();
  }

  const config = await getStoreConfig();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          flavors: true,
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const paymentMethodLabel = {
    [PaymentMethod.PIX]: "PIX",
    [PaymentMethod.DINHEIRO]: "Dinheiro",
    [PaymentMethod.CREDITO]: "Cartão de Crédito",
    [PaymentMethod.DEBITO]: "Cartão de Débito",
  }[order.paymentMethod];

  const orderTypeLabel = {
    [OrderType.DELIVERY]: "Entrega a Domicílio",
    [OrderType.RETIRADA]: "Retirada no Balcão",
    [OrderType.COMANDA]: "Consumo Local",
  }[order.type];

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 sm:p-8 shadow-2xl space-y-8 text-center">
        
        {/* Ícone de Sucesso */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30">
          <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-white">
            Pedido Confirmado!
          </h1>
          <p className="text-sm text-brand-lightGray">
            Obrigado por comprar na {config.companyName}, <span className="font-semibold text-white">{order.customerName}</span>. Seu pedido já foi enviado para a nossa cozinha.
          </p>
        </div>

        {/* Quadro Resumo */}
        <div className="border border-brand-mediumGray/50 bg-brand-bg/50 rounded-xl p-5 text-left space-y-4 text-xs">
          <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-3">
            <span className="text-brand-lightGray uppercase font-semibold tracking-wider">Número do Pedido</span>
            <span className="font-mono text-lg font-bold text-brand-red">#{order.orderNumber}</span>
          </div>

          <div className="grid grid-cols-2 gap-y-2.5">
            <span className="text-brand-lightGray font-semibold">Tipo do Pedido:</span>
            <span className="text-white text-right">{orderTypeLabel}</span>

            <span className="text-brand-lightGray font-semibold">Forma de Pagamento:</span>
            <span className="text-white text-right">
              {paymentMethodLabel}
              {order.changeFor && ` (Troco para R$ ${order.changeFor.toFixed(2)})`}
            </span>

            {order.type === OrderType.DELIVERY && (
              <>
                <span className="text-brand-lightGray font-semibold">Endereço de Entrega:</span>
                <span className="text-white text-right leading-tight">
                  {order.customerAddress}, {order.addressNumber}
                  {order.reference && <span className="block text-xxs text-brand-lightGray">({order.reference})</span>}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Detalhamento dos Itens */}
        <div className="text-left space-y-3">
          <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider">Itens do Pedido</h3>
          <div className="space-y-2.5">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-xs pb-2 border-b border-brand-mediumGray/20">
                <div className="space-y-0.5">
                  <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                  {item.isPizza && (
                    <span className="block text-xxs text-brand-lightGray">
                      Tamanho: {item.pizzaSize} | Borda: {item.crustType}
                    </span>
                  )}
                </div>
                <span className="font-mono text-brand-lightGray">R$ {(item.totalPrice).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resumo Financeiro */}
        <div className="space-y-3 border-t border-brand-mediumGray/50 pt-6 text-xs text-left">
          <div className="flex justify-between items-center text-brand-lightGray">
            <span>Subtotal</span>
            <span className="font-mono text-white">R$ {order.subtotal.toFixed(2)}</span>
          </div>
          {order.type === OrderType.DELIVERY && (
            <div className="flex justify-between items-center text-brand-lightGray">
              <span>Taxa de Entrega</span>
              <span className="font-mono text-white">R$ {order.deliveryFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-brand-mediumGray/30 pt-3 text-sm font-bold">
            <span className="text-white">Total Pago</span>
            <span className="font-mono text-base text-brand-red">R$ {order.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          {order.type === OrderType.DELIVERY && (
            <Link
              href={`/pedido/${order.id}`}
              className="inline-block rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-semibold text-xs text-white transition-colors cursor-pointer text-center"
            >
              Acompanhar Entrega em Tempo Real ➔
            </Link>
          )}
          <Link
            href="/"
            className="inline-block rounded-xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray px-6 py-3 font-semibold text-xs text-white transition-colors cursor-pointer text-center"
          >
            Voltar ao Cardápio
          </Link>
        </div>

      </div>
    </main>
  );
}
