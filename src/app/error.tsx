"use client";

import React, { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg text-white p-6 text-center">
      <div className="space-y-4 max-w-md bg-brand-darkGray p-8 rounded-3xl border border-brand-mediumGray shadow-2xl">
        <span className="text-4xl">🍕</span>
        <h2 className="font-serif text-2xl font-bold text-brand-red">Ops! Algo deu errado</h2>
        <p className="text-xs text-brand-lightGray">
          {error?.message || "Ocorreu um erro inesperado ao carregar a página."}
        </p>
        <button
          onClick={() => reset()}
          className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3 text-xs font-bold text-white transition cursor-pointer"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}
