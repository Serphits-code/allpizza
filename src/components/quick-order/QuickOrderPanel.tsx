"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import PizzaSvg from "@/components/client/PizzaSvg";
import FlavorDistribution from "@/components/client/FlavorDistribution";
import ToppingSelector, { ToppingCategory } from "@/components/client/ToppingSelector";
import {
  calcPizzaBasePrice,
  calcCrustPrice,
  calcAllToppingsTotal,
  calcSingleToppingPrice,
  roundCurrency,
  SelectedToppingItem,
} from "@/lib/pricing";

interface PizzaFlavor {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: {
    id?: string;
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
  caracol?: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

interface StandardCategory {
  id: string;
  name: string;
  products: Product[];
}

interface DraftOrderItem {
  tempId: string;
  name: string;
  quantity: number;
  basePrice: number;
  crustPrice: number;
  toppingsPrice: number;
  unitPrice: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  caracolRequested?: boolean;
  flavors?: { flavorName: string; categoryName: string; slices?: number }[];
  toppings?: {
    toppingName: string;
    targetType: string;
    flavorName?: string | null;
    slicesCount: number;
    totalSlices: number;
    price: number;
  }[];
  notes?: string;
}

interface QuickOrderPanelProps {
  comanda: {
    id: string;
    number: number;
    responsibleName?: string | null;
    status?: string;
  };
  onClose: () => void;
  onOrderCreated?: (order: any) => void;
}

const PIZZA_SIZES = [
  { id: "P", label: "Pequena", slices: 4, maxFlavors: 2, desc: "4 fatias • até 2 sabores" },
  { id: "M", label: "Média", slices: 6, maxFlavors: 3, desc: "6 fatias • até 3 sabores" },
  { id: "G", label: "Grande", slices: 8, maxFlavors: 3, desc: "8 fatias • até 3 sabores" },
  { id: "GG", label: "Gigante", slices: 10, maxFlavors: 4, desc: "10 fatias • até 4 sabores" },
];

export default function QuickOrderPanel({
  comanda,
  onClose,
  onOrderCreated,
}: QuickOrderPanelProps) {
  // Estado de carregamento do catálogo
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [flavors, setFlavors] = useState<PizzaFlavor[]>([]);
  const [crusts, setCrusts] = useState<CrustType[]>([]);
  const [standardCategories, setStandardCategories] = useState<StandardCategory[]>([]);
  const [toppingCategories, setToppingCategories] = useState<ToppingCategory[]>([]);

  // Aba ativa: "pizza" ou "products"
  const [activeTab, setActiveTab] = useState<"pizza" | "products">("pizza");

  // Rascunho de itens da mesa
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([]);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [kitchenNotesGlobal, setKitchenNotesGlobal] = useState("");

  // --- ESTADO DO BUILDER DE PIZZA ---
  const [selectedSize, setSelectedSize] = useState<string>("G");
  const [flavorCount, setFlavorCount] = useState<number>(1);
  const [selectedFlavors, setSelectedFlavors] = useState<(PizzaFlavor | null)[]>([null, null, null, null]);
  const [slicesDistribution, setSlicesDistribution] = useState<number[]>([8]);
  const [activeSectorIndex, setActiveSectorIndex] = useState<number>(0);
  const [isFlavorSelectorOpen, setIsFlavorSelectorOpen] = useState<boolean>(false);

  const [selectedCrust, setSelectedCrust] = useState<CrustType | null>(null);
  const [caracolRequested, setCaracolRequested] = useState<boolean>(false);
  const [selectedToppings, setSelectedToppings] = useState<SelectedToppingItem[]>([]);
  const [activeToppingTarget, setActiveToppingTarget] = useState<"FULL" | number>("FULL");
  const [pizzaNotes, setPizzaNotes] = useState<string>("");

  // Filtros de Sabores
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("ALL");
  const [flavorSearch, setFlavorSearch] = useState<string>("");

  // Filtro de Bebidas / Produtos
  const [productCategoryTab, setProductCategoryTab] = useState<string>("ALL");
  const [productSearch, setProductSearch] = useState<string>("");

  // Ref para auto-scroll até o catálogo quando abrir
  const catalogRef = useRef<HTMLDivElement | null>(null);

  // Helper de Fatias Padrão
  const getDefaultSlices = (s: string, count: number): number[] => {
    const total = s === "P" ? 4 : s === "M" ? 6 : s === "G" ? 8 : 10;
    if (count === 1) return [total];
    if (count === 2) {
      const half = Math.floor(total / 2);
      return [half, total - half];
    }
    if (count === 3) {
      if (total === 6) return [2, 2, 2];
      if (total === 8) return [3, 3, 2];
      return [4, 3, 3];
    }
    if (count === 4) {
      return [3, 3, 2, 2];
    }
    return [total];
  };

  // Carrega catálogo unificado
  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch("/api/admin/menu-catalog");
        if (res.ok) {
          const data = await res.json();
          setFlavors(data.flavors || []);
          setCrusts(data.crusts || []);
          setStandardCategories(data.standardCategories || []);
          setToppingCategories(data.toppingCategories || []);
        }
      } catch (err) {
        console.error("Erro ao carregar catálogo para Quick Order:", err);
      } finally {
        setLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, []);

  // Metadados do tamanho atual
  const currentSizeConfig = useMemo(() => {
    return PIZZA_SIZES.find((s) => s.id === selectedSize) || PIZZA_SIZES[2];
  }, [selectedSize]);

  // Categorias únicas de sabores
  const flavorCategories = useMemo(() => {
    const set = new Set<string>();
    flavors.forEach((f) => {
      if (f.category?.name) set.add(f.category.name);
    });
    return Array.from(set);
  }, [flavors]);

  // Sabores filtrados
  const filteredFlavors = useMemo(() => {
    return flavors.filter((f) => {
      const matchCat =
        selectedCategoryTab === "ALL" || f.category?.name === selectedCategoryTab;
      const matchSearch =
        flavorSearch.trim() === "" ||
        f.name.toLowerCase().includes(flavorSearch.toLowerCase()) ||
        f.description?.toLowerCase().includes(flavorSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [flavors, selectedCategoryTab, flavorSearch]);

  // Fatias Totais do tamanho
  const totalSlices = currentSizeConfig.slices;
  const maxFlavorsForSize = currentSizeConfig.maxFlavors;

  // Sabores ativos para o flavorCount atual
  const activeSelectedFlavors = useMemo(() => {
    return selectedFlavors.slice(0, flavorCount);
  }, [selectedFlavors, flavorCount]);

  const filledFlavorsCount = useMemo(() => {
    return activeSelectedFlavors.filter((f) => f !== null).length;
  }, [activeSelectedFlavors]);

  const allFlavorsSelected = filledFlavorsCount === flavorCount && flavorCount > 0;

  // Troca de tamanho
  const handleSizeChange = (newSize: string) => {
    setSelectedSize(newSize);
    const newConfig = PIZZA_SIZES.find((s) => s.id === newSize) || PIZZA_SIZES[2];

    let newCount = flavorCount;
    if (newCount > newConfig.maxFlavors) {
      newCount = newConfig.maxFlavors;
      setFlavorCount(newCount);
    }

    setSlicesDistribution(getDefaultSlices(newSize, newCount));
    setSelectedToppings([]);
    setActiveSectorIndex(0);
  };

  // Troca da quantidade de sabores (1, 2, 3, 4)
  const handleFlavorCountChange = (newCount: number) => {
    if (newCount > maxFlavorsForSize) return;
    setFlavorCount(newCount);
    setSlicesDistribution(getDefaultSlices(selectedSize, newCount));

    // Ajusta o índice ativo para dentro do limite
    if (activeSectorIndex >= newCount) {
      setActiveSectorIndex(newCount - 1);
    }
  };

  // Abre o catálogo de sabores focado no slot clicado (setor da pizza ou botão lateral)
  const handleOpenFlavorSelector = (idx: number) => {
    if (idx < flavorCount) {
      setActiveSectorIndex(idx);
      setIsFlavorSelectorOpen(true);

      setTimeout(() => {
        catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  // Seleciona um sabor
  const handleSelectFlavor = (flavor: PizzaFlavor) => {
    const updated = [...selectedFlavors];
    const targetIdx = activeSectorIndex < flavorCount ? activeSectorIndex : 0;

    updated[targetIdx] = flavor;
    setSelectedFlavors(updated);

    // Se ainda houver algum slot vazio dentro da quantidade configurada, avança para ele
    let nextEmpty = -1;
    for (let i = 0; i < flavorCount; i++) {
      if (i !== targetIdx && updated[i] === null) {
        nextEmpty = i;
        break;
      }
    }

    if (nextEmpty !== -1) {
      setActiveSectorIndex(nextEmpty);
    } else {
      // Todos os sabores foram selecionados! Fecha o catálogo automaticamente
      setTimeout(() => {
        setIsFlavorSelectorOpen(false);
      }, 150);
    }
  };

  // Remove um sabor do setor e reabre a seleção
  const handleRemoveFlavor = (idx: number) => {
    const updated = [...selectedFlavors];
    updated[idx] = null;
    setSelectedFlavors(updated);
    setActiveSectorIndex(idx);
    setIsFlavorSelectorOpen(true);
  };

  // Prepara sabores para o cálculo de preço
  const flavorInputsForPricing = useMemo(() => {
    const valid = activeSelectedFlavors.filter((f): f is PizzaFlavor => f !== null);
    return valid.map((f) => ({
      name: f.name,
      category: {
        priceP: f.category.priceP,
        priceM: f.category.priceM,
        priceG: f.category.priceG,
        priceGG: f.category.priceGG,
      },
    }));
  }, [activeSelectedFlavors]);

  // Cálculo de preços em tempo real da pizza em montagem
  const currentBasePrice = useMemo(() => {
    if (flavorInputsForPricing.length === 0) return 0;
    return calcPizzaBasePrice(selectedSize, flavorInputsForPricing);
  }, [selectedSize, flavorInputsForPricing]);

  const currentCrustPrice = useMemo(() => {
    if (!selectedCrust) return 0;
    return calcCrustPrice(selectedSize, selectedCrust, caracolRequested);
  }, [selectedSize, selectedCrust, caracolRequested]);

  const currentToppingsPrice = useMemo(() => {
    return calcAllToppingsTotal(selectedToppings, selectedSize);
  }, [selectedToppings, selectedSize]);

  const currentPizzaTotal = useMemo(() => {
    return roundCurrency(currentBasePrice + currentCrustPrice + currentToppingsPrice);
  }, [currentBasePrice, currentCrustPrice, currentToppingsPrice]);

  // Adiciona a pizza montada ao rascunho
  const handleAddPizzaToDraft = () => {
    const validFlavors = activeSelectedFlavors.filter((f): f is PizzaFlavor => f !== null);
    if (validFlavors.length === 0) {
      alert("Por favor, selecione ao menos um sabor para a pizza.");
      return;
    }

    if (validFlavors.length < flavorCount) {
      const confirmIncomplete = confirm(
        `Você configurou ${flavorCount} sabores, mas preencheu apenas ${validFlavors.length}. Deseja adicionar mesmo assim?`
      );
      if (!confirmIncomplete) return;
    }

    const flavorNames = validFlavors.map((f) => f.name).join(" / ");
    const isDynamic = selectedSize !== "P" && validFlavors.length > 1;

    let title = `Pizza ${selectedSize} (${flavorNames})`;
    if (isDynamic) {
      const parts = validFlavors.map(
        (f, idx) => `${slicesDistribution[idx] || 2} fts ${f.name}`
      );
      title = `Pizza ${selectedSize} (${parts.join(" / ")})`;
    }

    const itemFlavors = validFlavors.map((f, idx) => ({
      flavorName: f.name,
      categoryName: f.category.name,
      slices: isDynamic ? slicesDistribution[idx] || 2 : totalSlices,
    }));

    const itemToppings = selectedToppings.map((t) => ({
      toppingName: t.topping.name,
      targetType: t.targetType,
      flavorName: t.flavorName || null,
      slicesCount: t.slicesCount,
      totalSlices: t.totalSlices,
      price: calcSingleToppingPrice(
        t.topping,
        selectedSize,
        t.slicesCount,
        t.totalSlices,
        t.quantity || 1
      ),
    }));

    const newItem: DraftOrderItem = {
      tempId: `pizza-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: title,
      quantity: 1,
      basePrice: currentBasePrice,
      crustPrice: currentCrustPrice,
      toppingsPrice: currentToppingsPrice,
      unitPrice: currentPizzaTotal,
      totalPrice: currentPizzaTotal,
      isPizza: true,
      pizzaSize: selectedSize,
      crustType: selectedCrust?.name || null,
      caracolRequested,
      flavors: itemFlavors,
      toppings: itemToppings,
      notes: pizzaNotes.trim() || undefined,
    };

    setDraftItems((prev) => [...prev, newItem]);

    // Reseta builder para próxima pizza
    setSelectedFlavors([null, null, null, null]);
    setSelectedCrust(null);
    setCaracolRequested(false);
    setSelectedToppings([]);
    setPizzaNotes("");
    setActiveSectorIndex(0);
    setFlavorCount(1);
    setSlicesDistribution(getDefaultSlices(selectedSize, 1));
    setIsFlavorSelectorOpen(false);
  };

  // Adiciona produto simples (bebida/sobremesa) ao rascunho
  const handleAddProductToDraft = (prod: Product) => {
    const existingIndex = draftItems.findIndex(
      (item) => !item.isPizza && item.name === prod.name
    );

    if (existingIndex > -1) {
      setDraftItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: roundCurrency(item.unitPrice * (item.quantity + 1)),
              }
            : item
        )
      );
    } else {
      const newItem: DraftOrderItem = {
        tempId: `prod-${prod.id}-${Date.now()}`,
        name: prod.name,
        quantity: 1,
        basePrice: prod.price,
        crustPrice: 0,
        toppingsPrice: 0,
        unitPrice: prod.price,
        totalPrice: prod.price,
        isPizza: false,
        pizzaSize: null,
        crustType: null,
      };
      setDraftItems((prev) => [...prev, newItem]);
    }
  };

  // Remove item do rascunho
  const handleRemoveDraftItem = (tempId: string) => {
    setDraftItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  // Altera quantidade do item do rascunho
  const handleUpdateDraftQuantity = (tempId: string, delta: number) => {
    setDraftItems((prev) =>
      prev
        .map((item) => {
          if (item.tempId === tempId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...item,
              quantity: nextQty,
              totalPrice: roundCurrency(item.unitPrice * nextQty),
            };
          }
          return item;
        })
        .filter((item): item is DraftOrderItem => item !== null)
    );
  };

  // Total do rascunho
  const draftSubtotal = useMemo(() => {
    return roundCurrency(draftItems.reduce((sum, item) => sum + item.totalPrice, 0));
  }, [draftItems]);

  // --- ENVIO DO PEDIDO PARA A COZINHA ---
  const handleSendToKitchen = async () => {
    if (draftItems.length === 0) {
      alert("O pedido precisa conter ao menos um item no rascunho.");
      return;
    }

    setSendingToKitchen(true);

    try {
      const formattedItems = draftItems.map((item) => ({
        name: item.name,
        isPizza: item.isPizza,
        quantity: item.quantity,
        price: item.unitPrice,
        basePrice: item.basePrice,
        pizzaSize: item.pizzaSize,
        crustType: item.crustType,
        crustPrice: item.crustPrice,
        flavors: item.flavors?.map((f) => ({
          name: f.flavorName,
          categoryName: f.categoryName,
        })),
        toppings: item.toppings?.map((t) => ({
          toppingName: t.toppingName,
          targetType: t.targetType,
          flavorName: t.flavorName,
          slicesCount: t.slicesCount,
          totalSlices: t.totalSlices,
          price: t.price,
        })),
        notes: item.notes,
      }));

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COMANDA",
          status: "EM_PREPARO", // Direto para a Cozinha
          comandaId: comanda.id,
          customerName: comanda.responsibleName || `Mesa #${comanda.number}`,
          notes: kitchenNotesGlobal.trim() || undefined,
          items: formattedItems,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (onOrderCreated) {
          onOrderCreated(data.order);
        }
        onClose();
      } else {
        alert(data.error || "Erro ao lançar pedido para a cozinha.");
      }
    } catch (err) {
      console.error("Erro ao enviar pedido:", err);
      alert("Erro de conexão ao enviar pedido para a cozinha.");
    } finally {
      setSendingToKitchen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[94vh] flex flex-col rounded-3xl border border-brand-mediumGray/70 bg-brand-darkGray text-white shadow-2xl overflow-hidden">
        {/* HEADER DO QUICK ORDER PANEL */}
        <div className="flex items-center justify-between border-b border-brand-mediumGray/40 bg-brand-bg/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-red/20 border border-brand-red/40 text-brand-red font-black text-lg">
              #{String(comanda.number).padStart(2, "0")}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold text-white">
                  Lançamento Rápido de Pedido
                </h2>
                <span className="rounded-full bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 text-xxs font-bold text-purple-300 uppercase">
                  Mesa #{comanda.number}
                </span>
              </div>
              <span className="text-xxs text-brand-lightGray">
                {comanda.responsibleName
                  ? `Responsável: ${comanda.responsibleName}`
                  : "Mesa do Salão"} • Envio direto para a Cozinha
              </span>
            </div>
          </div>

          {/* Abas Superiores & Fechar */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl bg-brand-darkGray p-1 border border-brand-mediumGray/60">
              <button
                type="button"
                onClick={() => setActiveTab("pizza")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "pizza"
                    ? "bg-brand-red text-white shadow-md shadow-brand-red/30"
                    : "text-brand-lightGray hover:text-white"
                }`}
              >
                <span>🍕</span> Pizzas Artesanais
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("products")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "products"
                    ? "bg-brand-red text-white shadow-md shadow-brand-red/30"
                    : "text-brand-lightGray hover:text-white"
                }`}
              >
                <span>🥤</span> Bebidas & Produtos
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-darkGray border border-brand-mediumGray hover:border-brand-red text-brand-lightGray hover:text-white transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CORPO PRINCIPAL: 2 COLUNAS (BUILDER / PRODUTOS + RASCUNHO DA MESA) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* COLUNA ESQUERDA: MONTE SUA PIZZA OU CATÁLOGO DE BEBIDAS (COL-8) */}
          <div className="lg:col-span-8 overflow-y-auto p-5 space-y-6 border-b lg:border-b-0 lg:border-r border-brand-mediumGray/40">
            {loadingCatalog ? (
              <div className="py-24 text-center text-xs text-brand-lightGray/60 animate-pulse">
                Carregando catálogo do estabelecimento...
              </div>
            ) : activeTab === "pizza" ? (
              <div className="space-y-6">
                {/* 1. SELETOR DE TAMANHO */}
                <div className="space-y-2">
                  <span className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray block">
                    1. Escolha o Tamanho da Pizza
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {PIZZA_SIZES.map((size) => {
                      const isSelected = selectedSize === size.id;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => handleSizeChange(size.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? "bg-brand-red/15 border-brand-red text-white shadow-lg shadow-brand-red/10 ring-1 ring-brand-red"
                              : "bg-brand-bg/60 border-brand-mediumGray/60 text-brand-lightGray hover:border-brand-lightGray hover:text-white"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black uppercase tracking-wider">
                              {size.label}
                            </span>
                            <span className="text-sm font-bold font-mono">
                              ({size.id})
                            </span>
                          </div>
                          <span className="text-xxxs mt-1 opacity-70 block">
                            {size.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. SELETOR DA QUANTIDADE DE SABORES */}
                <div className="space-y-2">
                  <span className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray block">
                    2. Quantos Sabores Deseja Dividir?
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxFlavorsForSize }).map((_, i) => {
                      const count = i + 1;
                      const isSelected = flavorCount === count;
                      const label =
                        count === 1
                          ? "1 Sabor (Inteira)"
                          : count === 2
                          ? "2 Sabores (Meio a Meio)"
                          : `${count} Sabores`;

                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => handleFlavorCountChange(count)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-brand-red text-white shadow-md shadow-brand-red/30 ring-1 ring-white/20"
                              : "bg-brand-bg/70 border border-brand-mediumGray text-brand-lightGray hover:text-white hover:border-brand-lightGray"
                          }`}
                        >
                          <span>{count === 1 ? "🍕" : "✨"}</span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. VISUALIZADOR DINÂMICO SVG & SLOTS DE SABORES */}
                <div className="rounded-3xl border border-brand-mediumGray/50 bg-brand-bg/80 p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-inner">
                  {/* Pizza SVG Animada */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center py-2">
                    <div className="w-52 h-52 sm:w-60 sm:h-60 aspect-square relative flex items-center justify-center">
                      <PizzaSvg
                        size={selectedSize}
                        flavorCount={flavorCount}
                        selectedFlavors={activeSelectedFlavors}
                        slicesDistribution={slicesDistribution}
                        onSectorClick={handleOpenFlavorSelector}
                        activeSectorIndex={activeSectorIndex}
                        isFullPizzaSelected={false}
                      />
                    </div>
                    <span className="text-xxxs text-brand-lightGray/70 mt-3 text-center block">
                      * Toque na fatia da pizza para definir o sabor
                    </span>
                  </div>

                  {/* Slots de Sabores Selecionados */}
                  <div className="md:col-span-7 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray">
                        Sabores ({filledFlavorsCount}/{flavorCount})
                      </span>
                      {filledFlavorsCount > 0 && (
                        <span className="text-xs font-mono font-bold text-amber-400">
                          Preço Base: R$ {currentBasePrice.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {Array.from({ length: flavorCount }).map((_, idx) => {
                        const flavor = activeSelectedFlavors[idx];
                        const isActive = isFlavorSelectorOpen && activeSectorIndex === idx;

                        return (
                          <div
                            key={idx}
                            onClick={() => handleOpenFlavorSelector(idx)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                              isActive
                                ? "bg-brand-red/15 border-brand-red text-white ring-2 ring-brand-red/50 shadow-lg"
                                : flavor
                                ? "bg-brand-darkGray border-brand-mediumGray text-white hover:border-brand-lightGray"
                                : "bg-brand-darkGray/40 border-dashed border-brand-mediumGray/70 text-brand-lightGray/60 hover:border-brand-red/60 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                  flavor
                                    ? "bg-amber-400 text-black font-bold"
                                    : isActive
                                    ? "bg-brand-red text-white font-bold animate-pulse"
                                    : "bg-brand-mediumGray text-brand-lightGray"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="truncate">
                                <span className="font-bold block truncate text-xs">
                                  {flavor ? flavor.name : `Selecione o ${idx + 1}º Sabor...`}
                                </span>
                                {flavor ? (
                                  <span className="text-xxxs text-brand-lightGray truncate block">
                                    {flavor.category.name}
                                  </span>
                                ) : (
                                  <span className="text-xxxs text-amber-300/80 block font-semibold">
                                    👉 Clique para abrir o cardápio
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {flavor ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenFlavorSelector(idx);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-brand-bg hover:bg-brand-mediumGray text-brand-lightGray hover:text-white text-xxxs font-bold border border-brand-mediumGray"
                                  >
                                    ✏️ Trocar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFlavor(idx);
                                    }}
                                    className="text-brand-lightGray hover:text-rose-400 p-1 text-xs"
                                    title="Remover este sabor"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <span className="text-xxxs text-brand-red font-bold uppercase">
                                  ＋ Escolher
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 4. CATÁLOGO DE SABORES (ABERTO APENAS AO CLICAR EM SELECIONAR) */}
                {isFlavorSelectorOpen && (
                  <div
                    ref={catalogRef}
                    className="space-y-3 rounded-3xl border-2 border-brand-red/60 bg-brand-darkGray p-5 shadow-2xl animate-fadeIn"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-mediumGray/40 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-white text-xxs font-bold">
                          {activeSectorIndex + 1}
                        </span>
                        <div>
                          <h4 className="font-serif text-sm font-bold text-white">
                            Escolha o {activeSectorIndex + 1}º Sabor da Pizza
                          </h4>
                          <span className="text-xxxs text-brand-lightGray">
                            Clique em um sabor para preencher o slot #{activeSectorIndex + 1}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Buscar sabor..."
                          value={flavorSearch}
                          onChange={(e) => setFlavorSearch(e.target.value)}
                          className="rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-1.5 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none w-full sm:w-56"
                        />

                        <button
                          type="button"
                          onClick={() => setIsFlavorSelectorOpen(false)}
                          className="px-3 py-1.5 rounded-lg bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray text-xs text-brand-lightGray hover:text-white font-bold cursor-pointer"
                        >
                          ✕ Fechar
                        </button>
                      </div>
                    </div>

                    {/* Categorias Pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 text-xxs">
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryTab("ALL")}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                          selectedCategoryTab === "ALL"
                            ? "bg-brand-red text-white"
                            : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                        }`}
                      >
                        Todos
                      </button>
                      {flavorCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategoryTab(cat)}
                          className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                            selectedCategoryTab === cat
                              ? "bg-brand-red text-white"
                              : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Grid de Cards de Sabores */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                      {filteredFlavors.map((flavor) => {
                        const isAlreadySelected = activeSelectedFlavors.some(
                          (f) => f?.id === flavor.id
                        );
                        const priceKey = `price${selectedSize}` as
                          | "priceP"
                          | "priceM"
                          | "priceG"
                          | "priceGG";
                        const flavorPrice = flavor.category[priceKey] || 0;

                        return (
                          <div
                            key={flavor.id}
                            onClick={() => handleSelectFlavor(flavor)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 group ${
                              isAlreadySelected
                                ? "bg-amber-500/10 border-amber-500/50 text-white"
                                : "bg-brand-bg/80 border-brand-mediumGray/60 hover:border-brand-red text-brand-lightGray hover:text-white"
                            }`}
                          >
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-xs text-white block group-hover:text-amber-300 transition-colors">
                                  {flavor.name}
                                </span>
                                <span className="text-xxxs font-mono font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                                  R$ {flavorPrice.toFixed(2)}
                                </span>
                              </div>
                              <span className="text-xxxs text-brand-lightGray/70 line-clamp-2 mt-1 block">
                                {flavor.description || "Ingredientes selecionados"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xxxs pt-1.5 border-t border-brand-mediumGray/30">
                              <span className="text-brand-lightGray uppercase font-semibold">
                                {flavor.category.name}
                              </span>
                              <span className="text-brand-red font-bold">
                                {isAlreadySelected ? "✓ Selecionado" : "＋ Escolher"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. DISTRIBUIÇÃO DINÂMICA DE FATIAS (EXIBIDA QUANDO NÃO ESTIVER COM O CATÁLOGO ABERTO E TIVER >1 SABOR) */}
                {!isFlavorSelectorOpen && flavorCount > 1 && (
                  <FlavorDistribution
                    size={selectedSize}
                    flavorCount={flavorCount}
                    selectedFlavors={activeSelectedFlavors}
                    slicesDistribution={slicesDistribution}
                    onChangeSlices={(idx, val) => {
                      const updated = [...slicesDistribution];
                      updated[idx] = val;
                      setSlicesDistribution(updated);
                    }}
                  />
                )}

                {/* 6. BORDA RECHEADA (QUANDO CATÁLOGO ESTIVER FECHADO) */}
                {!isFlavorSelectorOpen && crusts.length > 0 && (
                  <div className="space-y-2 border-t border-brand-mediumGray/40 pt-4">
                    <span className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray block">
                      3. Borda Recheada (Opcional)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCrust(null)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          selectedCrust === null
                            ? "bg-brand-red/15 border-brand-red text-white"
                            : "bg-brand-bg/50 border-brand-mediumGray/50 text-brand-lightGray hover:text-white"
                        }`}
                      >
                        <span className="font-bold block text-xxs">Tradicional</span>
                        <span className="text-xxxs text-brand-lightGray block">Sem custo adicional</span>
                      </button>

                      {crusts.map((crust) => {
                        const isSelected = selectedCrust?.id === crust.id;
                        const crustPrice =
                          selectedSize === "P" || selectedSize === "M"
                            ? crust.pricePM
                            : crust.priceGGG;

                        return (
                          <button
                            key={crust.id}
                            type="button"
                            onClick={() => setSelectedCrust(crust)}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-brand-red/15 border-brand-red text-white"
                                : "bg-brand-bg/50 border-brand-mediumGray/50 text-brand-lightGray hover:text-white"
                            }`}
                          >
                            <span className="font-bold block text-xxs truncate">
                              {crust.name}
                            </span>
                            <span className="text-xxxs font-mono text-amber-400 block font-bold">
                              + R$ {crustPrice.toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedCrust && (
                      <label className="flex items-center gap-2 text-xxs text-brand-lightGray cursor-pointer mt-2">
                        <input
                          type="checkbox"
                          checked={caracolRequested}
                          onChange={(e) => setCaracolRequested(e.target.checked)}
                          className="rounded border-brand-mediumGray text-brand-red focus:ring-0"
                        />
                        <span>Borda formato Caracol (+ R$ 5,00)</span>
                      </label>
                    )}
                  </div>
                )}

                {/* 7. ADICIONAIS / TOPPINGS (QUANDO CATÁLOGO ESTIVER FECHADO) */}
                {!isFlavorSelectorOpen && toppingCategories.length > 0 && (
                  <div className="space-y-2 border-t border-brand-mediumGray/40 pt-4">
                    <span className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray block">
                      4. Adicionais & Ingredientes Extras
                    </span>
                    <ToppingSelector
                      size={selectedSize}
                      totalSlices={totalSlices}
                      flavors={activeSelectedFlavors
                        .filter((f): f is PizzaFlavor => f !== null)
                        .map((f, idx) => ({
                          id: f.id,
                          name: f.name,
                          slices: slicesDistribution[idx] || 2,
                        }))}
                      categories={toppingCategories}
                      selectedToppings={selectedToppings}
                      onChange={setSelectedToppings}
                      activeTarget={activeToppingTarget}
                      onTargetChange={setActiveToppingTarget}
                    />
                  </div>
                )}

                {/* 8. OBSERVAÇÕES E BOTÃO DE ADICIONAR PIZZA */}
                {!isFlavorSelectorOpen && (
                  <div className="space-y-3 border-t border-brand-mediumGray/40 pt-4">
                    <div className="space-y-1.5">
                      <label className="text-xxs font-bold uppercase tracking-wider text-brand-lightGray block">
                        5. Observações desta Pizza
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Massa crocante, cortar em aperitivo, sem cebola..."
                        value={pizzaNotes}
                        onChange={(e) => setPizzaNotes(e.target.value)}
                        className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white focus:border-brand-red focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-between items-center bg-brand-bg p-4 rounded-2xl border border-brand-mediumGray/60">
                      <div>
                        <span className="text-xxs text-brand-lightGray uppercase font-semibold block">
                          Valor desta Pizza
                        </span>
                        <span className="text-2xl font-bold font-mono text-amber-400">
                          R$ {currentPizzaTotal.toFixed(2)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddPizzaToDraft}
                        disabled={filledFlavorsCount === 0}
                        className="px-6 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-xs text-white transition-all cursor-pointer shadow-lg shadow-brand-red/30 disabled:opacity-50 flex items-center gap-2"
                      >
                        <span>＋</span> Adicionar Pizza ao Rascunho
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ABA 2: BEBIDAS, SOBREMESAS & OUTROS PRODUTOS */
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-mediumGray/40 pb-3">
                  <div>
                    <h3 className="font-serif text-base font-bold text-white">
                      Bebidas, Sobremesas & Produtos
                    </h3>
                    <span className="text-xxs text-brand-lightGray">
                      Clique no botão para adicionar 1 unidade ao rascunho
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-1.5 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none w-full sm:w-60"
                  />
                </div>

                {/* Categorias de Produtos */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-xxs">
                  <button
                    type="button"
                    onClick={() => setProductCategoryTab("ALL")}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                      productCategoryTab === "ALL"
                        ? "bg-brand-red text-white"
                        : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                    }`}
                  >
                    Todas Categorias
                  </button>
                  {standardCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setProductCategoryTab(cat.name)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                        productCategoryTab === cat.name
                          ? "bg-brand-red text-white"
                          : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Grid de Produtos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {standardCategories
                    .filter(
                      (cat) =>
                        productCategoryTab === "ALL" || cat.name === productCategoryTab
                    )
                    .flatMap((cat) =>
                      cat.products
                        .filter(
                          (prod) =>
                            productSearch.trim() === "" ||
                            prod.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                            prod.description?.toLowerCase().includes(productSearch.toLowerCase())
                        )
                        .map((prod) => (
                          <div
                            key={prod.id}
                            className="p-4 rounded-2xl bg-brand-bg/70 border border-brand-mediumGray/50 flex flex-col justify-between space-y-3 hover:border-brand-red transition-all shadow-md"
                          >
                            <div className="space-y-1">
                              <span className="font-bold text-xs text-white block">
                                {prod.name}
                              </span>
                              {prod.description && (
                                <span className="text-xxxs text-brand-lightGray/70 line-clamp-2 block">
                                  {prod.description}
                                </span>
                              )}
                              <span className="text-xs font-mono font-bold text-amber-400 block pt-1">
                                R$ {prod.price.toFixed(2)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddProductToDraft(prod)}
                              className="w-full py-2 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-xxs text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                            >
                              <span>＋</span> Adicionar à Mesa
                            </button>
                          </div>
                        ))
                    )}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: RASCUNHO DE ITENS DA MESA & ENVIO À COZINHA (COL-4) */}
          <div className="lg:col-span-4 bg-brand-bg/95 flex flex-col justify-between p-5 overflow-y-auto space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-brand-mediumGray/40 pb-2">
                <div>
                  <h3 className="font-serif text-sm font-bold text-white flex items-center gap-1.5">
                    <span>📋</span> Rascunho da Mesa #{comanda.number}
                  </h3>
                  <span className="text-xxxs text-brand-lightGray">
                    {draftItems.length} {draftItems.length === 1 ? "item" : "itens"} aguardando envio
                  </span>
                </div>

                {draftItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftItems([])}
                    className="text-xxxs text-rose-400 hover:underline cursor-pointer"
                  >
                    Limpar Tudo
                  </button>
                )}
              </div>

              {/* Lista de Itens do Rascunho */}
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {draftItems.map((item) => (
                  <div
                    key={item.tempId}
                    className="p-3 rounded-2xl bg-brand-darkGray border border-brand-mediumGray/60 space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-0.5 flex-1">
                        <span className="font-bold text-white block leading-tight">
                          {item.name}
                        </span>
                        {item.crustType && item.crustType !== "Tradicional" && (
                          <span className="text-xxxs text-amber-300 block">
                            Borda: {item.crustType} {item.caracolRequested ? "(Caracol)" : ""}
                          </span>
                        )}
                        {item.toppings && item.toppings.length > 0 && (
                          <span className="text-xxxs text-emerald-300 block">
                            Adicionais: {item.toppings.map((t) => t.toppingName).join(", ")}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-xxxs text-rose-300 italic block">
                            Obs: &quot;{item.notes}&quot;
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveDraftItem(item.tempId)}
                        className="text-brand-lightGray hover:text-rose-400 p-1 text-xs shrink-0"
                        title="Remover item"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-brand-mediumGray/30">
                      {/* Controles de Quantidade */}
                      <div className="flex items-center gap-2 bg-brand-bg rounded-lg border border-brand-mediumGray/50 px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftQuantity(item.tempId, -1)}
                          className="text-xs font-bold text-brand-lightGray hover:text-white"
                        >
                          -
                        </button>
                        <span className="text-xxs font-mono font-bold text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftQuantity(item.tempId, 1)}
                          className="text-xs font-bold text-brand-lightGray hover:text-white"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-mono font-bold text-amber-400 text-xs">
                        R$ {item.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}

                {draftItems.length === 0 && (
                  <div className="py-12 text-center text-xs text-brand-lightGray/50 border border-dashed border-brand-mediumGray/40 rounded-2xl p-4">
                    <span>🍽️ Nenhum item no rascunho.</span>
                    <span className="block text-xxxs text-brand-lightGray/40 mt-1">
                      Monte pizzas ou adicione bebidas para lançar à cozinha.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* TOTAL & BOTÃO DE ENVIO PARA A COZINHA */}
            <div className="space-y-3 pt-3 border-t border-brand-mediumGray/50">
              {/* Observação Geral do Pedido */}
              <div>
                <label className="text-xxxs font-bold uppercase tracking-wider text-brand-lightGray block mb-1">
                  Observações Gerais da Mesa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entregar bebidas antes, servir com pratos..."
                  value={kitchenNotesGlobal}
                  onChange={(e) => setKitchenNotesGlobal(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-darkGray px-3 py-1.5 text-xs text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-brand-lightGray uppercase">
                  Subtotal do Lançamento
                </span>
                <span className="text-2xl font-mono font-bold text-amber-400">
                  R$ {draftSubtotal.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSendToKitchen}
                disabled={draftItems.length === 0 || sendingToKitchen}
                className="w-full py-3.5 rounded-2xl bg-brand-red hover:bg-brand-redHover font-black text-xs uppercase tracking-wider text-white transition-all cursor-pointer shadow-xl shadow-brand-red/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingToKitchen ? (
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
  );
}
