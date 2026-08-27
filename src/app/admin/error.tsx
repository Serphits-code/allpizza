"use client";

import React, { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center">
      <div className="space-y-4 max-w-md bg-zinc-900 p-8 rounded-3xl border border-zinc-800 shadow-2xl">
        <h2 className="text-xl font-bold text-red-500">Erro no Painel Administrativo</h2>
        <p className="text-xs text-zinc-400">
          {error?.message || "Ocorreu um erro ao carregar os dados administrativos."}
        </p>
        <button
          onClick={() => reset()}
          className="w-full rounded-xl bg-red-600 hover:bg-red-700 py-3 text-xs font-bold text-white transition cursor-pointer"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}
