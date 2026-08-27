"use client";

import React, { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/stores/cartStore";
import {
  calcPizzaItemTotal,
  calcSingleToppingPrice,
  FlavorInput,
  CrustInput,
  SelectedToppingItem,
} from "@/lib/pricing";
import { getOptimizedImageUrl } from "@/lib/imageHelper";
import PizzaSvg from "./PizzaSvg";
import FlavorDistribution from "./FlavorDistribution";
import StepIndicator, { StepType } from "./StepIndicator";
import type { ToppingCategory } from "./ToppingSelector";

const ToppingSelector = dynamic(() => import("./ToppingSelector"), {
  loading: () => (
    <div className="py-12 text-center text-xs text-brand-lightGray animate-pulse flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
      <span>Carregando adicionais...</span>
    </div>
  ),
});

interface PizzaFlavor {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: {
    name: string;
    priceP: number;
    priceM: number;
    priceG: number;
    priceGG: number;
  };
}

interface CrustType {
  id: string;
  name: string;
  pricePM: number;
  priceGGG: number;
  caracol: boolean;
}

interface StandardProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

interface StandardCategory {
  id: string;
  name: string;
  products: StandardProduct[];
}

interface PizzaBuilderProps {
  flavors: PizzaFlavor[];
  crusts: CrustType[];
  standardCategories: StandardCategory[];
  toppingCategories?: ToppingCategory[];
}

export default function PizzaBuilder({
  flavors,
  crusts,
  standardCategories,
  toppingCategories = [],
}: PizzaBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((state) => state.addItem);

  // Estados do fluxo multi-etapa: "pizza" | "toppings" | "drinks"
  const [step, setStep] = useState<StepType>("pizza");
  const [toppingTarget, setToppingTarget] = useState<"FULL" | number>("FULL");
  const [selectedToppings, setSelectedToppings] = useState<SelectedToppingItem[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<{ [productId: string]: number }>({});

  // Estados de Configuração da Pizza
  const [size, setSize] = useState<string>("G"); // P, M, G, GG
  const [flavorCount, setFlavorCount] = useState<number>(2); // Padrão 2 sabores (ou 1)
  const [selectedFlavors, setSelectedFlavors] = useState<(PizzaFlavor | null)[]>([null, null, null]);
  const [selectedCrust, setSelectedCrust] = useState<CrustType | null>(null);
  const [caracolRequested, setCaracolRequested] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  // Contagem de adicionais por setor da pizza
  const toppingsCountBySector = useMemo(() => {
    const counts: { [sectorIdx: number]: number } = {};
    const activeFlavorsList = selectedFlavors.slice(0, flavorCount);
    selectedToppings.forEach((item) => {
      if (item.targetType === "FLAVOR" && item.flavorName) {
        const sectorIdx = activeFlavorsList.findIndex((f) => f?.name === item.flavorName);
        if (sectorIdx > -1) {
          counts[sectorIdx] = (counts[sectorIdx] || 0) + (item.quantity || 1);
        }
      }
    });
    return counts;
  }, [selectedToppings, selectedFlavors, flavorCount]);

  // Estado da Distribuição Dinâmica de Fatias
  const [slicesDistribution, setSlicesDistribution] = useState<number[]>([]);

  // Helpers de Fatias Padrão
  const getDefaultSlices = (s: string, count: number): number[] => {
    const total = s === "P" ? 4 : s === "M" ? 6 : s === "G" ? 8 : 10;
    if (count === 1) return [total];
    if (count === 2) {
      const half = Math.floor(total / 2);
      return [half, total - half];
    }
    // count === 3
    if (total === 6) return [2, 2, 2];
    if (total === 8) return [3, 3, 2];
    return [4, 3, 3]; // total === 10
  };

  // Sincroniza e reseta a distribuição quando o tamanho ou a quantidade de sabores muda
  useEffect(() => {
    setSlicesDistribution(getDefaultSlices(size, flavorCount));
  }, [size, flavorCount]);

  // Se o tamanho for P, a quantidade máxima de sabores é 2
  useEffect(() => {
    if (size === "P" && flavorCount === 3) {
      setFlavorCount(2);
    }
  }, [size, flavorCount]);

  // Estado do Bottom Sheet de Seleção de Sabores
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("ALL");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Pré-selecionar o sabor se vier por Query Parameter
  useEffect(() => {
    const preselectedId = searchParams.get("flavorId");
    if (preselectedId) {
      const found = flavors.find((f) => f.id === preselectedId);
      if (found) {
        setSelectedFlavors([found, null, null]);
      }
    }
  }, [searchParams, flavors]);

  // Se o número de sabores diminuir, limpamos os excedentes
  useEffect(() => {
    setSelectedFlavors((prev) => {
      const copy = [...prev];
      if (flavorCount < 3) copy[2] = null;
      if (flavorCount < 2) copy[1] = null;
      return copy;
    });
  }, [flavorCount]);

  // Se o tipo de borda não suportar caracol, limpamos a solicitação
  useEffect(() => {
    if (selectedCrust && !selectedCrust.caracol) {
      setCaracolRequested(false);
    }
  }, [selectedCrust]);

  // Categorias únicas de sabores
  const flavorCategories = useMemo(() => {
    const set = new Set<string>();
    flavors.forEach((f) => set.add(f.category.name));
    return Array.from(set);
  }, [flavors]);

  // Filtragem de sabores
  const filteredFlavors = useMemo(() => {
    return flavors.filter((f) => {
      const matchesCategory =
        selectedCategoryTab === "ALL" || f.category.name === selectedCategoryTab;
      const matchesSearch =
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [flavors, selectedCategoryTab, searchQuery]);

  // Mapeamento dos sabores selecionados para a função de precificação
  const pricingFlavorsInput: FlavorInput[] = useMemo(() => {
    return selectedFlavors
      .slice(0, flavorCount)
      .filter((f): f is PizzaFlavor => f !== null)
      .map((f) => ({
        name: f.name,
        category: {
          priceP: f.category.priceP,
          priceM: f.category.priceM,
          priceG: f.category.priceG,
          priceGG: f.category.priceGG,
        },
      }));
  }, [selectedFlavors, flavorCount]);

  // Mapeamento da borda para a função de precificação
  const pricingCrustInput: CrustInput | undefined = useMemo(() => {
    if (!selectedCrust) return undefined;
    return {
      name: selectedCrust.name,
      pricePM: selectedCrust.pricePM,
      priceGGG: selectedCrust.priceGGG,
      caracol: selectedCrust.caracol,
    };
  }, [selectedCrust]);

  // Preço Total Calculado em Tempo Real
  const currentTotal = useMemo(() => {
    if (pricingFlavorsInput.length === 0) return 0;
    return calcPizzaItemTotal(size, pricingFlavorsInput, pricingCrustInput, caracolRequested);
  }, [size, pricingFlavorsInput, pricingCrustInput, caracolRequested]);

  // Abre a planilha de seleção para um determinado setor
  const handleOpenSheet = (index: number) => {
    setActiveSectorIndex(index);
    setIsSheetOpen(true);
  };

  // Seleciona um sabor e avança suavemente para o próximo setor vazio se houver, ou fecha ao completar
  const handleSelectFlavor = (flavor: PizzaFlavor) => {
    if (activeSectorIndex !== null) {
      const newFlavors = [...selectedFlavors];
      newFlavors[activeSectorIndex] = flavor;
      setSelectedFlavors(newFlavors);

      // Se ainda houver algum setor vazio, avança automaticamente para ele
      let nextEmptyIndex = -1;
      for (let i = 0; i < flavorCount; i++) {
        if (i !== activeSectorIndex && !newFlavors[i]) {
          nextEmptyIndex = i;
          break;
        }
      }

      if (nextEmptyIndex !== -1) {
        setActiveSectorIndex(nextEmptyIndex);
      } else {
        // Todos os sabores estão preenchidos! Fecha o modal automaticamente com breve delay para visualização
        setTimeout(() => {
          setIsSheetOpen(false);
          setActiveSectorIndex(null);
          setSearchQuery("");
        }, 300);
      }
    }
  };

  // Validação para avançar para a etapa 2: Adicionais Extra
  const canProceedToToppings = useMemo(() => {
    return selectedFlavors.slice(0, flavorCount).every(Boolean);
  }, [selectedFlavors, flavorCount]);

  const handleProceedToToppings = () => {
    for (let i = 0; i < flavorCount; i++) {
      if (!selectedFlavors[i]) {
        alert(
          `Por favor, selecione o sabor para o ${
            flavorCount === 2
              ? i === 0
                ? "primeiro lado (Metade Esquerda)"
                : "segundo lado (Metade Direita)"
              : `Sabor ${i + 1}`
          }.`
        );
        handleOpenSheet(i);
        return;
      }
    }

    const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
    const isDynamic = size !== "P" && flavorCount > 1;
    const currentSum = slicesDistribution.reduce((a, b) => a + b, 0);

    if (isDynamic && currentSum !== totalSlices) {
      alert(
        `Por favor, ajuste a distribuição das fatias. Atualmente possui ${currentSum} de ${totalSlices} fatias distribuídas.`
      );
      return;
    }

    setStep("toppings");
  };

  // Avançar para a etapa 3: Bebidas & Acompanhamentos
  const handleProceedToDrinks = () => {
    setStep("drinks");
  };

  // Atualizar quantidade de bebidas
  const handleUpdateDrinkQty = (productId: string, newQty: number) => {
    if (newQty < 0) return;
    setSelectedDrinks((prev) => ({
      ...prev,
      [productId]: newQty,
    }));
  };

  // Calcular total de bebidas
  const drinksTotal = useMemo(() => {
    let total = 0;
    Object.entries(selectedDrinks).forEach(([productId, qty]) => {
      if (qty > 0) {
        let foundProduct: StandardProduct | undefined = undefined;
        for (const cat of standardCategories) {
          const prod = cat.products.find((p) => p.id === productId);
          if (prod) {
            foundProduct = prod;
            break;
          }
        }
        if (foundProduct) {
          total += foundProduct.price * qty;
        }
      }
    });
    return total;
  }, [selectedDrinks, standardCategories]);

  // Contagem de bebidas adicionadas
  const drinksCount = useMemo(() => {
    return Object.values(selectedDrinks).reduce((a, b) => a + b, 0);
  }, [selectedDrinks]);

  // Total Geral (Pizza + Bebidas)
  const grandTotal = currentTotal + drinksTotal;

  // Confirmar tudo e ir para o carrinho
  const handleConfirmAll = () => {
    const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
    const isDynamic = size !== "P" && flavorCount > 1;
    const activeFlavors = selectedFlavors
      .slice(0, flavorCount)
      .filter((f): f is PizzaFlavor => f !== null);

    let displayName = "";
    if (isDynamic) {
      const slicesDesc = activeFlavors
        .map((f, idx) => `${slicesDistribution[idx]} fatias ${f.name}`)
        .join(" / ");
      displayName = `Pizza Customizada ${size} (${slicesDesc})`;
    } else if (size === "P" && flavorCount === 2) {
      const slicesDesc = activeFlavors.map((f) => `2 fatias ${f.name}`).join(" / ");
      displayName = `Pizza Customizada P (${slicesDesc})`;
    } else {
      displayName = `Pizza Customizada ${size} (${activeFlavors[0]?.name || "Sabores"})`;
    }

    // 1. Adicionar pizza ao carrinho
    addItem({
      name: displayName,
      isPizza: true,
      quantity: 1,
      price: currentTotal,
      pizzaSize: size,
      flavors: activeFlavors.map((f, idx) => ({
        name: isDynamic
          ? `${slicesDistribution[idx]} fatias ${f.name}`
          : size === "P" && flavorCount === 2
          ? `2 fatias ${f.name}`
          : f.name,
        categoryName: f.category.name,
        slices: isDynamic
          ? slicesDistribution[idx]
          : size === "P" && flavorCount === 2
          ? 2
          : totalSlices,
      })),
      crustType: selectedCrust?.name || "Tradicional",
      crustPrice: selectedCrust
        ? size === "P" || size === "M"
          ? selectedCrust.pricePM
          : selectedCrust.priceGGG
        : 0,
      caracolRequested,
      toppings: selectedToppings.map((t) => ({
        toppingId: t.topping.id,
        toppingName: t.topping.name,
        targetType: t.targetType,
        flavorName: t.flavorName,
        slicesCount: t.slicesCount,
        totalSlices: t.totalSlices,
        price: calcSingleToppingPrice(
          t.topping,
          size,
          t.slicesCount,
          t.totalSlices,
          t.quantity || 1
        ),
        quantity: t.quantity || 1,
      })),
      notes,
    });

    // 2. Adicionar bebidas selecionadas ao carrinho
    Object.entries(selectedDrinks).forEach(([productId, qty]) => {
      if (qty > 0) {
        let foundProduct: StandardProduct | undefined = undefined;
        for (const cat of standardCategories) {
          const prod = cat.products.find((p) => p.id === productId);
          if (prod) {
            foundProduct = prod;
            break;
          }
        }
        if (foundProduct) {
          addItem({
            name: foundProduct.name,
            isPizza: false,
            quantity: qty,
            price: foundProduct.price,
            productId: foundProduct.id,
          });
        }
      }
    });

    router.push("/carrinho");
  };

  // Helper para o nome do setor ativo
  const getSectorLabel = (idx: number | null) => {
    if (idx === null) return "";
    if (flavorCount === 1) return "PIZZA INTEIRA";
    if (flavorCount === 2) return idx === 0 ? "METADE ESQUERDA" : "METADE DIREITA";
    return `SABOR ${idx + 1}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-6 py-3 sm:py-6 relative pb-28">
      {/* 1. SEÇÃO DO TOPO (STEPPER + SELETOR DE SABORES) - DESMONTA COM SUAVE FADE QUANDO O MODAL ABRE */}
      <AnimatePresence>
        {!isSheetOpen && (
          <motion.div
            key="top-header-section"
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Stepper Horizontal */}
            <div className="mb-4 sm:mb-6">
              <StepIndicator
                currentStep={step}
                onStepClick={(targetStep) => {
                  if (targetStep === "toppings") {
                    handleProceedToToppings();
                  } else if (targetStep === "drinks") {
                    if (canProceedToToppings) {
                      setStep("drinks");
                    } else {
                      handleProceedToToppings();
                    }
                  } else {
                    setStep("pizza");
                  }
                }}
                toppingsCount={selectedToppings.length}
                drinksCount={drinksCount}
                canNavigateToppings={canProceedToToppings}
                canNavigateDrinks={canProceedToToppings}
              />
            </div>

            {/* Seletor de Quantidade de Sabores */}
            {step === "pizza" && (
              <div className="flex flex-col items-center justify-center mb-3 sm:mb-5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 mb-1.5 uppercase">
                  Selecione a quantidade de sabores
                </span>
                <div className="inline-flex items-center bg-neutral-900/90 border border-neutral-800 p-1 rounded-full shadow-lg gap-1">
                  {[1, 2, 3].map((count) => {
                    const isDisabled = count === 3 && size === "P";
                    const isActive = flavorCount === count;

                    return (
                      <button
                        key={count}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && setFlavorCount(count)}
                        className={`px-4 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                          isActive
                            ? "bg-neutral-800 text-white shadow-md ring-1 ring-white/10"
                            : isDisabled
                            ? "text-neutral-600 opacity-40 cursor-not-allowed"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        {count} {count === 1 ? "Sabor" : "Sabores"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. VISUALIZAÇÃO DINÂMICA DA PIZZA (GANHA DESTAQUE E AMPLIAÇÃO NO TOPO QUANDO O MODAL ABRE) */}
      <motion.div
        layout
        animate={{
          y: isSheetOpen ? 8 : 0,
          scale: isSheetOpen ? 1.08 : 1,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 280 }}
        className="relative z-50 pointer-events-auto flex flex-col items-center justify-center mb-4 sm:mb-6 origin-center"
      >
        <div className="relative flex items-center justify-center">
          <PizzaSvg
            size={size}
            flavorCount={flavorCount}
            selectedFlavors={selectedFlavors}
            slicesDistribution={slicesDistribution}
            onSectorClick={
              step === "pizza"
                ? handleOpenSheet
                : (idx) => setToppingTarget(idx)
            }
            activeSectorIndex={
              step === "pizza"
                ? activeSectorIndex
                : typeof toppingTarget === "number"
                ? toppingTarget
                : null
            }
            isFullPizzaSelected={step === "toppings" && toppingTarget === "FULL"}
            toppingsCountBySector={toppingsCountBySector}
          />
        </div>

        {/* Dica interativa abaixo do disco */}
        <AnimatePresence>
          {!isSheetOpen && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-xxs sm:text-xs text-neutral-400 text-center max-w-xs"
            >
              {step === "pizza"
                ? "Toque nos botões ou fatias da pizza para escolher o sabor"
                : "Toque nas fatias da pizza para selecionar onde aplicar adicionais"}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 3. CONTEÚDO DAS ETAPAS - DESCONSTRÓI QUANDO O MODAL ABRE E REMONTA AO FECHAR */}
      {/* ETAPA 1: CONFIGURAÇÃO DE TAMANHO, BORDAS & OBSERVAÇÕES */}
      <AnimatePresence>
        {!isSheetOpen && step === "pizza" && (
          <motion.div
            key="pizza-config-panel"
            initial={{ opacity: 0, y: 30, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 30, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="space-y-6 max-w-2xl mx-auto rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 sm:p-7 shadow-2xl backdrop-blur overflow-hidden"
          >
            {/* Seletor de Tamanhos */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-lightGray">
                Tamanho da Pizza
              </label>
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {[
                  { size: "P", desc: "4 fatias" },
                  { size: "M", desc: "6 fatias" },
                  { size: "G", desc: "8 fatias" },
                  { size: "GG", desc: "10 fatias" },
                ].map((s) => {
                  const isSelected = size === s.size;
                  return (
                    <button
                      key={s.size}
                      type="button"
                      onClick={() => setSize(s.size)}
                      className={`flex flex-col items-center justify-center rounded-2xl py-2.5 sm:py-3 border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-brand-red/15 border-brand-red text-brand-red ring-1 ring-brand-red/30 shadow-md"
                          : "bg-brand-bg border-brand-mediumGray text-brand-lightGray hover:text-white hover:border-neutral-700"
                      }`}
                    >
                      <span className="text-sm sm:text-base font-bold">{s.size}</span>
                      <span className="text-[10px] sm:text-xxs opacity-70">{s.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Distribuição Dinâmica de Fatias (quando aplicável) */}
            <FlavorDistribution
              size={size}
              flavorCount={flavorCount}
              selectedFlavors={selectedFlavors}
              slicesDistribution={slicesDistribution}
              onChangeSlices={(idx, newVal) => {
                setSlicesDistribution((prev) => {
                  const copy = [...prev];
                  copy[idx] = newVal;
                  return copy;
                });
              }}
            />

            {/* Seletor de Bordas Recheadas */}
            <div className="space-y-3 border-t border-brand-mediumGray/50 pt-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-lightGray">
                Borda Recheada
              </label>
              <select
                value={selectedCrust?.id || ""}
                onChange={(e) => {
                  const found = crusts.find((c) => c.id === e.target.value);
                  setSelectedCrust(found || null);
                }}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs sm:text-sm text-white focus:border-brand-red focus:outline-none transition-colors"
              >
                <option value="">Sem borda recheada (Tradicional)</option>
                {crusts.map((crust) => (
                  <option key={crust.id} value={crust.id}>
                    {crust.name} (+R${" "}
                    {size === "P" || size === "M"
                      ? crust.pricePM.toFixed(2)
                      : crust.priceGGG.toFixed(2)}
                    )
                  </option>
                ))}
              </select>

              {/* Adicional de Borda Caracol */}
              {selectedCrust && selectedCrust.caracol && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-brand-bg border border-brand-mediumGray">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white block">Opção Caracol</span>
                    <span className="text-xxs text-brand-lightGray block">
                      Preparo em espiral com recheio extra (+ R$ 5,00)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={caracolRequested}
                    onChange={(e) => setCaracolRequested(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-red focus:ring-brand-red bg-brand-darkGray border-brand-mediumGray cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Campo de Observações */}
            <div className="space-y-2 border-t border-brand-mediumGray/50 pt-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-lightGray">
                Observações do Pedido
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Sem cebola, massa bem assada, etc."
                rows={2}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:border-brand-red focus:outline-none transition-colors"
              />
            </div>

            {/* Painel de Preço & Avançar */}
            <div className="border-t border-brand-mediumGray/50 pt-5 flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-brand-lightGray block">
                  Subtotal da Pizza
                </span>
                <div className="text-xl sm:text-2xl font-bold font-mono text-brand-red">
                  R$ {currentTotal.toFixed(2)}
                </div>
              </div>

              <button
                type="button"
                onClick={handleProceedToToppings}
                className="rounded-2xl bg-brand-red hover:bg-brand-redHover px-6 py-3.5 font-bold text-xs sm:text-sm text-white transition-all cursor-pointer shadow-lg shadow-brand-red/25 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Avançar (Adicionais)</span>
                <span>→</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ETAPA 2: ADICIONAIS EXTRA ("QUE TAL TURBINAR SUA PIZZA?") */}
      {step === "toppings" && (
        <div className="space-y-6 max-w-2xl mx-auto rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 sm:p-7 shadow-2xl backdrop-blur">
          {/* Mensagem Chamativa Requisitada */}
          <div className="text-center space-y-1.5 border-b border-brand-mediumGray/40 pb-4">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-white flex items-center justify-center gap-2">
              <span>✨</span> Que tal turbinar sua pizza?
            </h2>
            <p className="text-xs sm:text-sm text-brand-gold font-medium">
              Selecione adicionais para deixar sua pizza ainda mais irresistível!
            </p>
          </div>

          {/* Orientação para seleção de parte da pizza */}
          <div className="space-y-3">
            <span className="block text-xs font-bold uppercase tracking-wider text-neutral-300">
              Selecione a parte da pizza que deseja colocar adicional:
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setToppingTarget("FULL")}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  toppingTarget === "FULL"
                    ? "bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/50"
                    : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    toppingTarget === "FULL" ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"
                  }`}
                />
                <span>🍕 Pizza Inteira</span>
              </button>

              {selectedFlavors.slice(0, flavorCount).map((flavor, idx) => {
                if (!flavor) return null;
                const isSelected = toppingTarget === idx;
                const sectorLabel =
                  flavorCount === 2
                    ? idx === 0
                      ? "Metade Esquerda"
                      : "Metade Direita"
                    : `Sabor ${idx + 1}`;

                return (
                  <button
                    key={flavor.id + idx}
                    type="button"
                    onClick={() => setToppingTarget(idx)}
                    className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/50"
                        : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"
                      }`}
                    />
                    <span>
                      {sectorLabel} ({flavor.name})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Componente ToppingSelector com Adicionais */}
          <ToppingSelector
            size={size}
            totalSlices={size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10}
            flavors={selectedFlavors
              .slice(0, flavorCount)
              .filter((f): f is PizzaFlavor => f !== null)
              .map((f, idx) => ({
                id: f.id,
                name: f.name,
                slices:
                  size === "P" && flavorCount === 2
                    ? 2
                    : slicesDistribution[idx] || 0,
              }))}
            categories={toppingCategories}
            selectedToppings={selectedToppings}
            onChange={setSelectedToppings}
            activeTarget={toppingTarget}
            onTargetChange={setToppingTarget}
          />

          {/* Ações de Navegação */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-brand-mediumGray/50 pt-5 gap-3">
            <button
              type="button"
              onClick={() => setStep("pizza")}
              className="w-full sm:w-auto rounded-2xl border border-brand-mediumGray bg-brand-bg hover:bg-brand-mediumGray px-5 py-3 font-semibold text-xs sm:text-sm text-brand-lightGray hover:text-white transition-colors cursor-pointer text-center"
            >
              ← Voltar para Sabores
            </button>

            <button
              type="button"
              onClick={handleProceedToDrinks}
              className="w-full sm:w-auto rounded-2xl bg-brand-red hover:bg-brand-redHover px-6 py-3.5 font-bold text-xs sm:text-sm text-white transition-all cursor-pointer text-center shadow-lg shadow-brand-red/20"
            >
              Avançar (Bebidas) →
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: BEBIDAS & RESUMO FINAL */}
      {step === "drinks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-5xl mx-auto">
          {/* Listagem de Bebidas */}
          <div className="lg:col-span-8 space-y-6 rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 sm:p-7 shadow-2xl backdrop-blur">
            <div className="space-y-1 border-b border-brand-mediumGray/30 pb-4">
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-white">
                Que tal uma bebida pra acompanhar? 🥤
              </h2>
              <p className="text-xs text-brand-lightGray">
                Adicione bebidas e outros itens para completar o seu pedido.
              </p>
            </div>

            <div className="space-y-6 pt-2">
              {standardCategories.map((cat) => {
                if (cat.products.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-3">
                    <h3 className="font-serif text-base font-bold text-brand-red border-l-4 border-brand-red pl-2.5">
                      {cat.name}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cat.products.map((prod) => {
                        const qty = selectedDrinks[prod.id] || 0;
                        return (
                          <div
                            key={prod.id}
                            className="flex justify-between items-center rounded-2xl border border-brand-mediumGray bg-brand-bg/60 p-3 sm:p-4 transition-all hover:border-brand-red/30 shadow-md"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {prod.imageUrl && (
                                <div className="w-14 h-14 rounded-xl bg-brand-darkGray border border-brand-mediumGray overflow-hidden flex-shrink-0">
                                  <img
                                    src={getOptimizedImageUrl(prod.imageUrl)}
                                    alt={prod.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        "/images/pizza-placeholder.png";
                                    }}
                                  />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                                  {prod.name}
                                </h4>
                                <p className="text-[10px] text-brand-lightGray line-clamp-1 mt-0.5">
                                  {prod.description}
                                </p>
                                <div className="text-xs font-bold text-brand-red font-mono mt-1">
                                  R$ {prod.price.toFixed(2)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 bg-brand-darkGray border border-brand-mediumGray rounded-lg p-1 flex-shrink-0 select-none">
                              <button
                                type="button"
                                onClick={() => handleUpdateDrinkQty(prod.id, qty - 1)}
                                className="w-6 h-6 rounded hover:bg-brand-mediumGray text-white font-bold flex items-center justify-center transition-colors cursor-pointer text-xs"
                              >
                                -
                              </button>
                              <span className="w-5 text-center text-xs font-mono font-bold text-white">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateDrinkQty(prod.id, qty + 1)}
                                className="w-6 h-6 rounded hover:bg-brand-mediumGray text-white font-bold flex items-center justify-center transition-colors cursor-pointer text-xs"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-brand-mediumGray/50 pt-5 gap-3">
              <button
                type="button"
                onClick={() => setStep("toppings")}
                className="w-full sm:w-auto rounded-2xl border border-brand-mediumGray bg-brand-bg hover:bg-brand-mediumGray px-5 py-3 font-semibold text-xs sm:text-sm text-brand-lightGray hover:text-white transition-colors cursor-pointer text-center"
              >
                ← Voltar para Adicionais
              </button>

              <button
                type="button"
                onClick={handleConfirmAll}
                className="w-full sm:w-auto rounded-2xl bg-brand-red hover:bg-brand-redHover px-6 py-3.5 font-bold text-xs sm:text-sm text-white transition-all cursor-pointer text-center shadow-lg shadow-brand-red/20"
              >
                {drinksCount > 0
                  ? "Adicionar itens e ir para o carrinho →"
                  : "Ir para o carrinho →"}
              </button>
            </div>
          </div>

          {/* Resumo do Pedido */}
          <div className="lg:col-span-4 rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 sm:p-6 shadow-2xl backdrop-blur space-y-4">
            <h3 className="font-serif text-lg font-bold text-brand-red border-b border-brand-mediumGray/30 pb-2.5">
              Resumo do Pedido
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-brand-mediumGray/30 pb-2">
                <span className="text-brand-lightGray">Tamanho:</span>
                <span className="font-bold text-white">{size}</span>
              </div>

              <div className="border-b border-brand-mediumGray/30 pb-2">
                <span className="text-brand-lightGray block mb-1">Sabores:</span>
                <ul className="space-y-1 text-white font-medium pl-1">
                  {selectedFlavors.slice(0, flavorCount).map((f, idx) => (
                    <li key={idx} className="truncate">
                      🍕{" "}
                      <span className="font-bold">
                        {size !== "P" && flavorCount > 1
                          ? `${slicesDistribution[idx]}f `
                          : ""}
                      </span>
                      {f?.name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-between border-b border-brand-mediumGray/30 pb-2">
                <span className="text-brand-lightGray">Borda:</span>
                <span className="font-bold text-white">
                  {selectedCrust?.name || "Tradicional"}
                </span>
              </div>

              {selectedToppings.length > 0 && (
                <div className="border-b border-brand-mediumGray/30 pb-2">
                  <span className="text-brand-lightGray block mb-1">
                    Adicionais ({selectedToppings.length}):
                  </span>
                  <ul className="space-y-1 text-emerald-300 font-medium pl-1 text-[11px]">
                    {selectedToppings.map((t, idx) => (
                      <li key={idx} className="truncate">
                        ✨ {t.topping.name} (
                        {t.targetType === "FULL" ? "Inteira" : t.flavorName})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 space-y-1.5">
                <div className="flex justify-between text-brand-lightGray">
                  <span>Pizza:</span>
                  <span className="font-mono text-white">
                    R$ {currentTotal.toFixed(2)}
                  </span>
                </div>
                {drinksTotal > 0 && (
                  <div className="flex justify-between text-brand-lightGray">
                    <span>Bebidas:</span>
                    <span className="font-mono text-white">
                      R$ {drinksTotal.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-brand-mediumGray/50 pt-2 text-sm font-bold text-white">
                  <span>Total:</span>
                  <span className="text-brand-red font-mono text-base">
                    R$ {grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL / BOTTOM SHEET SOBREPOSTO DE SELEÇÃO DE SABORES (SLIDE-UP) */}
      {/* A PIZZA CONTINUA 100% NÍTIDA, INTERATIVA E VISÍVEL NO TOPO (SEM BLUR) */}
      <AnimatePresence>
        {isSheetOpen && activeSectorIndex !== null && (
          <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
            {/* Fechamento transparente apenas clicando no fundo fora da pizza e do modal */}
            <div
              onClick={() => {
                setIsSheetOpen(false);
                setSearchQuery("");
              }}
              className="fixed inset-0 z-30 pointer-events-auto"
            />

            {/* Container do Drawer / Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(e, info) => {
                if (info.offset.y > 60 || info.velocity.y > 200) {
                  setIsSheetOpen(false);
                  setSearchQuery("");
                }
              }}
              className="relative z-50 w-full max-w-2xl h-[46vh] max-h-[48vh] sm:max-h-[52vh] bg-[#141414] border-t border-neutral-800 rounded-t-[28px] p-3.5 sm:p-5 shadow-2xl flex flex-col pointer-events-auto overflow-hidden touch-pan-y"
            >
              {/* Barra de Arrasto / Drag Indicator */}
              <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-2 flex-shrink-0 cursor-grab active:cursor-grabbing" />

              {/* Cabeçalho do Modal com Seletor de Metades/Setores */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80 flex-shrink-0">
                <h3 className="font-serif text-sm sm:text-base font-bold text-white">
                  Selecione o sabor
                </h3>

                <div className="flex items-center gap-1.5">
                  {/* Seletor de Metades / Setores Ativos */}
                  {flavorCount > 1 && (
                    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-0.5 rounded-full">
                      {Array.from({ length: flavorCount }).map((_, idx) => {
                        const isCurrent = activeSectorIndex === idx;
                        const hasFlavor = selectedFlavors[idx];
                        const label =
                          flavorCount === 2
                            ? idx === 0
                              ? "Metade Esq."
                              : "Metade Dir."
                            : `Sabor ${idx + 1}`;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveSectorIndex(idx)}
                            className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                              isCurrent
                                ? "bg-brand-red text-white shadow-sm"
                                : hasFlavor
                                ? "bg-neutral-800 text-emerald-400 hover:text-white"
                                : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            {hasFlavor ? `✓ ${label}` : label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {flavorCount === 1 && (
                    <span className="font-sans font-bold text-[10px] sm:text-xs uppercase tracking-wider text-neutral-300 bg-neutral-800 border border-neutral-700 px-2.5 py-0.5 rounded-full">
                      PIZZA INTEIRA
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsSheetOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs font-bold ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Campo de Busca */}
              <div className="relative my-2 flex-shrink-0">
                <div className="relative flex items-center bg-neutral-950 border border-neutral-800 rounded-full px-3 py-1.5">
                  <span className="text-neutral-500 mr-2 text-xs">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar sabor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-neutral-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Abas de Categorias de Sabores */}
              <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-1 flex-shrink-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryTab("ALL")}
                  className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategoryTab === "ALL"
                      ? "bg-brand-red text-white shadow-sm"
                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                  }`}
                >
                  Todos ({flavors.length})
                </button>
                {flavorCategories.map((catName) => (
                  <button
                    key={catName}
                    type="button"
                    onClick={() => setSelectedCategoryTab(catName)}
                    className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategoryTab === catName
                        ? "bg-brand-red text-white shadow-sm"
                        : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {catName}
                  </button>
                ))}
              </div>

              {/* Lista Horizontal de Cards de Sabores (Conforme Imagem de Referência) */}
              <div className="flex-1 overflow-x-auto overflow-y-hidden pb-1 pt-1 flex items-center gap-2.5 scrollbar-none snap-x snap-mandatory">
                {filteredFlavors.map((flavor) => {
                  let flavorPrice = 0;
                  if (size === "P") flavorPrice = flavor.category.priceP;
                  else if (size === "M") flavorPrice = flavor.category.priceM;
                  else if (size === "G") flavorPrice = flavor.category.priceG;
                  else if (size === "GG") flavorPrice = flavor.category.priceGG;

                  const isCurrentlySelected =
                    selectedFlavors[activeSectorIndex]?.id === flavor.id;

                  return (
                    <div
                      key={flavor.id}
                      onClick={() => handleSelectFlavor(flavor)}
                      className={`flex-shrink-0 w-32 sm:w-36 h-[140px] sm:h-[150px] rounded-2xl p-3 flex flex-col justify-between items-start transition-all cursor-pointer select-none snap-start shadow-md group ${
                        isCurrentlySelected
                          ? "bg-brand-red/20 border-2 border-brand-red ring-1 ring-brand-red/40"
                          : "bg-[#1c1c1c] border border-neutral-800 hover:border-brand-red/70 hover:bg-neutral-800 active:scale-95"
                      }`}
                    >
                      {/* Imagem Circular no Topo/Esquerda */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage(getOptimizedImageUrl(flavor.imageUrl));
                        }}
                        className="w-10 h-10 rounded-full overflow-hidden border border-neutral-700 bg-neutral-900 flex-shrink-0 shadow-inner group/img"
                        title="Clique para ampliar"
                      >
                        <img
                          src={getOptimizedImageUrl(flavor.imageUrl)}
                          alt={flavor.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "/images/pizza-placeholder.png";
                          }}
                        />
                      </div>

                      {/* Nome do Sabor e Preço */}
                      <div className="w-full">
                        <h4 className="font-bold text-xs sm:text-sm text-white group-hover:text-brand-red transition-colors line-clamp-2 leading-tight">
                          {flavor.name}
                        </h4>
                        <span className="text-[11px] sm:text-xs font-mono font-semibold text-neutral-300 block mt-0.5">
                          + R$ {flavorPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredFlavors.length === 0 && (
                  <div className="w-full py-6 text-center text-neutral-400 text-xs">
                    Nenhum sabor encontrado para &quot;{searchQuery}&quot;.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox Modal para visualizar imagem ampliada */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
            onClick={() => setLightboxImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-xl w-full bg-brand-darkGray border border-brand-mediumGray rounded-3xl p-3 shadow-2xl overflow-hidden flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="absolute right-4 top-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 transition-all text-white font-bold cursor-pointer border border-neutral-700"
              >
                ✕
              </button>
              <div className="w-full aspect-square max-h-[65vh] rounded-2xl overflow-hidden bg-brand-bg flex items-center justify-center border border-neutral-800 p-2">
                <img
                  src={lightboxImage}
                  alt="Visualização ampliada"
                  className="max-w-full max-h-full object-contain rounded-xl"
                />
              </div>
              <p className="mt-2 text-xxs text-brand-lightGray italic">
                Toque fora ou no X para fechar
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
