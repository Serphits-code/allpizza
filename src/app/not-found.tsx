import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg text-white p-6 text-center">
      <div className="space-y-4 max-w-md bg-brand-darkGray p-8 rounded-3xl border border-brand-mediumGray shadow-2xl">
        <span className="text-5xl">🍕</span>
        <h2 className="font-serif text-2xl font-bold text-brand-red">404 - Página Não Encontrada</h2>
        <p className="text-xs text-brand-lightGray">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Link
          href="/"
          className="inline-block w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3 text-xs font-bold text-white transition cursor-pointer"
        >
          Voltar ao Cardápio
        </Link>
      </div>
    </div>
  );
}
