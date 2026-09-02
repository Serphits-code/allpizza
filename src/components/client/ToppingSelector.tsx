"use client";

import React, { useState } from "react";
import { ToppingInput, SelectedToppingItem, calcSingleToppingPrice } from "@/lib/pricing";

export interface ToppingCategory {
  id: string;
  name: string;
  toppings: ToppingInput[];
}

export interface FlavorSelection {
  id: string;
  name: string;
  slices: number;
}

interface ToppingSelectorProps {
  size: string; // P, M, G, GG
  totalSlices: number;
  flavors: FlavorSelection[]; // Sabores ativos com suas fatias
  categories: ToppingCategory[];
  selectedToppings: SelectedToppingItem[];
  onChange: (toppings: SelectedToppingItem[]) => void;
  activeTarget: "FULL" | number;
  onTargetChange: (target: "FULL" | number) => void;
}

const FLAVOR_COLORS = [
  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "bg-rose-500/20 text-rose-300 border-rose-500/40",
];

export default function ToppingSelector({
  size,
  totalSlices,
  flavors,
  categories,
  selectedToppings,
  onChange,
  activeTarget,
  onTargetChange,
}: ToppingSelectorProps) {
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const currentCategory = categories[activeCategoryIndex] || categories[0];

  // Identifica o alvo atual
  const isFullPizza = activeTarget === "FULL";
  const targetFlavor = typeof activeTarget === "number" ? flavors[activeTarget] : null;
  const targetFlavorName = targetFlavor ? targetFlavor.name : undefined;
  const targetSlices = targetFlavor ? targetFlavor.slices : totalSlices;
  const targetType = isFullPizza ? "FULL" : "FLAVOR";

  // Adiciona ou remove um adicional para o alvo atual
  const handleAddTopping = (topping: ToppingInput) => {
    const existingIndex = selectedToppings.findIndex(
      (item) =>
        item.topping.id === topping.id &&
        item.targetType === targetType &&
        item.flavorName === targetFlavorName
    );

    if (existingIndex > -1) {
      // Se já existe no mesmo alvo, incrementa a quantidade se for unidade ou remove se clicar novamente
      const updated = [...selectedToppings];
      if (topping.isUnit) {
        updated[existingIndex].quantity = (updated[existingIndex].quantity || 1) + 1;
      } else {
        // Remove ao alternar
        updated.splice(existingIndex, 1);
      }
      onChange(updated);
    } else {
      // Adiciona novo
      const newItem: SelectedToppingItem = {
        topping,
        targetType,
        flavorName: targetFlavorName,
        slicesCount: targetSlices,
        totalSlices,
        quantity: 1,
      };
      onChange([...selectedToppings, newItem]);
    }
  };

  const handleRemoveTopping = (toppingId: string | undefined, tType: string, fName?: string | null, toppingName?: string) => {
    const updated = selectedToppings.filter(
      (item) =>
        !(
          ((toppingId && item.topping.id === toppingId) || (!toppingId && item.topping.name === toppingName)) &&
          item.targetType === tType &&
          (item.flavorName || null) === (fName || null)
        )
    );
    onChange(updated);
  };

  // Filtra adicionais por busca
  const filteredToppings = currentCategory?.toppings.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Indicador sutil do alvo atual */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-neutral-300">
            Adicionando em:{" "}
            <strong className="text-emerald-400 font-bold">
              {isFullPizza
                ? `Pizza Inteira (${totalSlices} fatias)`
                : `Sabor ${targetFlavorName} (${targetSlices}/${totalSlices} fatias)`}
            </strong>
          </span>
        </div>

        {/* Botão de atalho rápido para Pizza Inteira */}
        {!isFullPizza && (
          <button
            type="button"
            onClick={() => onTargetChange("FULL")}
            className="text-xxs font-bold text-brand-gold hover:underline self-start sm:self-auto cursor-pointer"
          >
            🍕 Mudar para Pizza Inteira
          </button>
        )}
      </div>

      {/* ABAS DE CATEGORIAS DE ADICIONAIS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Selecione o adicional:
          </span>

          {/* Campo de Busca Rápida */}
          <input
            type="text"
            placeholder="Buscar adicional..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-brand-red w-36 sm:w-48"
          />
        </div>

        {/* Abas */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat, idx) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setActiveCategoryIndex(idx)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                activeCategoryIndex === idx
                  ? "bg-brand-red text-white shadow-md shadow-brand-red/20"
                  : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-700"
              }`}
            >
              {cat.name} ({cat.toppings.length})
            </button>
          ))}
        </div>
      </div>

      {/* 3. GRID DE ADICIONAIS DA CATEGORIA SELECIONADA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
        {filteredToppings.map((topping) => {
          // Preço calculado para o alvo e tamanho atual
          const unitPrice = calcSingleToppingPrice(topping, size, targetSlices, totalSlices, 1);

          // Verifica se este adicional já está ativo no alvo atual
          const selectedItem = selectedToppings.find(
            (item) =>
              item.topping.id === topping.id &&
              item.targetType === targetType &&
              item.flavorName === targetFlavorName
          );

          const isAdded = !!selectedItem;
          const qty = selectedItem?.quantity || 0;

          return (
            <div
              key={topping.id}
              onClick={() => handleAddTopping(topping)}
              className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between select-none ${
                isAdded
                  ? "bg-brand-red/10 border-brand-red text-white"
                  : "bg-neutral-900/60 border-neutral-800/80 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
              }`}
            >
              <div>
                <span className="text-xs font-bold block line-clamp-1">{topping.name}</span>
                <span className="text-[11px] text-brand-gold font-semibold mt-1 block">
                  + R$ {unitPrice.toFixed(2).replace(".", ",")}
                  {!topping.isUnit && !isFullPizza && (
                    <span className="text-[10px] text-neutral-400 font-normal block">
                      ({targetSlices}/{totalSlices} fatias)
                    </span>
                  )}
                  {topping.isUnit && (
                    <span className="text-[10px] text-emerald-400 font-normal block">(Unidade)</span>
                  )}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-neutral-800/50">
                <span className="text-[10px] text-neutral-400">
                  {topping.isUnit ? "Por unidade" : isFullPizza ? "Inteira" : `${targetSlices} fatias`}
                </span>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isAdded ? "bg-brand-red text-white" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {topping.isUnit && qty > 0 ? qty : isAdded ? "✓" : "+"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. RESUMO DOS ADICIONAIS SELECIONADOS */}
      {selectedToppings.length > 0 && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <span>✨</span> Adicionais Selecionados ({selectedToppings.length})
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-rose-400 hover:underline"
            >
              Limpar todos
            </button>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {selectedToppings.map((item, index) => {
              const itemPrice = calcSingleToppingPrice(
                item.topping,
                size,
                item.slicesCount,
                item.totalSlices,
                item.quantity || 1
              );

              return (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/60"
                >
                  <div>
                    <span className="font-semibold text-white">{item.topping.name}</span>
                    <span className="text-[11px] text-neutral-400 ml-2">
                      [{item.targetType === "FULL" ? "Pizza Inteira" : item.flavorName}]
                      {item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-brand-gold">
                      R$ {itemPrice.toFixed(2).replace(".", ",")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemoveTopping(item.topping.id, item.targetType, item.flavorName)
                      }
                      className="text-neutral-500 hover:text-rose-400 p-1"
                      title="Remover adicional"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
