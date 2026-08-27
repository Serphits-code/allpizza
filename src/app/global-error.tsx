"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-white flex items-center justify-center min-h-screen p-4">
        <div className="text-center space-y-4 max-w-md p-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
          <span className="text-4xl">⚠️</span>
          <h2 className="text-xl font-bold text-red-500">Erro Global no Sistema</h2>
          <p className="text-xs text-zinc-400">
            {error?.message || "Ocorreu uma falha no sistema."}
          </p>
          <button
            onClick={() => reset()}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Recarregar Aplicação
          </button>
        </div>
      </body>
    </html>
  );
}
