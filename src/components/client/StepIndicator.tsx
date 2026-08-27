"use client";

import React from "react";
import { motion } from "framer-motion";

export type StepType = "pizza" | "toppings" | "drinks";

interface StepIndicatorProps {
  currentStep: StepType;
  onStepClick: (step: StepType) => void;
  toppingsCount?: number;
  drinksCount?: number;
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
  { id: "pizza", label: "1. Sabores", shortLabel: "Sabores", icon: "🍕" },
  { id: "toppings", label: "2. Adicionais", shortLabel: "Adicionais", icon: "✨" },
  { id: "drinks", label: "3. Bebidas", shortLabel: "Bebidas", icon: "🥤" },
];

export default function StepIndicator({
  currentStep,
  onStepClick,
  toppingsCount = 0,
  drinksCount = 0,
  canNavigateToppings = true,
  canNavigateDrinks = true,
}: StepIndicatorProps) {
  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const getStepStatus = (index: number) => {
    if (index < stepIndex) return "completed";
    if (index === stepIndex) return "active";
    return "upcoming";
  };

  const handleClick = (step: StepItem, index: number) => {
    if (step.id === "toppings" && !canNavigateToppings) {
      onStepClick("toppings"); // triggers validation alert in parent
      return;
    }
    if (step.id === "drinks" && !canNavigateDrinks) {
      onStepClick("drinks"); // triggers validation alert in parent
      return;
    }
    onStepClick(step.id);
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-2 select-none">
      <div className="relative flex items-center justify-between">
        {/* Linha de Conexão Horizontal de Fundo */}
        <div className="absolute left-6 right-6 top-5 h-[2.5px] -translate-y-1/2 bg-neutral-800 rounded-full z-0" />

        {/* Linha de Conexão Horizontal Ativa/Progresso */}
        <motion.div
          className="absolute left-6 top-5 h-[2.5px] -translate-y-1/2 bg-gradient-to-r from-brand-red to-brand-redHover rounded-full z-0 shadow-sm shadow-brand-red/50"
          initial={false}
          animate={{
            width:
              stepIndex === 0
                ? "0%"
                : stepIndex === 1
                ? "50%"
                : "calc(100% - 48px)",
          }}
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
              onClick={() => handleClick(step, index)}
            >
              {/* Círculo do Passo */}
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-brand-red text-white ring-4 ring-brand-red/25 border-2 border-white/20 shadow-lg shadow-brand-red/30 font-bold"
                    : isCompleted
                    ? "bg-neutral-800 border-2 border-emerald-500/80 text-emerald-400 font-bold shadow-md"
                    : "bg-neutral-900/90 border-2 border-neutral-700/60 text-neutral-400 group-hover:border-neutral-600 group-hover:text-neutral-300"
                }`}
              >
                {/* Ícone */}
                <span className="text-base sm:text-lg leading-none">
                  {isCompleted ? "✓" : step.icon}
                </span>

                {/* Badge de Adicionais / Bebidas */}
                {step.id === "toppings" && toppingsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-gold text-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black ring-2 ring-neutral-900">
                    {toppingsCount}
                  </span>
                )}
                {step.id === "drinks" && drinksCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-red text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black ring-2 ring-neutral-900">
                    {drinksCount}
                  </span>
                )}
              </motion.div>

              {/* Rótulo abaixo do círculo */}
              <span
                className={`mt-2 text-[11px] sm:text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
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
