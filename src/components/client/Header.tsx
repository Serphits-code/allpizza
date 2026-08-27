"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/stores/cartStore";

export default function ClientHeader() {
  const itemsCount = useCartStore((state) => state.getCartItemsCount());
  const [mounted, setMounted] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean>(true);
  const [companyName, setCompanyName] = useState("Artisanal");
  const [companyLogo, setCompanyLogo] = useState("");

  // Busca o status da loja uma vez no mount (sem SSE para nao bloquear conexoes HTTP)
  useEffect(() => {
    setMounted(true);

    fetch("/api/public/store-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.open !== undefined) setStoreOpen(data.open);
        if (data.companyName) setCompanyName(data.companyName);
        if (data.companyLogo) setCompanyLogo(data.companyLogo);
      })
      .catch((err) => console.error("Erro ao carregar status da loja no header:", err));
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full bg-brand-bg/95 backdrop-blur-md border-b border-brand-mediumGray/60 select-none">
      {/* Barra Principal do Header */}
      <div className="mx-auto flex max-w-6xl h-14 sm:h-16 items-center justify-between px-3 sm:px-6">
        {/* Lado Esquerdo: Logo e Nome */}
        <Link href="/" className="flex items-center gap-2 group min-w-0">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-8 sm:h-10 w-auto object-contain shrink-0" />
          ) : (
            <div className="flex items-baseline gap-2 truncate">
              <span className="font-serif text-lg sm:text-2xl font-bold tracking-wider text-brand-red group-hover:text-brand-redHover transition-colors truncate max-w-[135px] xs:max-w-[170px] sm:max-w-none">
                {companyName}
              </span>
              {companyName === "Artisanal" && (
                <span className="hidden md:inline font-sans text-xs tracking-widest text-brand-lightGray uppercase border-l border-brand-mediumGray pl-2">
                  Crust & Ember
                </span>
              )}
            </div>
          )}
        </Link>

        {/* Lado Direito: Navegação + Carrinho */}
        <nav className="flex items-center space-x-2.5 xs:space-x-4 sm:space-x-6 shrink-0">
          <Link
            href="/"
            className="text-xs sm:text-sm font-medium text-brand-lightGray hover:text-white transition-colors"
          >
            Cardápio
          </Link>
          <Link
            href="/monte-sua-pizza"
            className="text-xs sm:text-sm font-medium text-brand-lightGray hover:text-brand-red transition-colors whitespace-nowrap"
          >
            Monte sua Pizza
          </Link>

          <Link
            href="/carrinho"
            className="relative flex items-center justify-center p-1.5 sm:p-2 text-brand-lightGray hover:text-white transition-colors"
            aria-label="Carrinho de compras"
          >
            {/* SVG Ícone do Carrinho */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 sm:w-6 sm:h-6 shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5h.008v.008h-.008V10.5zm6.75 0h.008v.008h-.008V10.5z"
              />
            </svg>

            {mounted && itemsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex h-4.5 w-4.5 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-brand-red text-[10px] sm:text-xxs font-bold text-white ring-2 ring-brand-bg shadow-sm">
                {itemsCount}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Barra Discreta de Status do Delivery (De borda a borda abaixo do header) */}
      {mounted && (
        <div
          className={`w-full py-1 px-3 text-center text-xs font-semibold flex items-center justify-center gap-2 border-t transition-colors select-none ${
            storeOpen
              ? "bg-emerald-950/80 border-emerald-500/20 text-emerald-300 shadow-inner"
              : "bg-red-950/80 border-red-500/20 text-red-300 shadow-inner"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              storeOpen ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/80" : "bg-brand-red"
            }`}
          />
          <span className="text-[11px] sm:text-xs">
            Delivery: <strong className="font-bold">{storeOpen ? "Aberto" : "Fechado"}</strong>
          </span>
          <span className="text-[10px] sm:text-[11px] opacity-75 hidden xs:inline">
            {storeOpen ? "• Faça seu pedido online agora!" : "• No momento não estamos recebendo pedidos online"}
          </span>
        </div>
      )}
    </header>
  );
}
