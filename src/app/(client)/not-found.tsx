import React from "react";
import Link from "next/link";

export default function ClientNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-brand-bg text-white">
      <div className="space-y-4 max-w-md bg-brand-darkGray p-8 rounded-3xl border border-brand-mediumGray shadow-2xl">
        <span className="text-5xl">🍕</span>
        <h2 className="font-serif text-xl font-bold text-brand-red">Página não encontrada</h2>
        <p className="text-xs text-brand-lightGray">
          Desculpe, a opção ou página selecionada não está disponível.
        </p>
        <Link
          href="/"
          className="inline-block w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3 text-xs font-bold text-white transition cursor-pointer"
        >
          Ir para o Início
        </Link>
      </div>
    </div>
  );
}
