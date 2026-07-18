"use client";

import React from "react";

interface StepSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}

export default function StepSlider({ value, min, max, onChange }: StepSliderProps) {
  // Se min e max forem iguais (ex: M com 3 sabores onde a única possibilidade é 2 fatias por sabor)
  // o slider estará travado
  const isLocked = min >= max;

  // Gerar os passos possíveis de min até max
  const steps = React.useMemo(() => {
    const list = [];
    for (let i = min; i <= max; i++) {
      list.push(i);
    }
    return list;
  }, [min, max]);

  const handleDecrement = () => {
    if (!isLocked && value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (!isLocked && value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className="flex items-center space-x-4 w-full select-none">
      {/* Botão Decremento (-) */}
      <button
        type="button"
        disabled={isLocked || value <= min}
        onClick={handleDecrement}
        className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm transition-all ${
          isLocked || value <= min
            ? "border-brand-mediumGray/20 text-brand-lightGray/30 cursor-not-allowed"
            : "border-brand-mediumGray bg-brand-bg hover:border-brand-red hover:text-brand-red text-brand-lightGray cursor-pointer"
        }`}
      >
        -
      </button>

      {/* Track & Steps Container */}
      <div className="relative flex-grow flex items-center h-8">
        {/* Linha de fundo (track) */}
        <div className="absolute left-2.5 right-2.5 h-[3px] bg-brand-mediumGray/30 rounded-full" />

        {/* Linha de progresso ativo */}
        {!isLocked && steps.length > 1 && (
          <div
            className="absolute left-2.5 h-[3px] bg-brand-red rounded-full transition-all duration-150"
            style={{
              width: `${((value - min) / (max - min)) * 100}%`,
              right: "10px", // ajuste fino para não ultrapassar o último círculo
            }}
          />
        )}

        {/* Círculos visuais dos passos */}
        <div className="absolute inset-0 flex justify-between items-center px-2 pointer-events-none">
          {steps.map((step) => {
            const isActive = step === value;
            const isPassed = step <= value;

            return (
              <div
                key={step}
                className={`relative w-4.5 h-4.5 rounded-full flex items-center justify-center transition-all ${
                  isLocked
                    ? "bg-brand-mediumGray/20 border border-brand-mediumGray/35"
                    : isActive
                    ? "bg-brand-red ring-4 ring-brand-red/30 border border-white scale-125 z-10"
                    : isPassed
                    ? "bg-brand-red/70 border border-brand-red/90"
                    : "bg-brand-bg border-2 border-brand-mediumGray"
                }`}
              >
                {/* Indicador Numérico sobre o círculo */}
                <span className={`absolute -top-6 text-[10px] font-mono font-bold transition-all ${
                  isActive ? "text-brand-red scale-110" : "text-brand-lightGray/60"
                }`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* Input range invisível posicionado por cima para capturar cliques e arrastes */}
        {!isLocked && (
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 pointer-events-auto px-2"
            style={{
              WebkitAppearance: "none",
              background: "transparent",
            }}
          />
        )}
      </div>

      {/* Botão Incremento (+) */}
      <button
        type="button"
        disabled={isLocked || value >= max}
        onClick={handleIncrement}
        className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm transition-all ${
          isLocked || value >= max
            ? "border-brand-mediumGray/20 text-brand-lightGray/30 cursor-not-allowed"
            : "border-brand-mediumGray bg-brand-bg hover:border-brand-red hover:text-brand-red text-brand-lightGray cursor-pointer"
        }`}
      >
        +
      </button>
    </div>
  );
}
