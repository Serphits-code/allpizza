"use client";

import React from "react";
import { motion } from "framer-motion";

export type StepType = "size" | "flavors" | "toppings" | "drinks";

interface StepIndicatorProps {
  currentStep: StepType;
  onStepClick: (step: StepType) => void;
  toppingsCount?: number;
  drinksCount?: number;
  canNavigateFlavors?: boolean;
  canNavigateToppings?: boolean;
  canNavigateDrinks?: boolean;
}

interface StepItem {
  id: StepType;
  label: string;
  shortLabel: string;
  icon: string;
}

const STEPS: StepItem[] = [
  { id: "size", label: "1. Tamanho", shortLabel: "Tamanho", icon: "📏" },
  { id: "flavors", label: "2. Sabores", shortLabel: "Sabores", icon: "🍕" },
  { id: "toppings", label: "3. Adicionais", shortLabel: "Adicionais", icon: "✨" },
  { id: "drinks", label: "4. Bebidas", shortLabel: "Bebidas", icon: "🥤" },
];

export default function StepIndicator({
  currentStep,
  onStepClick,
  toppingsCount = 0,
  drinksCount = 0,
  canNavigateFlavors = true,
  canNavigateToppings = true,
  canNavigateDrinks = true,
}: StepIndicatorProps) {
  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const getStepStatus = (index: number) => {
    if (index < stepIndex) return "completed";
    if (index === stepIndex) return "active";
    return "upcoming";
  };

  const handleClick = (step: StepItem) => {
    if (step.id === "flavors" && !canNavigateFlavors) {
      onStepClick("flavors");
      return;
    }
    if (step.id === "toppings" && !canNavigateToppings) {
      onStepClick("toppings");
      return;
    }
    if (step.id === "drinks" && !canNavigateDrinks) {
      onStepClick("drinks");
      return;
    }
    onStepClick(step.id);
  };

  const getProgressWidth = () => {
    if (stepIndex === 0) return "0%";
    if (stepIndex === 1) return "33%";
    if (stepIndex === 2) return "66%";
    return "calc(100% - 40px)";
  };

  return (
    <div className="w-full max-w-xl mx-auto px-2 sm:px-4 py-2 select-none">
      <div className="relative flex items-center justify-between">
        {/* Linha de Conexão Horizontal de Fundo */}
        <div className="absolute left-5 right-5 top-5 h-[2.5px] -translate-y-1/2 bg-neutral-800 rounded-full z-0" />

        {/* Linha de Conexão Horizontal Ativa/Progresso */}
        <motion.div
          className="absolute left-5 top-5 h-[2.5px] -translate-y-1/2 bg-gradient-to-r from-brand-red to-brand-redHover rounded-full z-0 shadow-sm shadow-brand-red/50"
          initial={false}
          animate={{ width: getProgressWidth() }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        />

        {/* Círculos e Rótulos dos Passos */}
        {STEPS.map((step, index) => {
          const status = getStepStatus(index);
          const isActive = status === "active";
          const isCompleted = status === "completed";

          return (
            <div
              key={step.id}
              className="relative z-10 flex flex-col items-center cursor-pointer group"
              onClick={() => handleClick(step)}
            >
              {/* Círculo do Passo */}
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs sm:text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-brand-red text-white ring-4 ring-brand-red/25 border-2 border-white/20 shadow-lg shadow-brand-red/30 font-bold"
                    : isCompleted
                    ? "bg-neutral-800 border-2 border-emerald-500/80 text-emerald-400 font-bold shadow-md"
                    : "bg-neutral-900/90 border-2 border-neutral-700/60 text-neutral-400 group-hover:border-neutral-600 group-hover:text-neutral-300"
                }`}
              >
                {/* Ícone */}
                <span className="text-sm sm:text-base leading-none">
                  {isCompleted ? "✓" : step.icon}
                </span>

                {/* Badges */}
                {step.id === "toppings" && toppingsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-gold text-black text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-black ring-2 ring-neutral-900">
                    {toppingsCount}
                  </span>
                )}
                {step.id === "drinks" && drinksCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-red text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-black ring-2 ring-neutral-900">
                    {drinksCount}
                  </span>
                )}
              </motion.div>

              {/* Rótulo abaixo do círculo */}
              <span
                className={`mt-1.5 text-[10px] sm:text-xs font-semibold tracking-tight sm:tracking-wide transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-white font-bold"
                    : isCompleted
                    ? "text-neutral-300 group-hover:text-white"
                    : "text-neutral-500 group-hover:text-neutral-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
