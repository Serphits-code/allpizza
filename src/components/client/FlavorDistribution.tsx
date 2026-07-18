"use client";

import React from "react";
import StepSlider from "./StepSlider";

interface PizzaFlavor {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: {
    name: string;
  };
}

interface FlavorDistributionProps {
  size: string;
  flavorCount: number;
  selectedFlavors: (PizzaFlavor | null)[];
  slicesDistribution: number[];
  onChangeSlices: (idx: number, newVal: number) => void;
}

export default function FlavorDistribution({
  size,
  flavorCount,
  selectedFlavors,
  slicesDistribution,
  onChangeSlices,
}: FlavorDistributionProps) {
  // Tamanhos e fatias totais correspondentes
  const totalSlicesForSize = React.useMemo(() => {
    switch (size.toUpperCase()) {
      case "P":
        return 4;
      case "M":
        return 6;
      case "G":
        return 8;
      case "GG":
        return 10;
      default:
        return 8;
    }
  }, [size]);

  // Se for tamanho P ou apenas 1 sabor, a distribuição dinâmica não é exibida
  const isDynamic = size.toUpperCase() !== "P" && flavorCount > 1;

  // Verifica se todos os sabores necessários foram selecionados
  const activeFlavors = selectedFlavors.slice(0, flavorCount);
  const allSelected = activeFlavors.every((f) => f !== null);

  if (!isDynamic) return null;

  const currentSum = slicesDistribution.reduce((a, b) => a + b, 0);
  const isComplete = currentSum === totalSlicesForSize;

  return (
    <div className="space-y-6 border-t border-brand-mediumGray/50 pt-6">
      {/* Header com Contador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-bg/40 p-4 rounded-xl border border-brand-mediumGray/45">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-lightGray">
            Distribuição das Fatias
          </h3>
          <p className="text-[10px] text-brand-lightGray/70 mt-1">
            Cada sabor deve ter pelo menos 2 fatias.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`font-mono text-sm font-bold px-2.5 py-1 rounded-md ${
            isComplete
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-brand-red/10 text-brand-red border border-brand-red/20"
          }`}>
            {currentSum} / {totalSlicesForSize} fatias
          </span>
          {isComplete && (
            <span className="text-emerald-400 text-xs font-bold flex items-center">
              ✅ Completa
            </span>
          )}
        </div>
      </div>

      {!allSelected ? (
        <div className="text-center py-6 px-4 bg-brand-bg/20 rounded-xl border border-dashed border-brand-mediumGray/30">
          <span className="text-xxs text-brand-lightGray/60 font-semibold uppercase block">
            🍕 Selecione todos os {flavorCount} sabores para ajustar a distribuição
          </span>
        </div>
      ) : (
        <div className="space-y-5">
          {activeFlavors.map((flavor, idx) => {
            if (!flavor) return null;

            const currentValue = slicesDistribution[idx] || 2;
            const min = 2;

            // O limite máximo dinâmico é a quantidade atual do sabor somado com a folga até o limite total
            // Mas não pode passar do limite lógico absoluto (Total - fatias mínimas dos outros sabores)
            const remainingSpace = totalSlicesForSize - currentSum;
            const absoluteMax = totalSlicesForSize - (flavorCount - 1) * 2;
            const max = Math.min(currentValue + remainingSpace, absoluteMax);

            return (
              <div
                key={flavor.id}
                className="p-4 rounded-xl border border-brand-mediumGray bg-brand-bg/30 space-y-3 hover:border-brand-mediumGray/75 transition-colors"
              >
                {/* Nome do sabor e fatia atual */}
                <div className="flex items-center justify-between">
                  <span className="font-serif font-bold text-sm text-white">
                    {flavor.name}
                  </span>
                  <span className="text-xxs font-sans font-bold text-brand-red">
                    🍕 {currentValue} fatias
                  </span>
                </div>

                {/* Slider de Passos */}
                <StepSlider
                  value={currentValue}
                  min={min}
                  max={max}
                  onChange={(newVal) => onChangeSlices(idx, newVal)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
