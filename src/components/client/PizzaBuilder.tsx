"use client";

import React, { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";
import { calcPizzaItemTotal, calcSingleToppingPrice, FlavorInput, CrustInput, SelectedToppingItem } from "@/lib/pricing";
import { getOptimizedImageUrl } from "@/lib/imageHelper";
import PizzaSvg from "./PizzaSvg";
import FlavorDistribution from "./FlavorDistribution";
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

export default function PizzaBuilder({ flavors, crusts, standardCategories, toppingCategories = [] }: PizzaBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((state) => state.addItem);

  // Estados do fluxo multi-etapa: "pizza" | "toppings" | "drinks"
  const [step, setStep] = useState<"pizza" | "toppings" | "drinks">("pizza");
  const [toppingTarget, setToppingTarget] = useState<"FULL" | number>("FULL");
  const [selectedToppings, setSelectedToppings] = useState<SelectedToppingItem[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<{ [productId: string]: number }>({});

  // Estados de Configuração da Pizza
  const [size, setSize] = useState<string>("G"); // P, M, G, GG
  const [flavorCount, setFlavorCount] = useState<number>(1); // 1, 2, 3
  const [selectedFlavors, setSelectedFlavors] = useState<(PizzaFlavor | null)[]>([null, null, null]);
  const [selectedCrust, setSelectedCrust] = useState<CrustType | null>(null);
  const [caracolRequested, setCaracolRequested] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

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

  // Estado da Planilha de Seleção de Sabores (Bottom Selection Sheet)
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
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

  // Se o tipo de borda não suportar caracol, limpamos a solicitação de caracol
  useEffect(() => {
    if (selectedCrust && !selectedCrust.caracol) {
      setCaracolRequested(false);
    }
  }, [selectedCrust]);

  // Agrupar os sabores por categoria para exibir na planilha
  const flavorsByCategory = useMemo(() => {
    const grouped: { [key: string]: PizzaFlavor[] } = {};
    for (const f of flavors) {
      const catName = f.category.name;
      if (!grouped[catName]) {
        grouped[catName] = [];
      }
      // Filtro de busca
      const matchesSearch =
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description.toLowerCase().includes(searchQuery.toLowerCase());
      if (matchesSearch) {
        grouped[catName].push(f);
      }
    }
    return grouped;
  }, [flavors, searchQuery]);

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

  // Abre a planilha de seleção para um determinado pedaço
  const handleOpenSheet = (index: number) => {
    setActiveSectorIndex(index);
    setIsSheetOpen(true);
  };

  // Seleciona um sabor
  const handleSelectFlavor = (flavor: PizzaFlavor) => {
    if (activeSectorIndex !== null) {
      setSelectedFlavors((prev) => {
        const copy = [...prev];
        copy[activeSectorIndex] = flavor;
        return copy;
      });
      setIsSheetOpen(false);
      setActiveSectorIndex(null);
      setSearchQuery("");
    }
  };

  // Efeito para rolar ao topo quando muda de etapa (UX Premium)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Avançar para a etapa 2: Adicionais Extra
  const handleProceedToToppings = () => {
    // Valida se todos os setores necessários estão preenchidos
    for (let i = 0; i < flavorCount; i++) {
      if (!selectedFlavors[i]) {
        alert(`Por favor, selecione o sabor para o Sabor ${i + 1}.`);
        return;
      }
    }

    const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
    const isDynamic = size !== "P" && flavorCount > 1;
    const currentSum = slicesDistribution.reduce((a, b) => a + b, 0);

    // Valida se a distribuição de fatias está completa
    if (isDynamic && currentSum !== totalSlices) {
      alert(`Por favor, ajuste a distribuição das fatias. Atualmente possui ${currentSum} de ${totalSlices} fatias distribuídas.`);
      return;
    }

    setStep("toppings");
  };

  // Avançar para a etapa 3: Bebidas & Acompanhamentos
  const handleProceedToDrinks = () => {
    setStep("drinks");
  };

  // Atualizar quantidade de bebidas selecionadas
  const handleUpdateDrinkQty = (productId: string, newQty: number) => {
    if (newQty < 0) return;
    setSelectedDrinks((prev) => ({
      ...prev,
      [productId]: newQty,
    }));
  };

  // Calcular total de bebidas em tempo real
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

  // Total Geral (Pizza + Bebidas)
  const grandTotal = currentTotal + drinksTotal;

  // Confirmar tudo e ir para o carrinho
  const handleConfirmAll = () => {
    const totalSlices = size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10;
    const isDynamic = size !== "P" && flavorCount > 1;
    const activeFlavors = selectedFlavors.slice(0, flavorCount).filter((f): f is PizzaFlavor => f !== null);
    
    // Formata o nome do item e os sabores baseado na contagem de fatias
    let displayName = "";
    if (isDynamic) {
      const slicesDesc = activeFlavors.map((f, idx) => `${slicesDistribution[idx]} fatias ${f.name}`).join(" / ");
      displayName = `Pizza Customizada ${size} (${slicesDesc})`;
    } else if (size === "P" && flavorCount === 2) {
      const slicesDesc = activeFlavors.map((f) => `2 fatias ${f.name}`).join(" / ");
      displayName = `Pizza Customizada P (${slicesDesc})`;
    } else {
      displayName = `Pizza Customizada ${size} (${activeFlavors[0].name})`;
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
          : (size === "P" && flavorCount === 2 ? `2 fatias ${f.name}` : f.name),
        categoryName: f.category.name,
        slices: isDynamic
          ? slicesDistribution[idx]
          : (size === "P" && flavorCount === 2 ? 2 : totalSlices)
      })),
      crustType: selectedCrust?.name || "Tradicional",
      crustPrice: selectedCrust ? (size === "P" || size === "M" ? selectedCrust.pricePM : selectedCrust.priceGGG) : 0,
      caracolRequested,
      toppings: selectedToppings.map((t) => ({
        toppingId: t.topping.id,
        toppingName: t.topping.name,
        targetType: t.targetType,
        flavorName: t.flavorName,
        slicesCount: t.slicesCount,
        totalSlices: t.totalSlices,
        price: calcSingleToppingPrice(t.topping, size, t.slicesCount, t.totalSlices, t.quantity || 1),
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 relative">
      {/* CABEÇALHO DE ETAPAS */}
      <div className="mb-8 flex items-center justify-center">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 bg-brand-darkGray border border-brand-mediumGray p-2 rounded-2xl shadow-lg text-xs font-bold">
          <button
            type="button"
            onClick={() => setStep("pizza")}
            className={`px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              step === "pizza" ? "bg-brand-red text-white shadow-md" : "text-brand-lightGray hover:text-white"
            }`}
          >
            <span>🍕</span>
            <span>1. Pizza & Sabores</span>
          </button>

          <span className="text-neutral-600">→</span>

          <button
            type="button"
            onClick={handleProceedToToppings}
            className={`px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              step === "toppings" ? "bg-brand-red text-white shadow-md" : "text-brand-lightGray hover:text-white"
            }`}
          >
            <span>✨</span>
            <span>2. Adicionais Extra</span>
            {selectedToppings.length > 0 && (
              <span className="bg-brand-gold text-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {selectedToppings.length}
              </span>
            )}
          </button>

          <span className="text-neutral-600">→</span>

          <button
            type="button"
            onClick={() => {
              if (selectedFlavors.slice(0, flavorCount).every(Boolean)) {
                setStep("drinks");
              } else {
                handleProceedToToppings();
              }
            }}
            className={`px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              step === "drinks" ? "bg-brand-red text-white shadow-md" : "text-brand-lightGray hover:text-white"
            }`}
          >
            <span>🥤</span>
            <span>3. Bebidas & Finalização</span>
          </button>
        </div>
      </div>

      {step === "pizza" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Coluna Esquerda: Visualização Gráfica da Pizza */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-6">
            <h2 className="font-serif text-2xl font-bold tracking-wide text-brand-red text-center">
              Visualização Dinâmica
            </h2>
            
            {/* Componente SVG Customizado e Animado */}
            <PizzaSvg
              size={size}
              flavorCount={flavorCount}
              selectedFlavors={selectedFlavors}
              slicesDistribution={slicesDistribution}
              onSectorClick={handleOpenSheet}
            />

            {/* Dica para o usuário */}
            <p className="text-xxs italic text-brand-lightGray/70 text-center max-w-xs">
              Toque nos botões flutuantes ou nos setores da pizza acima para selecionar o sabor de cada pedaço.
            </p>
          </div>

          {/* Coluna Direita: Painel de Customização */}
          <div className="lg:col-span-6 space-y-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 sm:p-8 shadow-xl">
            <div className="space-y-2">
              <h1 className="font-serif text-3xl font-bold tracking-wide text-white">
                Monte sua Pizza
              </h1>
              <p className="text-xs text-brand-lightGray">
                Selecione o tamanho, a quantidade de sabores e adicione adicionais de bordas recheadas.
              </p>
            </div>

            {/* Seletor de Sabores Count */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray">
                Quantidade de Sabores
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((count) => {
                  const isDisabled = count === 3 && size === "P";
                  return (
                    <button
                      key={count}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setFlavorCount(count)}
                      className={`rounded-lg py-2.5 text-xs font-bold transition-all cursor-pointer ${
                        flavorCount === count
                          ? "bg-brand-red text-white"
                          : isDisabled
                          ? "bg-brand-bg/50 text-brand-lightGray/30 border border-brand-mediumGray/20 cursor-not-allowed opacity-40"
                          : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                      }`}
                    >
                      {count} {count === 1 ? "Sabor" : "Sabores"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seletor de Tamanhos */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray">
                Tamanho
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { size: "P", desc: "4 fatias" },
                  { size: "M", desc: "6 fatias" },
                  { size: "G", desc: "8 fatias" },
                  { size: "GG", desc: "10 fatias" },
                ].map((s) => (
                  <button
                    key={s.size}
                    onClick={() => setSize(s.size)}
                    className={`flex flex-col items-center justify-center rounded-lg py-2 border transition-all cursor-pointer ${
                      size === s.size
                        ? "bg-brand-red/10 border-brand-red text-brand-red"
                        : "bg-brand-bg border-brand-mediumGray text-brand-lightGray hover:text-white"
                    }`}
                  >
                    <span className="text-sm font-bold">{s.size}</span>
                    <span className="text-xxs opacity-70">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Distribuição Dinâmica de Fatias (M, G, GG) */}
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
            <div className="space-y-4 border-t border-brand-mediumGray/50 pt-6">
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray">
                  Borda Recheada
                </label>
                <div className="relative">
                  <select
                    value={selectedCrust?.id || ""}
                    onChange={(e) => {
                      const found = crusts.find((c) => c.id === e.target.value);
                      setSelectedCrust(found || null);
                    }}
                    className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white focus:border-brand-red focus:outline-none transition-colors"
                  >
                    <option value="">Sem borda recheada (Tradicional)</option>
                    {crusts.map((crust) => (
                      <option key={crust.id} value={crust.id}>
                        {crust.name} (+R$ {size === "P" || size === "M" ? crust.pricePM.toFixed(2) : crust.priceGGG.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Adicional de Borda Caracol */}
              {selectedCrust && selectedCrust.caracol && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-brand-bg border border-brand-mediumGray">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white block">Opção Caracol</span>
                    <span className="text-xxs text-brand-lightGray block">Preparo em espiral diferenciado com recheio extra (+ R$ 5,00)</span>
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
            <div className="space-y-3 border-t border-brand-mediumGray/50 pt-6">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray">
                Observações do Item
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Sem cebola, bem assada, etc."
                rows={2}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none transition-colors"
              />
            </div>

            {/* Painel Final de Preço e Ação */}
            <div className="border-t border-brand-mediumGray/50 pt-6 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xxs text-brand-lightGray font-sans uppercase tracking-wider">Subtotal da Pizza</span>
                <div className="text-2xl font-bold font-mono text-brand-red">
                  R$ {currentTotal.toFixed(2)}
                </div>
              </div>

              <button
                onClick={handleProceedToToppings}
                className="rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3.5 font-bold text-sm text-white transition-colors cursor-pointer shadow-lg shadow-brand-red/10 flex items-center gap-2"
              >
                <span>Avançar (Adicionais)</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "toppings" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Coluna Esquerda: Visualização Dinâmica sutil no Disco */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-5 rounded-2xl border border-brand-mediumGray/70 bg-brand-darkGray p-6 shadow-xl sticky top-6">
            <div className="text-center space-y-1">
              <h2 className="font-serif text-xl font-bold tracking-wide text-brand-red">
                Visualização Dinâmica
              </h2>
              <p className="text-xxs italic text-brand-lightGray">
                Toque no setor do sabor no disco para selecioná-lo (destaque em verde 🟢).
              </p>
            </div>

            {/* SVG Interativo com Borda Verde no Setor Selecionado */}
            <PizzaSvg
              size={size}
              flavorCount={flavorCount}
              selectedFlavors={selectedFlavors}
              slicesDistribution={slicesDistribution}
              onSectorClick={(idx) => setToppingTarget(idx)}
              activeSectorIndex={typeof toppingTarget === "number" ? toppingTarget : null}
              isFullPizzaSelected={toppingTarget === "FULL"}
              toppingsCountBySector={toppingsCountBySector}
            />

            {/* Alternador sutil de Alvo (Pizza Inteira vs Setores) */}
            <div className="w-full flex flex-col gap-2 pt-2 border-t border-brand-mediumGray/40">
              <button
                type="button"
                onClick={() => setToppingTarget("FULL")}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                  toppingTarget === "FULL"
                    ? "bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-sm"
                    : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${toppingTarget === "FULL" ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"}`} />
                  <span>🍕 Aplicar na Pizza Inteira</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  ({size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10} fatias)
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {selectedFlavors.slice(0, flavorCount).map((flavor, idx) => {
                  if (!flavor) return null;
                  const isSelected = toppingTarget === idx;

                  return (
                    <button
                      key={flavor.id + idx}
                      type="button"
                      onClick={() => setToppingTarget(idx)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-sm"
                          : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"}`} />
                        <span className="truncate">{flavor.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Seletor de Adicionais */}
          <div className="lg:col-span-7 space-y-6 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 sm:p-8 shadow-xl">
            <div className="space-y-2 border-b border-brand-mediumGray/30 pb-4">
              <h1 className="font-serif text-3xl font-bold tracking-wide text-white flex items-center gap-2">
                <span>✨</span> Adicionais Extra
              </h1>
              <p className="text-xs text-brand-lightGray">
                Selecione os adicionais para a parte selecionada no disco.
              </p>
            </div>

            <ToppingSelector
              size={size}
              totalSlices={size === "P" ? 4 : size === "M" ? 6 : size === "G" ? 8 : 10}
              flavors={selectedFlavors
                .slice(0, flavorCount)
                .filter((f): f is PizzaFlavor => f !== null)
                .map((f, idx) => ({
                  id: f.id,
                  name: f.name,
                  slices: size === "P" && flavorCount === 2 ? 2 : (slicesDistribution[idx] || 0),
                }))}
              categories={toppingCategories}
              selectedToppings={selectedToppings}
              onChange={setSelectedToppings}
              activeTarget={toppingTarget}
              onTargetChange={setToppingTarget}
            />

            {/* Ações de Navegação */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-brand-mediumGray/50 pt-6 mt-8 gap-4">
              <button
                type="button"
                onClick={() => setStep("pizza")}
                className="w-full sm:w-auto rounded-xl border border-brand-mediumGray bg-brand-bg hover:bg-brand-mediumGray px-5 py-3 font-semibold text-sm text-brand-lightGray hover:text-white transition-colors cursor-pointer text-center"
              >
                ← Voltar para Sabores
              </button>

              <button
                type="button"
                onClick={handleProceedToDrinks}
                className="w-full sm:w-auto rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-bold text-sm text-white transition-colors cursor-pointer text-center shadow-lg shadow-brand-red/10"
              >
                Avançar (Bebidas) →
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "drinks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Coluna Esquerda: Listagem de Bebidas */}
          <div className="lg:col-span-8 space-y-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 sm:p-8 shadow-xl">
            <div className="space-y-2 border-b border-brand-mediumGray/30 pb-4">
              <h1 className="font-serif text-3xl font-bold tracking-wide text-white">
                Que tal uma bebida pra acompanhar? 🥤
              </h1>
              <p className="text-xs text-brand-lightGray">
                Adicione bebidas e outros acompanhamentos deliciosos para completar o seu pedido.
              </p>
            </div>

            {/* Listagem de produtos agrupados por categoria */}
            <div className="space-y-8 pt-2">
              {standardCategories.map((cat) => {
                if (cat.products.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-4">
                    <h3 className="font-serif text-lg font-bold tracking-wide text-brand-red border-l-4 border-brand-red pl-3">
                      {cat.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {cat.products.map((prod) => {
                        const qty = selectedDrinks[prod.id] || 0;
                        return (
                          <div
                            key={prod.id}
                            className="flex justify-between items-center rounded-xl border border-brand-mediumGray bg-brand-bg/50 p-4 transition-all hover:border-brand-red/30 shadow-md min-h-[90px]"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {prod.imageUrl && (
                                <div className="w-16 h-16 rounded-lg bg-brand-darkGray border border-brand-mediumGray overflow-hidden flex-shrink-0">
                                  <img
                                    src={getOptimizedImageUrl(prod.imageUrl)}
                                    alt={prod.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = "/images/pizza-placeholder.png";
                                    }}
                                  />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="font-serif font-bold text-sm text-white truncate">
                                  {prod.name}
                                </h4>
                                <p className="text-xxs text-brand-lightGray line-clamp-2 leading-tight mt-0.5">
                                  {prod.description}
                                </p>
                                <div className="text-xs font-bold text-brand-red font-mono mt-1">
                                  R$ {prod.price.toFixed(2)}
                                </div>
                              </div>
                            </div>

                            {/* Controle do Contador */}
                            <div className="flex items-center gap-2 bg-brand-darkGray border border-brand-mediumGray rounded-lg p-1 flex-shrink-0 select-none">
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

            {/* Ações de navegação */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-brand-mediumGray/50 pt-6 mt-8 gap-4">
              <button
                type="button"
                onClick={() => setStep("toppings")}
                className="w-full sm:w-auto rounded-xl border border-brand-mediumGray bg-brand-bg hover:bg-brand-mediumGray px-5 py-3 font-semibold text-sm text-brand-lightGray hover:text-white transition-colors cursor-pointer text-center"
              >
                ← Voltar para Adicionais
              </button>

              <button
                type="button"
                onClick={handleConfirmAll}
                className="w-full sm:w-auto rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-bold text-sm text-white transition-colors cursor-pointer text-center shadow-lg shadow-brand-red/10"
              >
                {Object.values(selectedDrinks).some((q) => q > 0)
                  ? "Adicionar itens e ir para o carrinho →"
                  : "Ir para o carrinho →"}
              </button>
            </div>
          </div>

          {/* Coluna Direita: Resumo da Pizza e Total Geral */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-6">
            <h2 className="font-serif text-xl font-bold tracking-wide text-brand-red border-b border-brand-mediumGray/30 pb-3">
              Resumo do Pedido
            </h2>
            <div className="space-y-4">
              {/* Mini Preview SVG */}
              <div className="relative aspect-square w-28 mx-auto rounded-full border border-brand-mediumGray bg-brand-bg flex items-center justify-center overflow-hidden">
                <PizzaSvg
                  size={size}
                  flavorCount={flavorCount}
                  selectedFlavors={selectedFlavors}
                  slicesDistribution={slicesDistribution}
                  onSectorClick={() => {}}
                />
              </div>

              {/* Pizza Info */}
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-brand-mediumGray/35 pb-2">
                  <span className="text-brand-lightGray">Tamanho:</span>
                  <span className="font-semibold text-white">
                    {size} ({size === "P" ? "4" : size === "M" ? "6" : size === "G" ? "8" : "10"} fatias)
                  </span>
                </div>
                <div className="border-b border-brand-mediumGray/35 pb-2">
                  <span className="text-brand-lightGray block mb-1">Sabores selecionados:</span>
                  <ul className="list-disc list-inside space-y-1 text-white font-medium pl-1">
                    {selectedFlavors.slice(0, flavorCount).map((f, idx) => (
                      <li key={idx} className="truncate list-none">
                        🍕 <span className="font-sans font-bold">{size !== "P" && flavorCount > 1 ? `${slicesDistribution[idx]}f ` : ""}</span>
                        {f?.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex justify-between border-b border-brand-mediumGray/35 pb-2">
                  <span className="text-brand-lightGray">Borda:</span>
                  <span className="font-semibold text-white">
                    {selectedCrust?.name || "Tradicional"}
                  </span>
                </div>
                {caracolRequested && (
                  <div className="flex justify-between border-b border-brand-mediumGray/35 pb-2">
                    <span className="text-brand-lightGray">Adicional:</span>
                    <span className="font-semibold text-white">Borda Caracol</span>
                  </div>
                )}
                {notes && (
                  <div className="border-b border-brand-mediumGray/35 pb-2">
                    <span className="text-brand-lightGray block mb-1">Observações:</span>
                    <span className="text-white italic break-words">{notes}</span>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-brand-lightGray">
                    <span>Pizza Subtotal:</span>
                    <span className="font-mono text-white">R$ {currentTotal.toFixed(2)}</span>
                  </div>
                  {drinksTotal > 0 && (
                    <div className="flex justify-between text-brand-lightGray">
                      <span>Bebidas/Outros:</span>
                      <span className="font-mono text-white">R$ {drinksTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-brand-mediumGray/50 pt-2 text-sm font-bold text-white">
                    <span>Total Geral:</span>
                    <span className="text-brand-red font-mono text-base">
                      R$ {grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Planilha de Seleção de Sabores (Bottom Selection Sheet / Modal Overlay) */}
      {isSheetOpen && activeSectorIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-t-3xl border-t border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            
            {/* Header do Drawer */}
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl font-bold">
                Selecionar sabor para o Sabor {activeSectorIndex + 1}
              </h3>
              <button
                onClick={() => {
                  setIsSheetOpen(false);
                  setSearchQuery("");
                }}
                className="p-1 rounded-full hover:bg-brand-mediumGray text-brand-lightGray hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Input de Busca na Planilha */}
            <div>
              <input
                type="text"
                placeholder="Filtrar por nome ou ingredientes do sabor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none transition-colors"
              />
            </div>

            {/* Grid dos sabores agrupados */}
            <div className="space-y-6">
              {Object.keys(flavorsByCategory).map((catName) => {
                const list = flavorsByCategory[catName];
                if (list.length === 0) return null;
                return (
                  <div key={catName} className="space-y-3">
                    <span className="block text-xxs font-bold uppercase tracking-wider text-brand-red border-b border-brand-mediumGray/50 pb-1.5">
                      {catName}
                    </span>
                    <div className="grid grid-cols-1 gap-3 pt-2">
                      {list.map((flavor) => {
                        // Preço para o tamanho atual selecionado no painel principal
                        let flavorPrice = 0;
                        if (size === "P") flavorPrice = flavor.category.priceP;
                        else if (size === "M") flavorPrice = flavor.category.priceM;
                        else if (size === "G") flavorPrice = flavor.category.priceG;
                        else if (size === "GG") flavorPrice = flavor.category.priceGG;

                        return (
                          <div
                            key={flavor.id}
                            onClick={() => handleSelectFlavor(flavor)}
                            className="group relative ml-8 sm:ml-10 flex items-center justify-between p-3.5 pl-24 sm:pl-28 rounded-xl border border-brand-mediumGray bg-brand-bg hover:border-brand-red/30 transition-all cursor-pointer min-h-[100px]"
                          >
                            {/* Pizza Image - Left side overlapping, clickable to view large */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxImage(getOptimizedImageUrl(flavor.imageUrl));
                              }}
                              className="absolute -left-8 sm:-left-10 top-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-brand-mediumGray bg-brand-darkGray shadow-lg overflow-hidden flex-shrink-0 cursor-pointer group/img"
                              title="Visualizar pizza grande"
                            >
                              <img
                                src={getOptimizedImageUrl(flavor.imageUrl)}
                                alt={flavor.name}
                                className="w-full h-full object-cover group-hover/img:scale-105 group-hover:rotate-6 transition-transform duration-500"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/images/pizza-placeholder.png";
                                }}
                              />
                              {/* Hover Overlay with Eye Icon */}
                              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity duration-300">
                                <svg
                                  className="w-5 h-5 transform scale-75 group-hover/img:scale-100 transition-transform duration-300"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 flex flex-col justify-between min-w-0 space-y-1">
                              <div className="flex justify-between items-start gap-4">
                                <span className="font-serif font-bold text-sm tracking-wide group-hover:text-brand-red transition-colors whitespace-normal break-words">
                                  {flavor.name}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xxs font-mono text-brand-lightGray">
                                    R${flavorPrice}
                                  </span>
                                  {/* Botão de Olhinho para visualizar pizza grande */}
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setLightboxImage(getOptimizedImageUrl(flavor.imageUrl));
                                    }}
                                    className="p-1 rounded-lg bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray/50 text-brand-lightGray hover:text-white transition-colors cursor-pointer"
                                    title="Visualizar pizza grande"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              <p className="text-xxs text-brand-lightGray/80 leading-normal line-clamp-2">
                                {flavor.description}
                              </p>
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
      )}

      {/* Lightbox Modal overlay for large pizza preview */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-2xl w-full bg-brand-darkGray border border-brand-mediumGray rounded-3xl p-3 shadow-2xl overflow-hidden flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute right-4 top-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 hover:scale-105 transition-all text-white font-bold cursor-pointer border border-brand-mediumGray/50"
            >
              ✕
            </button>
            <div className="w-full aspect-square max-h-[70vh] rounded-2xl overflow-hidden bg-brand-bg flex items-center justify-center border border-brand-mediumGray/30 p-4">
              <img
                src={lightboxImage}
                alt="Visualização ampliada da pizza"
                className="max-w-full max-h-full object-contain rounded-xl"
              />
            </div>
            <p className="mt-3 text-xs text-brand-lightGray font-sans italic">
              Clique fora ou no botão fechar para sair
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
