import React from "react";

export default function MonteSuaPizzaLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-pulse">
      {/* Header das etapas */}
      <div className="mb-8 flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-4 bg-brand-darkGray/80 border border-brand-mediumGray/50 p-2 rounded-2xl">
          <div className="h-8 w-28 sm:w-36 bg-brand-red/30 rounded-xl" />
          <span className="text-neutral-700">→</span>
          <div className="h-8 w-28 sm:w-36 bg-brand-mediumGray/30 rounded-xl" />
          <span className="text-neutral-700">→</span>
          <div className="h-8 w-28 sm:w-36 bg-brand-mediumGray/30 rounded-xl" />
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Coluna Esquerda: Disco da Pizza */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-6">
          <div className="h-7 w-48 bg-brand-mediumGray/40 rounded-lg" />
          
          {/* Círculo do disco da pizza */}
          <div className="w-72 h-72 sm:w-88 sm:h-88 rounded-full bg-brand-darkGray border-4 border-dashed border-brand-mediumGray/40 flex items-center justify-center relative shadow-2xl">
            <div className="w-56 h-56 sm:w-68 sm:h-68 rounded-full bg-brand-bg/60 border border-brand-mediumGray/30 flex items-center justify-center">
              <span className="text-xs font-serif text-brand-lightGray/40">Carregando visualização...</span>
            </div>
          </div>

          <div className="h-3 w-64 bg-brand-mediumGray/20 rounded-full" />
        </div>

        {/* Coluna Direita: Painel de Customização */}
        <div className="lg:col-span-6 space-y-8 rounded-2xl border border-brand-mediumGray/60 bg-brand-darkGray p-6 sm:p-8 shadow-xl">
          {/* Título */}
          <div className="space-y-2">
            <div className="h-8 w-56 bg-brand-mediumGray/50 rounded-lg" />
            <div className="h-3 w-80 bg-brand-mediumGray/30 rounded" />
          </div>

          {/* Quantidade de Sabores */}
          <div className="space-y-3">
            <div className="h-3 w-32 bg-brand-mediumGray/40 rounded" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-10 bg-brand-red/30 rounded-lg" />
              <div className="h-10 bg-brand-bg/50 border border-brand-mediumGray/30 rounded-lg" />
              <div className="h-10 bg-brand-bg/50 border border-brand-mediumGray/30 rounded-lg" />
            </div>
          </div>

          {/* Tamanhos */}
          <div className="space-y-3">
            <div className="h-3 w-20 bg-brand-mediumGray/40 rounded" />
            <div className="grid grid-cols-4 gap-2">
              <div className="h-14 bg-brand-bg/50 border border-brand-mediumGray/30 rounded-lg" />
              <div className="h-14 bg-brand-bg/50 border border-brand-mediumGray/30 rounded-lg" />
              <div className="h-14 bg-brand-red/20 border border-brand-red/40 rounded-lg" />
              <div className="h-14 bg-brand-bg/50 border border-brand-mediumGray/30 rounded-lg" />
            </div>
          </div>

          {/* Borda */}
          <div className="space-y-3 border-t border-brand-mediumGray/30 pt-6">
            <div className="h-3 w-28 bg-brand-mediumGray/40 rounded" />
            <div className="h-11 bg-brand-bg border border-brand-mediumGray/40 rounded-lg" />
          </div>

          {/* Observações */}
          <div className="space-y-3 border-t border-brand-mediumGray/30 pt-6">
            <div className="h-3 w-32 bg-brand-mediumGray/40 rounded" />
            <div className="h-16 bg-brand-bg border border-brand-mediumGray/40 rounded-lg" />
          </div>

          {/* Rodapé Preço e Botão */}
          <div className="border-t border-brand-mediumGray/30 pt-6 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-2.5 w-24 bg-brand-mediumGray/30 rounded" />
              <div className="h-7 w-28 bg-brand-red/30 rounded-lg" />
            </div>
            <div className="h-12 w-48 bg-brand-red/40 rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
