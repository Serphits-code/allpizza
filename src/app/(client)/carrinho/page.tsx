"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, getCartSubtotal, clearCart } = useCartStore();
  const [mounted, setMounted] = useState(false);

  // Evita erros de hidratação
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-brand-lightGray text-sm">Carregando seu carrinho...</p>
      </main>
    );
  }

  const subtotal = getCartSubtotal();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-3xl font-bold tracking-wide mb-8 border-l-4 border-brand-red pl-3">
        Seu Carrinho
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-brand-mediumGray bg-brand-darkGray/30 rounded-3xl space-y-6">
          <p className="text-brand-lightGray text-sm">
            Seu carrinho está vazio no momento.
          </p>
          <div>
            <Link
              href="/"
              className="inline-block rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-semibold text-xs text-white transition-colors cursor-pointer"
            >
              Voltar ao Cardápio
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Listagem de Itens */}
          <div className="lg:col-span-8 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl border border-brand-mediumGray bg-brand-darkGray p-4 sm:p-5 gap-4 hover:border-brand-mediumGray/75 transition-colors"
              >
                <div className="space-y-1.5 max-w-md">
                  <span className="inline-block text-xxs font-bold uppercase tracking-wider text-brand-red">
                    {item.isPizza ? "Pizza Customizada" : "Acompanhamento"}
                  </span>
                  <h3 className="font-serif text-base font-bold text-white leading-snug">
                    {item.name}
                  </h3>
                  
                  {item.isPizza && (
                    <div className="text-xxs text-brand-lightGray space-y-0.5">
                      <p>Tamanho: <span className="text-white font-mono">{item.pizzaSize}</span></p>
                      <p>Borda: <span className="text-white">{item.crustType}</span> {item.caracolRequested && <span className="text-brand-red">(Caracol)</span>}</p>
                      {item.notes && <p className="italic text-brand-red/80">Obs: "{item.notes}"</p>}
                    </div>
                  )}
                  
                  {!item.isPizza && item.notes && (
                    <p className="text-xxs italic text-brand-red/80">Obs: "{item.notes}"</p>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t border-brand-mediumGray/30 sm:border-t-0">
                  {/* Preço Unitário */}
                  <span className="font-mono text-sm font-bold text-brand-red">
                    R$ {item.price.toFixed(2)}
                  </span>

                  {/* Controle de Quantidade */}
                  <div className="flex items-center space-x-2 bg-brand-bg rounded-lg p-1 border border-brand-mediumGray">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center text-brand-lightGray hover:text-white rounded hover:bg-brand-mediumGray transition-colors cursor-pointer font-bold text-xs"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono text-xs font-semibold text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center text-brand-lightGray hover:text-white rounded hover:bg-brand-mediumGray transition-colors cursor-pointer font-bold text-xs"
                    >
                      +
                    </button>
                  </div>

                  {/* Remover Item */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-xxs text-brand-lightGray/60 hover:text-brand-red transition-colors cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}

            {/* Ações Auxiliares do Carrinho */}
            <div className="flex items-center justify-between pt-2">
              <Link
                href="/"
                className="text-xs font-semibold text-brand-lightGray hover:text-white transition-colors"
              >
                ← Adicionar mais itens
              </Link>
              <button
                onClick={() => {
                  if (confirm("Deseja realmente esvaziar o carrinho?")) {
                    clearCart();
                  }
                }}
                className="text-xs font-semibold text-brand-lightGray/50 hover:text-brand-red transition-colors cursor-pointer"
              >
                Esvaziar Carrinho
              </button>
            </div>
          </div>

          {/* Checkout / Resumo */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-xl">
            <h2 className="font-serif text-lg font-bold border-b border-brand-mediumGray/50 pb-3 text-white">
              Resumo do Pedido
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-brand-lightGray">
                <span>Subtotal dos itens</span>
                <span className="font-mono text-white">R$ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-brand-lightGray">
                <span>Taxa de Entrega</span>
                <span className="font-mono text-white italic">Calcular no Checkout</span>
              </div>
            </div>

            <div className="border-t border-brand-mediumGray/50 pt-4 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Total Provisório</span>
              <span className="font-mono text-xl font-bold text-brand-red">
                R$ {subtotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => router.push("/checkout")}
              className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-sm font-bold text-white transition-colors cursor-pointer"
            >
              Avançar para Checkout
            </button>
            
            <p className="text-xxs text-brand-lightGray/70 text-center leading-relaxed">
              O fluxo de checkout é simplificado e não exige cadastro ou senhas. Você informará apenas o seu número de telefone e o local de entrega.
            </p>
          </div>
          
        </div>
      )}
    </main>
  );
}
