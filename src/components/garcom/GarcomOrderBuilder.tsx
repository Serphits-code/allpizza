"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  calcPizzaItemTotal,
  calcPizzaBasePrice,
  calcSingleToppingPrice,
  FlavorInput,
  CrustInput,
  SelectedToppingItem,
} from "@/lib/pricing";
import { getOptimizedImageUrl } from "@/lib/imageHelper";
import PizzaSvg from "@/components/client/PizzaSvg";
import FlavorDistribution from "@/components/client/FlavorDistribution";
import StepIndicator, { StepType } from "@/components/client/StepIndicator";
import type { ToppingCategory } from "@/components/client/ToppingSelector";

const ToppingSelector = dynamic(() => import("@/components/client/ToppingSelector"), {
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

interface ComandaItem {
  id: string;
  number: number;
  status: string;
  responsibleName?: string | null;
}

interface GarcomOrderBuilderProps {
  flavors: PizzaFlavor[];
  crusts: CrustType[];
  standardCategories: StandardCategory[];
  toppingCategories?: ToppingCategory[];
  comandas: ComandaItem[];
  activeComandaId?: string;
  onMesaChange?: (newMesaId: string) => void;
  onOrderPlaced: (order: any) => void;
  onCancel: () => void;
}

export default function GarcomOrderBuilder({
  flavors,
  crusts,
  standardCategories,
  toppingCategories = [],
  comandas,
  activeComandaId,
  onMesaChange,
  onOrderPlaced,
  onCancel,
}: GarcomOrderBuilderProps) {
  // Ref para rolagem suave automática até a distribuição de fatias
  const sliceDistributionRef = useRef<HTMLDivElement>(null);

  // Switch Principal: Pizzas vs Outros (Bebidas & Produtos)
  const [mainTab, setMainTab] = useState<"pizzas" | "outros">("pizzas");
  const [productsSearch, setProductsSearch] = useState<string>("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>("TODOS");

  // Estados do fluxo multi-etapa da Pizza: "size" | "flavors" | "toppings"
  const [step, setStep] = useState<StepType>("size");
  const [toppingTarget, setToppingTarget] = useState<"FULL" | number>("FULL");
  const [selectedToppings, setSelectedToppings] = useState<SelectedToppingItem[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<{ [productId: string]: number }>({});

  // Estados de Configuração da Pizza
  const [size, setSize] = useState<string>("G"); // P, M, G, GG
  const [flavorCount, setFlavorCount] = useState<number>(2); // Padrão 2 sabores
  const [selectedFlavors, setSelectedFlavors] = useState<(PizzaFlavor | null)[]>([null, null, null]);
  const [selectedCrust, setSelectedCrust] = useState<CrustType | null>(null);
  const [caracolRequested, setCaracolRequested] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  // Estados do Garçom / Mesa
  const [selectedMesaId, setSelectedMesaId] = useState<string>(
    activeComandaId || (comandas.length > 0 ? comandas[0].id : "")
  );
  const [generalKitchenNotes, setGeneralKitchenNotes] = useState<string>("");
  const [sendingOrder, setSendingOrder] = useState<boolean>(false);

  // Sincroniza se activeComandaId mudar
  useEffect(() => {
    if (activeComandaId) {
      setSelectedMesaId(activeComandaId);
    } else if (comandas.length > 0 && !selectedMesaId) {
      setSelectedMesaId(comandas[0].id);
    }
  }, [activeComandaId, comandas]);

  const activeComanda = useMemo(() => {
    return comandas.find((c) => c.id === selectedMesaId) || comandas[0];
  }, [comandas, selectedMesaId]);

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
      const half = total / 2;
      return [half, half];
    }
    if (count === 3) {
      if (s === "P") return [2, 1, 1];
      if (s === "M") return [2, 2, 2];
      if (s === "G") return [3, 3, 2];
      if (s === "GG") return [4, 3, 3];
    }
    return [total];
  };

  // Atualiza fatias ao alterar tamanho ou quantidade de sabores
  useEffect(() => {
    setSlicesDistribution(getDefaultSlices(size, flavorCount));
  }, [size, flavorCount]);

  // Estados do Modal / Drawer de Seleção de Sabores
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Categorias únicas de pizza disponíveis
  const categories = useMemo(() => {
    const cats = Array.from(new Set(flavors.map((f) => f.category.name)));
    return ["TODOS", ...cats];
  }, [flavors]);

  // Sabores filtrados por busca e categoria
  const filteredFlavors = useMemo(() => {
    return flavors.filter((flavor) => {
      const matchesCategory =
        selectedCategory === "TODOS" || flavor.category.name === selectedCategory;
      const matchesSearch =
        flavor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flavor.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [flavors, selectedCategory, searchQuery]);

  // Handler para troca de tamanho
  const handleSelectSize = (newSize: string) => {
    setSize(newSize);
    if (newSize === "P" && flavorCount > 2) {
      setFlavorCount(2);
      setSelectedFlavors([selectedFlavors[0], selectedFlavors[1], null]);
    }
  };

  // Handler para troca de quantidade de sabores
  const handleSelectFlavorCount = (count: number) => {
    setFlavorCount(count);
    if (count === 1) {
      setSelectedFlavors([selectedFlavors[0], null, null]);
    } else if (count === 2) {
      setSelectedFlavors([selectedFlavors[0], selectedFlavors[1], null]);
    }
  };

  // Abre drawer de seleção para um setor específico
  const handleOpenSheet = (sectorIndex: number) => {
    setActiveSectorIndex(sectorIndex);
    setIsSheetOpen(true);
  };

  // Seleciona sabor para o setor ativo
  const handleSelectFlavor = (flavor: PizzaFlavor) => {
    if (activeSectorIndex === null) return;

    const newSelected = [...selectedFlavors];
    newSelected[activeSectorIndex] = flavor;
    setSelectedFlavors(newSelected);

    // Se houver próximo setor vazio, avança para ele
    let nextEmpty = -1;
    for (let i = 0; i < flavorCount; i++) {
      if (i !== activeSectorIndex && !newSelected[i]) {
        nextEmpty = i;
        break;
      }
    }

    if (nextEmpty !== -1) {
      setActiveSectorIndex(nextEmpty);
      setSearchQuery("");
    } else {
      setIsSheetOpen(false);
      setActiveSectorIndex(null);
      setSearchQuery("");

      if (size !== "P" && flavorCount > 1) {
        setTimeout(() => {
          sliceDistributionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 300);
      }
    }
  };

  // Prepara inputs para cálculo de preço seguro
  const pricingFlavorsInput: FlavorInput[] = useMemo(() => {
    return selectedFlavors
      .slice(0, flavorCount)
      .filter((f): f is PizzaFlavor => f !== null)
      .map((f) => ({
        name: f.name,
        category: f.category,
      }));
  }, [selectedFlavors, flavorCount]);

  const pricingCrustInput: CrustInput | null = useMemo(() => {
    if (!selectedCrust) return null;
    return {
      name: selectedCrust.name,
      pricePM: selectedCrust.pricePM,
      priceGGG: selectedCrust.priceGGG,
      caracol: selectedCrust.caracol,
    };
  }, [selectedCrust]);

  // Preço Total da Pizza em Tempo Real
  const currentTotal = useMemo(() => {
    if (pricingFlavorsInput.length === 0) return 0;
    return calcPizzaItemTotal(
      size,
      pricingFlavorsInput,
      pricingCrustInput,
      caracolRequested,
      selectedToppings
    );
  }, [size, pricingFlavorsInput, pricingCrustInput, caracolRequested, selectedToppings]);

  // Validação para avanço entre passos
  const canProceedToToppings = useMemo(() => {
    for (let i = 0; i < flavorCount; i++) {
      if (!selectedFlavors[i]) return false;
    }
    const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
    const isDynamic = size !== "P" && flavorCount > 1;
    const currentSum = slicesDistribution.reduce((a, b) => a + b, 0);
    if (isDynamic && currentSum !== totalSlices) return false;
    return true;
  }, [selectedFlavors, flavorCount, size, slicesDistribution]);

  const handleProceedToFlavors = () => {
    setStep("flavors");
  };

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

  const drinksCount = useMemo(() => {
    return Object.values(selectedDrinks).reduce((a, b) => a + b, 0);
  }, [selectedDrinks]);

  // Total Geral (Pizza + Bebidas)
  const grandTotal = currentTotal + drinksTotal;

  // Lançamento de Pedido direto para a Mesa e Cozinha no Kanban
  const handleSendOrderToKitchen = async () => {
    const activeFlavors = selectedFlavors
      .slice(0, flavorCount)
      .filter((f): f is PizzaFlavor => f !== null);

    const hasPizza = activeFlavors.length > 0;
    const hasDrinks = drinksCount > 0;

    if (!hasPizza && !hasDrinks) {
      alert("Por favor, monte uma pizza ou selecione produtos em 'Outros' antes de enviar para a cozinha.");
      return;
    }

    if (hasPizza && activeFlavors.length < flavorCount) {
      alert("Por favor, selecione todos os sabores da pizza antes de enviar para a cozinha.");
      setMainTab("pizzas");
      setStep("flavors");
      return;
    }

    const targetComanda = comandas.find((c) => c.id === selectedMesaId);
    if (!targetComanda) {
      alert("Por favor, selecione a mesa destino do pedido.");
      return;
    }

    setSendingOrder(true);

    try {
      const itemsPayload: any[] = [];

      if (hasPizza) {
        const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
        const isDynamic = size !== "P" && flavorCount > 1;

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

        const crustPriceVal = selectedCrust
          ? size === "P" || size === "M"
            ? selectedCrust.pricePM
            : selectedCrust.priceGGG
          : 0;

        const formattedPizzaItem = {
          name: displayName,
          isPizza: true,
          quantity: 1,
          price: currentTotal,
          basePrice: calcPizzaBasePrice(size, pricingFlavorsInput),
          pizzaSize: size,
          crustType: selectedCrust?.name || null,
          crustPrice: crustPriceVal,
          caracolRequested,
          flavors: activeFlavors.map((f, idx) => {
            const sliceNum = isDynamic
              ? slicesDistribution[idx]
              : size === "P" && flavorCount === 2
              ? 2
              : totalSlices;
            return {
              name: `${sliceNum} fatias ${f.name}`,
              flavorName: `${sliceNum} fatias ${f.name}`,
              slices: sliceNum,
              categoryName: f.category.name,
            };
          }),
          toppings: selectedToppings.map((t) => ({
            toppingName: t.topping.name,
            targetType: t.targetType,
            flavorName: t.flavorName || null,
            slicesCount: t.slicesCount,
            totalSlices: t.totalSlices,
            price: calcSingleToppingPrice(
              t.topping,
              size,
              t.slicesCount,
              t.totalSlices,
              t.quantity || 1
            ),
          })),
          notes: notes || undefined,
        };

        itemsPayload.push(formattedPizzaItem);
      }

      const formattedDrinks: any[] = [];
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
            formattedDrinks.push({
              name: foundProduct.name,
              isPizza: false,
              quantity: qty,
              price: foundProduct.price,
              basePrice: foundProduct.price,
            });
          }
        }
      });

      itemsPayload.push(...formattedDrinks);

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COMANDA",
          status: "EM_PREPARO", // Vai direto para Na Cozinha no Kanban
          comandaId: targetComanda.id,
          customerName: targetComanda.responsibleName || `Mesa #${targetComanda.number}`,
          notes: generalKitchenNotes.trim() || undefined,
          items: itemsPayload,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onOrderPlaced(data.order);
      } else {
        alert(data.error || "Erro ao enviar pedido para a cozinha.");
      }
    } catch (err) {
      console.error("Erro ao enviar pedido para mesa:", err);
      alert("Erro de conexão ao enviar pedido para a cozinha.");
    } finally {
      setSendingOrder(false);
    }
  };

  const getSectorLabel = (idx: number | null) => {
    if (idx === null) return "";
    if (flavorCount === 1) return "PIZZA INTEIRA";
    if (flavorCount === 2) return idx === 0 ? "METADE ESQUERDA" : "METADE DIREITA";
    return `SABOR ${idx + 1}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-6 py-3 sm:py-6 relative pb-28">
      {/* BANNER DE IDENTIFICAÇÃO DA MESA (GARÇOM) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-brand-darkGray border border-brand-mediumGray/70 rounded-xl p-2.5 mb-2.5 shadow-md gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-red/20 border border-brand-red/40 text-brand-red font-black text-sm font-mono">
            #{activeComanda?.number || "—"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white block leading-tight">
                Mesa #{activeComanda?.number || "—"} • {activeComanda?.responsibleName || "Mesa do Salão"}
              </span>
              <span
                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                  activeComanda?.status === "OCUPADA"
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {activeComanda?.status || "LIVRE"}
              </span>
            </div>
            <span className="text-[10px] text-brand-lightGray block">
              Lançamento para a Cozinha (Kanban)
            </span>
          </div>
        </div>

        {/* Seletor / Troca Rápida de Mesa no Cabeçalho */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="flex items-center gap-1.5 bg-brand-bg px-2 py-1 rounded-lg border border-brand-mediumGray/60">
            <label htmlFor="mesa-header-select" className="text-[10px] uppercase font-bold text-brand-lightGray shrink-0">
              Mesa:
            </label>
            <select
              id="mesa-header-select"
              value={selectedMesaId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedMesaId(newId);
                if (onMesaChange) onMesaChange(newId);
              }}
              className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {comandas.map((c) => (
                <option key={c.id} value={c.id} className="bg-brand-darkGray text-white">
                  Mesa #{String(c.number).padStart(2, "0")} {c.responsibleName ? `(${c.responsibleName})` : ""} - {c.status}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 rounded-lg bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray/70 text-[11px] text-brand-lightGray hover:text-white font-bold transition-colors cursor-pointer"
          >
            ✕ Voltar
          </button>
        </div>
      </div>

      {/* SWITCH RÁPIDO NO TOPO: PIZZAS vs OUTROS */}
      <div className="flex items-center justify-center gap-1.5 bg-brand-darkGray/90 border border-brand-mediumGray/70 p-1 rounded-xl mb-3 shadow-md max-w-md mx-auto">
        <button
          type="button"
          onClick={() => setMainTab("pizzas")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mainTab === "pizzas"
              ? "bg-brand-red text-white shadow-sm"
              : "text-brand-lightGray hover:text-white"
          }`}
        >
          <span>🍕</span>
          <span>Pizzas</span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab("outros")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mainTab === "outros"
              ? "bg-brand-red text-white shadow-sm"
              : "text-brand-lightGray hover:text-white"
          }`}
        >
          <span>🥤</span>
          <span>Outros (Bebidas)</span>
          {drinksCount > 0 && (
            <span className="bg-emerald-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">
              {drinksCount}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: FLUXO DE PIZZAS (TAMANHO -> SABORES -> ADICIONAIS) */}
      {/* ========================================================================= */}
      {mainTab === "pizzas" && (
        <>
          {/* STEPPER HORIZONTAL DA PIZZA (3 PASSOS) */}
          <div
            className={`transition-opacity duration-300 mb-2 sm:mb-4 ${
              isSheetOpen ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"
            }`}
          >
            <StepIndicator
              currentStep={step}
              hideDrinksStep={true}
              onStepClick={(targetStep) => {
                if (targetStep === "size") {
                  setStep("size");
                } else if (targetStep === "flavors") {
                  setStep("flavors");
                } else if (targetStep === "toppings") {
                  handleProceedToToppings();
                }
              }}
              toppingsCount={selectedToppings.length}
              drinksCount={drinksCount}
              canNavigateFlavors={true}
              canNavigateToppings={canProceedToToppings}
            />
          </div>

          {/* PASSO 1: SELEÇÃO DO TAMANHO DA PIZZA */}
          {step === "size" && (
            <div className="space-y-6 max-w-2xl mx-auto rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 sm:p-7 shadow-2xl backdrop-blur">
              <div className="text-center space-y-1 border-b border-brand-mediumGray/40 pb-4">
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-white flex items-center justify-center gap-2">
                  <span>📏</span> Escolha o tamanho da pizza
                </h2>
                <p className="text-xs sm:text-sm text-brand-lightGray">
                  Selecione o tamanho para a mesa #{activeComanda?.number || "—"}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    id: "P",
                    name: "Pequena (P)",
                    slices: "4 fatias",
                    desc: "Até 2 sabores (25cm)",
                    badge: "Individual / Dupla",
                  },
                  {
                    id: "M",
                    name: "Média (M)",
                    slices: "6 fatias",
                    desc: "Até 3 sabores (30cm)",
                    badge: "2 a 3 pessoas",
                  },
                  {
                    id: "G",
                    name: "Grande (G)",
                    slices: "8 fatias",
                    desc: "Até 3 sabores (35cm)",
                    badge: "Mais Pedida ⭐",
                  },
                  {
                    id: "GG",
                    name: "Gigante (GG)",
                    slices: "10 fatias",
                    desc: "Até 3 sabores (40cm)",
                    badge: "Família / Grupo",
                  },
                ].map((item) => {
                  const isSelected = size === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSize(item.id)}
                      className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? "bg-brand-red/15 border-brand-red ring-1 ring-brand-red shadow-lg shadow-brand-red/10"
                          : "bg-brand-bg/60 border-brand-mediumGray hover:border-brand-lightGray/40"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-serif text-lg font-bold text-white">
                          {item.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isSelected
                              ? "bg-brand-red text-white border-brand-red"
                              : "bg-brand-darkGray text-brand-lightGray border-brand-mediumGray"
                          }`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs font-mono font-bold text-amber-400">
                          🍕 {item.slices}
                        </div>
                        <div className="text-xxs text-brand-lightGray">
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-brand-mediumGray/40 pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setMainTab("outros")}
                  className="px-4 py-2.5 rounded-xl border border-brand-mediumGray text-brand-lightGray hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>🥤</span> Ver Bebidas & Outros
                </button>
                <button
                  type="button"
                  onClick={handleProceedToFlavors}
                  className="px-8 py-3.5 rounded-2xl bg-brand-red hover:bg-brand-redHover font-bold text-xs sm:text-sm text-white transition-all shadow-lg shadow-brand-red/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Avançar para Sabores (Passo 2) →
                </button>
              </div>
            </div>
          )}

          {/* PASSO 2: SABORES, VISUALIZADOR SVG, DISTRIBUIÇÃO E BORDA */}
          {step === "flavors" && (
            <div className="space-y-4">
              {/* Seletor da Quantidade de Sabores */}
              <div className="flex flex-col items-center justify-center space-y-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-brand-lightGray">
                  Selecione a quantidade de sabores
                </span>
                <div className="flex items-center gap-2 bg-brand-darkGray border border-brand-mediumGray p-1 rounded-2xl shadow-md">
                  <button
                    type="button"
                    onClick={() => handleSelectFlavorCount(1)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      flavorCount === 1
                        ? "bg-brand-red text-white shadow"
                        : "text-brand-lightGray hover:text-white"
                    }`}
                  >
                    1 Sabor
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFlavorCount(2)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      flavorCount === 2
                        ? "bg-brand-red text-white shadow"
                        : "text-brand-lightGray hover:text-white"
                    }`}
                  >
                    2 Sabores
                  </button>
                  {size !== "P" && (
                    <button
                      type="button"
                      onClick={() => handleSelectFlavorCount(3)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        flavorCount === 3
                          ? "bg-brand-red text-white shadow"
                          : "text-brand-lightGray hover:text-white"
                      }`}
                    >
                      3 Sabores
                    </button>
                  )}
                </div>
              </div>

              {/* Pizza SVG Interativa Central */}
              <div className="flex flex-col items-center justify-center py-2 relative">
                <PizzaSvg
                  size={size}
                  flavorCount={flavorCount}
                  selectedFlavors={selectedFlavors}
                  slicesDistribution={slicesDistribution}
                  onSectorClick={handleOpenSheet}
                  activeSectorIndex={activeSectorIndex}
                  isFullPizzaSelected={false}
                  toppingsCountBySector={toppingsCountBySector}
                />
                <p className="text-[11px] text-brand-lightGray/80 mt-2 text-center">
                  Toque nos botões ou fatias da pizza para escolher o sabor
                </p>
              </div>

              {/* Seletor de Distribuição das Fatias */}
              <div ref={sliceDistributionRef} className="max-w-2xl mx-auto w-full">
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
              </div>

              {/* Seleção de Bordas Recheadas */}
              <div className="max-w-2xl mx-auto w-full rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-4 sm:p-5 shadow-xl space-y-3">
                <div className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-2">
                  <span className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                    <span>🧀</span> Borda Recheada (Opcional)
                  </span>
                  {selectedCrust && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCrust(null);
                        setCaracolRequested(false);
                      }}
                      className="text-xxs text-rose-400 hover:underline cursor-pointer"
                    >
                      Remover Borda
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCrust(null);
                      setCaracolRequested(false);
                    }}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      selectedCrust === null
                        ? "bg-brand-red/15 border-brand-red text-white"
                        : "bg-brand-bg/60 border-brand-mediumGray text-brand-lightGray"
                    }`}
                  >
                    <span className="font-bold block">Tradicional</span>
                    <span className="text-[10px] text-brand-lightGray">Sem custo</span>
                  </button>

                  {crusts.map((crust) => {
                    const isSelected = selectedCrust?.id === crust.id;
                    const price = size === "P" || size === "M" ? crust.pricePM : crust.priceGGG;
                    return (
                      <button
                        key={crust.id}
                        type="button"
                        onClick={() => setSelectedCrust(crust)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-brand-red/15 border-brand-red text-white"
                            : "bg-brand-bg/60 border-brand-mediumGray text-brand-lightGray"
                        }`}
                      >
                        <span className="font-bold block truncate">{crust.name}</span>
                        <span className="text-[10px] font-mono text-amber-400">
                          + R$ {price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Opção Borda Caracol */}
                {selectedCrust && selectedCrust.caracol && (
                  <div className="pt-2 border-t border-brand-mediumGray/30 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        🍥 Formato Caracol
                      </span>
                      <span className="text-xxs text-brand-lightGray">
                        Borda decorada e crocante em formato caracol (+R$ 5,00)
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={caracolRequested}
                      onChange={(e) => setCaracolRequested(e.target.checked)}
                      className="w-5 h-5 accent-brand-red rounded cursor-pointer"
                    />
                  </div>
                )}

                {/* Observações da Pizza */}
                <div className="pt-2 border-t border-brand-mediumGray/30">
                  <label className="text-xxs uppercase tracking-wider font-semibold text-brand-lightGray block mb-1">
                    Observações desta Pizza (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Sem cebola, massa bem assada..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                  />
                </div>
              </div>

              {/* Barra de Navegação do Passo 2 */}
              <div className="max-w-2xl mx-auto w-full flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setStep("size")}
                  className="px-5 py-3 rounded-2xl bg-brand-darkGray border border-brand-mediumGray text-xs text-brand-lightGray hover:text-white font-bold transition-colors cursor-pointer"
                >
                  ← Voltar para Tamanho
                </button>

                <button
                  type="button"
                  onClick={handleProceedToToppings}
                  className="px-7 py-3 rounded-2xl bg-brand-red hover:bg-brand-redHover text-xs sm:text-sm text-white font-bold transition-all shadow-lg shadow-brand-red/20 cursor-pointer"
                >
                  Avançar para Adicionais (Passo 3) →
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: ADICIONAIS / TOPPINGS + RESUMO E ENVIO DIRETO */}
          {step === "toppings" && (
            <div className="space-y-6 max-w-4xl mx-auto w-full">
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

              <div className="flex justify-between items-center pt-3 border-t border-brand-mediumGray/40">
                <button
                  type="button"
                  onClick={() => setStep("flavors")}
                  className="px-5 py-3 rounded-2xl bg-brand-darkGray border border-brand-mediumGray text-xs text-brand-lightGray hover:text-white font-bold transition-colors cursor-pointer"
                >
                  ← Voltar para Sabores
                </button>

                <button
                  type="button"
                  onClick={() => setMainTab("outros")}
                  className="px-5 py-3 rounded-2xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray text-xs text-white font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>🥤</span>
                  <span>Adicionar Bebidas / Outros ({drinksCount})</span>
                </button>
              </div>

              {/* CARD DE RESUMO E ENVIO NA COZINHA */}
              <div className="max-w-xl mx-auto">
                <div className="rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 shadow-2xl space-y-4">
                  <h3 className="font-serif text-lg font-bold text-brand-red border-b border-brand-mediumGray/30 pb-2 flex items-center justify-between">
                    <span>📋 Resumo do Pedido</span>
                    <span className="text-xs font-mono font-bold text-brand-lightGray">
                      Mesa #{activeComanda?.number || "—"}
                    </span>
                  </h3>

                  {/* SELEÇÃO DA MESA DESTINO */}
                  <div className="space-y-2.5 border-b border-brand-mediumGray/30 pb-3">
                    {comandas.length > 0 && (
                      <div>
                        <label className="text-xxs font-bold text-brand-lightGray uppercase tracking-wider block mb-1">
                          Mesa Destino:
                        </label>
                        <select
                          value={selectedMesaId}
                          onChange={(e) => setSelectedMesaId(e.target.value)}
                          className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs font-bold text-white focus:border-brand-red focus:outline-none cursor-pointer"
                        >
                          {comandas.map((c) => (
                            <option key={c.id} value={c.id}>
                              Mesa #{c.number} {c.responsibleName ? `(${c.responsibleName})` : ""} - {c.status}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-xxs font-bold text-brand-lightGray uppercase tracking-wider block mb-1">
                        Obs. Gerais da Cozinha:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Bebidas primeiro, massa fina..."
                        value={generalKitchenNotes}
                        onChange={(e) => setGeneralKitchenNotes(e.target.value)}
                        className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Detalhamento dos Itens */}
                  <div className="space-y-2.5 text-xs">
                    <div className="space-y-1.5 border-b border-brand-mediumGray/30 pb-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">🍕 Pizza ({size})</span>
                        <span className="font-mono text-amber-400 font-bold">R$ {currentTotal.toFixed(2)}</span>
                      </div>
                      <ul className="space-y-1 text-white font-medium pl-2 text-[11px]">
                        {selectedFlavors.slice(0, flavorCount).map((f, idx) => (
                          <li key={idx} className="truncate text-brand-lightGray">
                            • <span className="text-white font-bold">{size !== "P" && flavorCount > 1 ? `${slicesDistribution[idx]}f ` : ""}</span>{f?.name}
                          </li>
                        ))}
                      </ul>
                      {selectedCrust && (
                        <div className="text-[11px] text-brand-lightGray pl-2">
                          Borda: <span className="text-white font-semibold">{selectedCrust.name}{caracolRequested ? " (Caracol)" : ""}</span>
                        </div>
                      )}
                      {selectedToppings.length > 0 && (
                        <div className="text-[11px] text-emerald-300 pl-2">
                          Adicionais: {selectedToppings.map((t) => t.topping.name).join(", ")}
                        </div>
                      )}
                    </div>

                    {drinksCount > 0 && (
                      <div className="space-y-1.5 border-b border-brand-mediumGray/30 pb-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white">🥤 Outros ({drinksCount} itens)</span>
                          <span className="font-mono text-emerald-400 font-bold">R$ {drinksTotal.toFixed(2)}</span>
                        </div>
                        <ul className="space-y-1 pl-2 text-[11px]">
                          {Object.entries(selectedDrinks).map(([pId, qty]) => {
                            if (qty <= 0) return null;
                            let pName = "";
                            let pPrice = 0;
                            for (const cat of standardCategories) {
                              const prod = cat.products.find((p) => p.id === pId);
                              if (prod) {
                                pName = prod.name;
                                pPrice = prod.price;
                                break;
                              }
                            }
                            return (
                              <li key={pId} className="flex justify-between text-brand-lightGray">
                                <span>{qty}x {pName}</span>
                                <span className="font-mono text-white">R$ {(pPrice * qty).toFixed(2)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="pt-1">
                      <div className="flex justify-between border-t border-brand-mediumGray/50 pt-2 text-sm font-bold text-white">
                        <span>Total do Pedido:</span>
                        <span className="text-brand-red font-mono text-lg">
                          R$ {grandTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSendOrderToKitchen}
                        disabled={sendingOrder}
                        className="w-full py-4 rounded-2xl bg-brand-red hover:bg-brand-redHover font-black text-xs sm:text-sm uppercase tracking-wider text-white shadow-xl shadow-brand-red/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {sendingOrder ? (
                          <span className="animate-pulse">Enviando para a Cozinha...</span>
                        ) : (
                          <>
                            <span>🔥</span> Enviar para a Cozinha (Na Cozinha)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: OUTROS (BEBIDAS, SOBREMESAS, PORÇÕES & PRODUTOS) */}
      {/* ========================================================================= */}
      {mainTab === "outros" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-5xl mx-auto w-full">
          {/* Catálogo de Produtos e Bebidas */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-4 sm:p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-brand-mediumGray/40 pb-3">
                <h3 className="font-serif text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>🥤</span> Bebidas & Outros Produtos
                </h3>
                <button
                  type="button"
                  onClick={() => setMainTab("pizzas")}
                  className="px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray text-xs text-amber-300 font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>🍕</span> Montar Pizza
                </button>
              </div>

              {/* Filtros e Busca */}
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="🔍 Buscar produto ou bebida..."
                  value={productsSearch}
                  onChange={(e) => setProductsSearch(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                />

                {/* Categorias Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSelectedProductCategory("TODOS")}
                    className={`px-3 py-1 rounded-lg text-xxs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedProductCategory === "TODOS"
                        ? "bg-brand-red text-white"
                        : "bg-brand-bg/60 border border-brand-mediumGray text-brand-lightGray hover:text-white"
                    }`}
                  >
                    Todos
                  </button>
                  {standardCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedProductCategory(cat.id)}
                      className={`px-3 py-1 rounded-lg text-xxs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedProductCategory === cat.id
                          ? "bg-brand-red text-white"
                          : "bg-brand-bg/60 border border-brand-mediumGray text-brand-lightGray hover:text-white"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Listagem dos Produtos */}
              <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
                {standardCategories.map((cat) => {
                  if (selectedProductCategory !== "TODOS" && cat.id !== selectedProductCategory) {
                    return null;
                  }
                  const matchingProducts = cat.products.filter((prod) => {
                    if (!productsSearch.trim()) return true;
                    const q = productsSearch.toLowerCase();
                    return prod.name.toLowerCase().includes(q) || (prod.description && prod.description.toLowerCase().includes(q));
                  });

                  if (matchingProducts.length === 0) return null;

                  return (
                    <div key={cat.id} className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-lightGray border-b border-brand-mediumGray/30 pb-1">
                        {cat.name}
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {matchingProducts.map((prod) => {
                          const qty = selectedDrinks[prod.id] || 0;
                          return (
                            <div
                              key={prod.id}
                              className="flex justify-between items-center rounded-2xl border border-brand-mediumGray bg-brand-bg/60 p-2.5 transition-all hover:border-brand-red/30 shadow-md"
                            >
                              <div className="min-w-0 pr-2">
                                <h5 className="font-bold text-xs text-white truncate">
                                  {prod.name}
                                </h5>
                                <span className="text-xs font-mono font-bold text-brand-red">
                                  R$ {prod.price.toFixed(2)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 bg-brand-darkGray border border-brand-mediumGray rounded-xl p-1 shrink-0">
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
            </div>
          </div>

          {/* Resumo do Pedido e Envio para a Cozinha */}
          <div className="lg:col-span-5 rounded-3xl border border-brand-mediumGray bg-brand-darkGray/90 p-5 shadow-2xl space-y-4">
            <h3 className="font-serif text-lg font-bold text-brand-red border-b border-brand-mediumGray/30 pb-2 flex items-center justify-between">
              <span>📋 Resumo do Pedido</span>
              <span className="text-xs font-mono font-bold text-brand-lightGray">
                Mesa #{activeComanda?.number || "—"}
              </span>
            </h3>

            {/* SELEÇÃO DA MESA DESTINO */}
            <div className="space-y-2.5 border-b border-brand-mediumGray/30 pb-3">
              {comandas.length > 0 && (
                <div>
                  <label className="text-xxs font-bold text-brand-lightGray uppercase tracking-wider block mb-1">
                    Mesa Destino:
                  </label>
                  <select
                    value={selectedMesaId}
                    onChange={(e) => setSelectedMesaId(e.target.value)}
                    className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs font-bold text-white focus:border-brand-red focus:outline-none cursor-pointer"
                  >
                    {comandas.map((c) => (
                      <option key={c.id} value={c.id}>
                        Mesa #{c.number} {c.responsibleName ? `(${c.responsibleName})` : ""} - {c.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xxs font-bold text-brand-lightGray uppercase tracking-wider block mb-1">
                  Obs. Gerais da Cozinha:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Bebidas primeiro, massa fina..."
                  value={generalKitchenNotes}
                  onChange={(e) => setGeneralKitchenNotes(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                />
              </div>
            </div>

            {/* Detalhamento dos Itens */}
            <div className="space-y-2.5 text-xs">
              {/* Pizza se configurada */}
              {pricingFlavorsInput.length > 0 ? (
                <div className="space-y-1.5 border-b border-brand-mediumGray/30 pb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">🍕 Pizza ({size})</span>
                    <span className="font-mono text-amber-400 font-bold">R$ {currentTotal.toFixed(2)}</span>
                  </div>
                  <ul className="space-y-1 text-white font-medium pl-2 text-[11px]">
                    {selectedFlavors.slice(0, flavorCount).map((f, idx) => (
                      <li key={idx} className="truncate text-brand-lightGray">
                        • <span className="text-white font-bold">{size !== "P" && flavorCount > 1 ? `${slicesDistribution[idx]}f ` : ""}</span>{f?.name}
                      </li>
                    ))}
                  </ul>
                  {selectedCrust && (
                    <div className="text-[11px] text-brand-lightGray pl-2">
                      Borda: <span className="text-white font-semibold">{selectedCrust.name}{caracolRequested ? " (Caracol)" : ""}</span>
                    </div>
                  )}
                  {selectedToppings.length > 0 && (
                    <div className="text-[11px] text-emerald-300 pl-2">
                      Adicionais: {selectedToppings.map((t) => t.topping.name).join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-brand-lightGray/60 italic pb-2 border-b border-brand-mediumGray/30">
                  Nenhuma pizza configurada neste pedido
                </div>
              )}

              {/* Itens de Outros / Bebidas */}
              {drinksCount > 0 ? (
                <div className="space-y-1.5 border-b border-brand-mediumGray/30 pb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">🥤 Outros ({drinksCount} itens)</span>
                    <span className="font-mono text-emerald-400 font-bold">R$ {drinksTotal.toFixed(2)}</span>
                  </div>
                  <ul className="space-y-1 pl-2 text-[11px]">
                    {Object.entries(selectedDrinks).map(([pId, qty]) => {
                      if (qty <= 0) return null;
                      let pName = "";
                      let pPrice = 0;
                      for (const cat of standardCategories) {
                        const prod = cat.products.find((p) => p.id === pId);
                        if (prod) {
                          pName = prod.name;
                          pPrice = prod.price;
                          break;
                        }
                      }
                      return (
                        <li key={pId} className="flex justify-between text-brand-lightGray">
                          <span>{qty}x {pName}</span>
                          <span className="font-mono text-white">R$ {(pPrice * qty).toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="text-[11px] text-brand-lightGray/60 italic pb-2 border-b border-brand-mediumGray/30">
                  Nenhum item selecionado em Outros
                </div>
              )}

              <div className="pt-1">
                <div className="flex justify-between border-t border-brand-mediumGray/50 pt-2 text-sm font-bold text-white">
                  <span>Total do Pedido:</span>
                  <span className="text-brand-red font-mono text-lg">
                    R$ {grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* BOTÃO PRINCIPAL: ENVIAR PARA A COZINHA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSendOrderToKitchen}
                  disabled={sendingOrder || (pricingFlavorsInput.length === 0 && drinksCount === 0)}
                  className="w-full py-4 rounded-2xl bg-brand-red hover:bg-brand-redHover font-black text-xs sm:text-sm uppercase tracking-wider text-white shadow-xl shadow-brand-red/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sendingOrder ? (
                    <span className="animate-pulse">Enviando para a Cozinha...</span>
                  ) : (
                    <>
                      <span>🔥</span> Enviar para a Cozinha (Na Cozinha)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL / BOTTOM SHEET SOBREPOSTO DE SELEÇÃO DE SABORES (SLIDE-UP) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isSheetOpen && activeSectorIndex !== null && (
          <div className="fixed inset-0 z-50 flex flex-col justify-between items-center pointer-events-none pb-0 pt-3 sm:pt-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => {
                setIsSheetOpen(false);
                setSearchQuery("");
              }}
              className="fixed inset-0 z-30 pointer-events-auto bg-[#0c0c0c]/95 backdrop-blur-md"
            />

            {/* Pizza no topo */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 0.96, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-40 flex-1 flex flex-col items-center justify-center pointer-events-auto max-h-[44dvh] sm:max-h-[42dvh] w-full px-2 pt-2 sm:pt-4"
            >
              <PizzaSvg
                size={size}
                flavorCount={flavorCount}
                selectedFlavors={selectedFlavors}
                slicesDistribution={slicesDistribution}
                onSectorClick={handleOpenSheet}
                activeSectorIndex={activeSectorIndex}
                isFullPizzaSelected={false}
                toppingsCountBySector={toppingsCountBySector}
              />
            </motion.div>

            {/* Drawer Bottom Sheet */}
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
              className="relative z-50 w-full max-w-2xl h-[50dvh] max-h-[52dvh] bg-[#141414] border-t border-neutral-800 rounded-t-[28px] px-3.5 pt-3 pb-5 sm:px-5 sm:pt-4 sm:pb-6 shadow-2xl flex flex-col pointer-events-auto overflow-hidden touch-pan-y"
            >
              <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-2 flex-shrink-0 cursor-grab active:cursor-grabbing" />

              <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80 flex-shrink-0">
                <h3 className="font-serif text-sm sm:text-base font-bold text-white">
                  Selecione o sabor
                </h3>

                <div className="flex items-center gap-1.5">
                  {flavorCount > 1 && (
                    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-0.5 rounded-full">
                      {Array.from({ length: flavorCount }).map((_, idx) => {
                        const isCurrent = activeSectorIndex === idx;
                        const hasFlavor = selectedFlavors[idx];
                        const label =
                          flavorCount === 2
                            ? idx === 0
                              ? "Esq"
                              : "Dir"
                            : `${idx + 1}`;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveSectorIndex(idx)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              isCurrent
                                ? "bg-brand-red text-white shadow-sm"
                                : hasFlavor
                                ? "bg-neutral-800 text-neutral-300"
                                : "text-neutral-500 hover:text-neutral-300"
                            }`}
                          >
                            <span>{label}</span>
                            {hasFlavor && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <span className="text-[10px] sm:text-xs font-mono font-bold text-brand-red bg-brand-red/10 border border-brand-red/20 px-2 py-0.5 rounded-full">
                    {getSectorLabel(activeSectorIndex)}
                  </span>
                </div>
              </div>

              {/* Categorias Tabs */}
              <div className="flex gap-1.5 overflow-x-auto py-2 flex-shrink-0 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-brand-red text-white shadow-md shadow-brand-red/20"
                        : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Busca */}
              <div className="relative mb-2 flex-shrink-0">
                <input
                  type="text"
                  placeholder="🔍 Buscar sabor ou ingrediente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-900/90 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-brand-red focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1.5 text-neutral-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Lista de Sabores */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 touch-pan-y min-h-0">
                {filteredFlavors.map((flavor) => {
                  const isSelectedInThisSector =
                    activeSectorIndex !== null &&
                    selectedFlavors[activeSectorIndex]?.id === flavor.id;
                  const price =
                    size === "P"
                      ? flavor.category.priceP
                      : size === "M"
                      ? flavor.category.priceM
                      : size === "G"
                      ? flavor.category.priceG
                      : flavor.category.priceGG;

                  return (
                    <div
                      key={flavor.id}
                      onClick={() => handleSelectFlavor(flavor)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelectedInThisSector
                          ? "bg-brand-red/20 border-brand-red text-white"
                          : "bg-neutral-900/50 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {flavor.imageUrl && (
                          <div className="w-11 h-11 rounded-lg bg-neutral-950 border border-neutral-800 overflow-hidden flex-shrink-0">
                            <img
                              src={getOptimizedImageUrl(flavor.imageUrl)}
                              alt={flavor.name}
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
                          <h4 className="font-serif font-bold text-xs sm:text-sm text-white truncate">
                            {flavor.name}
                          </h4>
                          <p className="text-[10px] text-neutral-400 line-clamp-1">
                            {flavor.description}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-mono font-bold text-amber-400 block">
                          R$ {price.toFixed(2)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-medium">
                          {flavor.category.name}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredFlavors.length === 0 && (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    Nenhum sabor encontrado para &quot;{searchQuery}&quot;.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
