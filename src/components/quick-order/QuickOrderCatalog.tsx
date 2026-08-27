"use client";

import React, { useState, useMemo } from "react";

export interface QuickOrderCartItem {
  tempId: string;
  name: string;
  quantity: number;
  basePrice: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string;
  crustType?: string;
  crustPrice?: number;
  flavors?: { flavorName: string; categoryName: string }[];
  toppings?: { toppingName: string; price: number }[];
  notes?: string;
}

interface Flavor {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}

interface PizzaCategory {
  id: string;
  name: string;
  priceP: number;
  priceM: number;
  priceG: number;
  priceGG: number;
  flavors: Flavor[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

interface ProductCategory {
  id: string;
  name: string;
  products: Product[];
}

interface QuickOrderCatalogProps {
  pizzaCategories: PizzaCategory[];
  productCategories: ProductCategory[];
  onAddToCart: (item: QuickOrderCartItem) => void;
}

export default function QuickOrderCatalog({
  pizzaCategories,
  productCategories,
  onAddToCart,
}: QuickOrderCatalogProps) {
  const [selectedTab, setSelectedTab] = useState<string>("pizzas");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Estado do Modal de Montagem de Pizza
  const [pizzaModalOpen, setPizzaModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PizzaCategory | null>(null);
  const [pizzaSize, setPizzaSize] = useState<"P" | "M" | "G" | "GG">("G");
  const [selectedFlavors, setSelectedFlavors] = useState<Flavor[]>([]);
  const [flavorSearch, setFlavorSearch] = useState("");
  const [selectedCrust, setSelectedCrust] = useState<string>("Tradicional");
  const [crustPrice, setCrustPrice] = useState<number>(0);
  const [pizzaNotes, setPizzaNotes] = useState<string>("");
  const [pizzaQty, setPizzaQty] = useState<number>(1);

  // Configuração dos tamanhos de Pizza
  const sizeConfig = {
    P: { label: "Pequena (4 fatias)", maxFlavors: 1, key: "priceP" as const },
    M: { label: "Média (6 fatias)", maxFlavors: 2, key: "priceM" as const },
    G: { label: "Grande (8 fatias)", maxFlavors: 3, key: "priceG" as const },
    GG: { label: "Gigante (12 fatias)", maxFlavors: 4, key: "priceGG" as const },
  };

  // Bordas disponíveis
  const crustOptions = [
    { name: "Tradicional (Sem Borda Recheada)", pricePM: 0, priceGGG: 0 },
    { name: "Borda Catupiry Original", pricePM: 6, priceGGG: 9 },
    { name: "Borda Cheddar Cremoso", pricePM: 6, priceGGG: 9 },
    { name: "Borda Chocolate ao Leite", pricePM: 7, priceGGG: 10 },
    { name: "Borda Doce de Leite", pricePM: 7, priceGGG: 10 },
  ];

  // Abre modal para montar pizza
  const handleOpenPizzaModal = (category: PizzaCategory) => {
    setSelectedCategory(category);
    setPizzaSize("G");
    setSelectedFlavors(category.flavors.slice(0, 1));
    setSelectedCrust("Tradicional (Sem Borda Recheada)");
    setCrustPrice(0);
    setPizzaNotes("");
    setPizzaQty(1);
    setFlavorSearch("");
    setPizzaModalOpen(true);
  };

  // Alterna sabor selecionado
  const toggleFlavor = (flavor: Flavor) => {
    const isSelected = selectedFlavors.some((f) => f.id === flavor.id);
    const max = sizeConfig[pizzaSize].maxFlavors;

    if (isSelected) {
      if (selectedFlavors.length > 1) {
        setSelectedFlavors(selectedFlavors.filter((f) => f.id !== flavor.id));
      }
    } else {
      if (selectedFlavors.length < max) {
        setSelectedFlavors([...selectedFlavors, flavor]);
      } else {
        // Substitui o último se exceder
        const next = [...selectedFlavors.slice(0, max - 1), flavor];
        setSelectedFlavors(next);
      }
    }
  };

  // Calcula preço total da pizza
  const currentPizzaPrice = useMemo(() => {
    if (!selectedCategory) return 0;
    const base = selectedCategory[sizeConfig[pizzaSize].key] || 0;
    return (base + crustPrice) * pizzaQty;
  }, [selectedCategory, pizzaSize, crustPrice, pizzaQty]);

  // Confirma e adiciona pizza ao pedido
  const handleConfirmPizza = () => {
    if (!selectedCategory || selectedFlavors.length === 0) return;

    const base = selectedCategory[sizeConfig[pizzaSize].key] || 0;
    const flavorNames = selectedFlavors.map((f) => f.name).join(" / ");
    const itemName = `Pizza ${selectedCategory.name} ${pizzaSize} (${flavorNames})`;

    const cartItem: QuickOrderCartItem = {
      tempId: `pizza-${Date.now()}-${Math.random()}`,
      name: itemName,
      quantity: pizzaQty,
      basePrice: base,
      totalPrice: currentPizzaPrice,
      isPizza: true,
      pizzaSize,
      crustType: selectedCrust,
      crustPrice,
      flavors: selectedFlavors.map((f) => ({
        flavorName: f.name,
        categoryName: selectedCategory.name,
      })),
      notes: pizzaNotes || undefined,
    };

    onAddToCart(cartItem);
    setPizzaModalOpen(false);
  };

  // Adiciona produto comum com 1 toque
  const handleAddProduct = (product: Product) => {
    const cartItem: QuickOrderCartItem = {
      tempId: `prod-${product.id}-${Date.now()}`,
      name: product.name,
      quantity: 1,
      basePrice: product.price,
      totalPrice: product.price,
      isPizza: false,
    };
    onAddToCart(cartItem);
  };

  // Filtro de busca
  const filteredPizzaCategories = useMemo(() => {
    if (!searchQuery) return pizzaCategories;
    const q = searchQuery.toLowerCase();
    return pizzaCategories
      .map((cat) => ({
        ...cat,
        flavors: cat.flavors.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.flavors.length > 0);
  }, [pizzaCategories, searchQuery]);

  const filteredProductCategories = useMemo(() => {
    if (!searchQuery) return productCategories;
    const q = searchQuery.toLowerCase();
    return productCategories
      .map((cat) => ({
        ...cat,
        products: cat.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [productCategories, searchQuery]);

  return (
    <div className="space-y-4 font-sans">
      {/* Barra de Busca Rápida */}
      <div className="relative">
        <input
          type="text"
          placeholder="🔍 Buscar pizza, sabor, refrigerante, cerveja..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-brand-mediumGray bg-brand-darkGray/90 px-4 py-3 text-xs text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-3 text-xs text-brand-lightGray hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Seletor de Categorias / Abas (Scroll Horizontal no Mobile) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSelectedTab("pizzas")}
          className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "pizzas"
              ? "bg-brand-red text-white shadow-md shadow-brand-red/20 font-bold"
              : "bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white"
          }`}
        >
          <span>🍕</span>
          <span>Pizzas</span>
          <span className="text-xxxs opacity-75">({pizzaCategories.length})</span>
        </button>

        {productCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedTab(cat.id)}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedTab === cat.id
                ? "bg-brand-red text-white shadow-md shadow-brand-red/20 font-bold"
                : "bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white"
            }`}
          >
            <span>📦</span>
            <span>{cat.name}</span>
            <span className="text-xxxs opacity-75">({cat.products.length})</span>
          </button>
        ))}
      </div>

      {/* Grid de Itens: Pizzas */}
      {selectedTab === "pizzas" && (
        <div className="space-y-4">
          {filteredPizzaCategories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-2xl border border-brand-mediumGray/70 bg-brand-darkGray/60 p-4 space-y-3 shadow-md"
            >
              <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-2">
                <div>
                  <h4 className="font-serif text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-brand-red">🍕</span> {cat.name}
                  </h4>
                  <span className="text-xxxs text-brand-lightGray">
                    P: R$ {cat.priceP.toFixed(2)} | M: R$ {cat.priceM.toFixed(2)} | G: R${" "}
                    {cat.priceG.toFixed(2)} | GG: R$ {cat.priceGG.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenPizzaModal(cat)}
                  className="px-3 py-1.5 rounded-lg bg-brand-red hover:bg-brand-redHover text-white text-xxs font-bold transition-all cursor-pointer shadow-sm"
                >
                  + Montar Pizza
                </button>
              </div>

              {/* Lista de Sabores da Categoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.flavors.map((flavor) => (
                  <div
                    key={flavor.id}
                    onClick={() => handleOpenPizzaModal(cat)}
                    className="p-2.5 rounded-xl bg-brand-bg/60 border border-brand-mediumGray/40 hover:border-brand-red/50 transition-all cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{flavor.name}</div>
                      <div className="text-xxxs text-brand-lightGray/70 line-clamp-1">
                        {flavor.description}
                      </div>
                    </div>
                    <span className="text-brand-red text-xs font-bold shrink-0">+</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredPizzaCategories.length === 0 && (
            <div className="text-center py-10 text-xs text-brand-lightGray">
              Nenhuma pizza encontrada para a busca.
            </div>
          )}
        </div>
      )}

      {/* Grid de Itens: Produtos Comuns (Bebidas, Porções, etc.) */}
      {selectedTab !== "pizzas" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filteredProductCategories
            .find((c) => c.id === selectedTab)
            ?.products.map((prod) => (
              <div
                key={prod.id}
                className="p-3.5 rounded-xl border border-brand-mediumGray/70 bg-brand-darkGray/80 flex items-center justify-between gap-3 shadow-sm hover:border-brand-red/40 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{prod.name}</div>
                  {prod.description && (
                    <div className="text-xxxs text-brand-lightGray/70 line-clamp-1">
                      {prod.description}
                    </div>
                  )}
                  <div className="text-xs font-mono font-bold text-brand-red mt-1">
                    R$ {prod.price.toFixed(2)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddProduct(prod)}
                  className="px-3 py-2 rounded-xl bg-brand-red/20 hover:bg-brand-red border border-brand-red/40 text-brand-red hover:text-white text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm"
                >
                  + Adicionar
                </button>
              </div>
            ))}
        </div>
      )}

      {/* MODAL DE CUSTOMIZAÇÃO DE PIZZA (Mobile-Optimized) */}
      {pizzaModalOpen && selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-lg bg-brand-darkGray border-t sm:border border-brand-mediumGray rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header do Modal */}
            <div className="p-4 border-b border-brand-mediumGray flex justify-between items-center bg-brand-bg/70">
              <div>
                <h3 className="font-serif text-base font-bold text-white">
                  🍕 Pizza {selectedCategory.name}
                </h3>
                <span className="text-xxs text-brand-lightGray">
                  Escolha o tamanho, sabores e borda
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPizzaModalOpen(false)}
                className="w-8 h-8 rounded-full bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo Rolável */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* 1. Escolha o Tamanho */}
              <div className="space-y-2">
                <label className="block text-xxs font-bold uppercase tracking-wider text-brand-lightGray">
                  1. Tamanho da Pizza
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["P", "M", "G", "GG"] as const).map((size) => {
                    const price = selectedCategory[sizeConfig[size].key];
                    const isSelected = pizzaSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setPizzaSize(size);
                          // Ajusta os sabores se exceder o novo limite
                          const max = sizeConfig[size].maxFlavors;
                          if (selectedFlavors.length > max) {
                            setSelectedFlavors(selectedFlavors.slice(0, max));
                          }
                          // Ajusta o preço da borda
                          const isLarge = size === "G" || size === "GG";
                          const currentCrustObj = crustOptions.find(
                            (c) => c.name === selectedCrust
                          );
                          if (currentCrustObj) {
                            setCrustPrice(
                              isLarge ? currentCrustObj.priceGGG : currentCrustObj.pricePM
                            );
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-brand-red bg-brand-red/10 text-white font-bold"
                            : "border-brand-mediumGray bg-brand-bg text-brand-lightGray hover:border-brand-lightGray/40"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold">{size}</span>
                          <span className="text-xxs font-mono text-brand-red">
                            R$ {price.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xxxs opacity-75 mt-0.5">
                          {sizeConfig[size].label} (até {sizeConfig[size].maxFlavors} sabores)
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Escolha os Sabores */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xxs font-bold uppercase tracking-wider text-brand-lightGray">
                    2. Escolha os Sabores ({selectedFlavors.length}/
                    {sizeConfig[pizzaSize].maxFlavors})
                  </label>
                  <span className="text-xxxs text-brand-lightGray/80">
                    Máx: {sizeConfig[pizzaSize].maxFlavors} sabores
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="Filtrar sabores..."
                  value={flavorSearch}
                  onChange={(e) => setFlavorSearch(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-1.5 text-xxs text-white focus:border-brand-red focus:outline-none"
                />

                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedCategory.flavors
                    .filter((f) => f.name.toLowerCase().includes(flavorSearch.toLowerCase()))
                    .map((flavor) => {
                      const isSelected = selectedFlavors.some((f) => f.id === flavor.id);
                      return (
                        <div
                          key={flavor.id}
                          onClick={() => toggleFlavor(flavor)}
                          className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "border-brand-red bg-brand-red/15 text-white"
                              : "border-brand-mediumGray/50 bg-brand-bg text-brand-lightGray hover:border-brand-lightGray/40"
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-bold text-xs">{flavor.name}</span>
                            <p className="text-xxxs opacity-70 line-clamp-1">{flavor.description}</p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isSelected ? "bg-brand-red text-white" : "border border-brand-mediumGray text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* 3. Borda Recheada */}
              <div className="space-y-2">
                <label className="block text-xxs font-bold uppercase tracking-wider text-brand-lightGray">
                  3. Borda Recheada
                </label>
                <div className="space-y-1">
                  {crustOptions.map((c) => {
                    const isLarge = pizzaSize === "G" || pizzaSize === "GG";
                    const price = isLarge ? c.priceGGG : c.pricePM;
                    const isSelected = selectedCrust === c.name;

                    return (
                      <div
                        key={c.name}
                        onClick={() => {
                          setSelectedCrust(c.name);
                          setCrustPrice(price);
                        }}
                        className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "border-brand-red bg-brand-red/15 text-white"
                            : "border-brand-mediumGray/40 bg-brand-bg text-brand-lightGray"
                        }`}
                      >
                        <span className="text-xxs">{c.name}</span>
                        <span className="text-xxs font-mono font-bold text-brand-red">
                          {price > 0 ? `+ R$ ${price.toFixed(2)}` : "Grátis"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Observações */}
              <div className="space-y-1">
                <label className="block text-xxs font-bold uppercase tracking-wider text-brand-lightGray">
                  Observações para a Cozinha
                </label>
                <input
                  type="text"
                  placeholder="Ex: sem cebola, bem assada, etc."
                  value={pizzaNotes}
                  onChange={(e) => setPizzaNotes(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              {/* 5. Quantidade */}
              <div className="flex items-center justify-between pt-2 border-t border-brand-mediumGray/40">
                <span className="text-xxs font-bold uppercase text-brand-lightGray">Quantidade:</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPizzaQty(Math.max(1, pizzaQty - 1))}
                    className="w-8 h-8 rounded-lg bg-brand-bg border border-brand-mediumGray text-white font-bold flex items-center justify-center hover:bg-brand-mediumGray"
                  >
                    -
                  </button>
                  <span className="text-sm font-mono font-bold text-white">{pizzaQty}</span>
                  <button
                    type="button"
                    onClick={() => setPizzaQty(pizzaQty + 1)}
                    className="w-8 h-8 rounded-lg bg-brand-bg border border-brand-mediumGray text-white font-bold flex items-center justify-center hover:bg-brand-mediumGray"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Footer do Modal com Preço e Botão */}
            <div className="p-4 bg-brand-bg border-t border-brand-mediumGray flex items-center justify-between gap-3">
              <div>
                <span className="text-xxxs uppercase text-brand-lightGray block">Total da Pizza:</span>
                <span className="text-base font-mono font-bold text-white">
                  R$ {currentPizzaPrice.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleConfirmPizza}
                disabled={selectedFlavors.length === 0}
                className="flex-1 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-brand-red/20"
              >
                + Adicionar à Comanda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
