"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";
import { calcPizzaItemTotal, FlavorInput, CrustInput } from "@/lib/pricing";
import PizzaSvg from "./PizzaSvg";
import FlavorDistribution from "./FlavorDistribution";

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

interface PizzaBuilderProps {
  flavors: PizzaFlavor[];
  crusts: CrustType[];
}

export default function PizzaBuilder({ flavors, crusts }: PizzaBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((state) => state.addItem);

  // Estados de Configuração da Pizza
  const [size, setSize] = useState<string>("G"); // P, M, G, GG
  const [flavorCount, setFlavorCount] = useState<number>(1); // 1, 2, 3
  const [selectedFlavors, setSelectedFlavors] = useState<(PizzaFlavor | null)[]>([null, null, null]);
  const [selectedCrust, setSelectedCrust] = useState<CrustType | null>(null);
  const [caracolRequested, setCaracolRequested] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

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

  // Adicionar ao Carrinho
  const handleAddToCart = () => {
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
      notes,
    });

    router.push("/carrinho");
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 relative">
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
              <span className="text-xxs text-brand-lightGray font-sans uppercase tracking-wider">Subtotal do Item</span>
              <div className="text-2xl font-bold font-mono text-brand-red">
                R$ {currentTotal.toFixed(2)}
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              className="rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3.5 font-bold text-sm text-white transition-colors cursor-pointer"
            >
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      </div>

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
                            className="group relative ml-6 flex items-center justify-between p-3.5 pl-20 sm:pl-24 rounded-xl border border-brand-mediumGray bg-brand-bg hover:border-brand-red/30 transition-all cursor-pointer min-h-[90px]"
                          >
                            {/* Pizza Image - Left side overlapping */}
                            <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-brand-mediumGray bg-brand-darkGray shadow-lg overflow-hidden flex-shrink-0">
                              <img
                                src={flavor.imageUrl || "/images/pizza-placeholder.png"}
                                alt={flavor.name}
                                className="w-full h-full object-cover group-hover:rotate-12 transition-transform duration-500"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/images/pizza-placeholder.png";
                                }}
                              />
                            </div>

                            {/* Content */}
                            <div className="flex-1 flex flex-col justify-between min-w-0 space-y-1">
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-serif font-bold text-sm tracking-wide group-hover:text-brand-red transition-colors truncate">
                                  {flavor.name}
                                </span>
                                <span className="text-xxs font-mono text-brand-lightGray flex-shrink-0">
                                  R${flavorPrice}
                                </span>
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
    </main>
  );
}
