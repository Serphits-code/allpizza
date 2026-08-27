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
    <header className="sticky top-0 z-40 w-full border-b border-brand-mediumGray bg-brand-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl h-20 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-10 w-auto object-contain" />
            ) : (
              <>
                <span className="font-serif text-2xl font-bold tracking-wider text-brand-red">
                  {companyName}
                </span>
                {companyName === "Artisanal" && (
                  <span className="hidden sm:inline font-sans text-xs tracking-widest text-brand-lightGray uppercase border-l border-brand-mediumGray pl-2">
                    Crust & Ember
                  </span>
                )}
              </>
            )}
          </Link>

          {mounted && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xxs font-bold border transition-colors ${
              storeOpen
                ? "bg-green-600/10 border-green-500/20 text-green-400"
                : "bg-brand-red/10 border-brand-red/20 text-brand-red"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${storeOpen ? "bg-green-400 animate-pulse" : "bg-brand-red"}`} />
              Delivery: {storeOpen ? "Aberto" : "Fechado"}
            </div>
          )}
        </div>

        <nav className="flex items-center space-x-6">
          <Link
            href="/"
            className="text-sm font-medium text-brand-lightGray hover:text-white transition-colors"
          >
            Cardápio
          </Link>
          <Link
            href="/monte-sua-pizza"
            className="text-sm font-medium text-brand-lightGray hover:text-brand-red transition-colors"
          >
            Monte sua Pizza
          </Link>

          <Link
            href="/carrinho"
            className="relative flex items-center justify-center p-2 text-brand-lightGray hover:text-white transition-colors"
            aria-label="Carrinho de compras"
          >
            {/* SVG Ícone do Carrinho */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              width={24}
              height={24}
              style={{ width: "24px", height: "24px", minWidth: "24px", minHeight: "24px" }}
              className="w-6 h-6 shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5h.008v.008h-.008V10.5zm6.75 0h.008v.008h-.008V10.5z"
              />
            </svg>

            {mounted && itemsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-xxs font-bold text-white ring-2 ring-brand-bg">
                {itemsCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
