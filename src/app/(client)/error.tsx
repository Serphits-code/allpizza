"use client";

import React, { useEffect } from "react";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Client Route Error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-brand-bg text-white">
      <div className="space-y-4 max-w-md bg-brand-darkGray p-8 rounded-3xl border border-brand-mediumGray shadow-2xl">
        <span className="text-4xl">🍕</span>
        <h2 className="font-serif text-xl font-bold text-brand-red">Ops! Algo não carregou corretamente</h2>
        <p className="text-xs text-brand-lightGray">
          {error?.message || "Ocorreu um imprevisto na exibição deste trecho."}
        </p>
        <button
          onClick={() => reset()}
          className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3 text-xs font-bold text-white transition cursor-pointer"
        >
          Recarregar Componente
        </button>
      </div>
    </div>
  );
}
