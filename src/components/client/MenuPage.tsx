"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useCartStore } from "@/stores/cartStore";

interface PizzaCategory {
  id: string;
  name: string;
  priceP: number;
  priceM: number;
  priceG: number;
  priceGG: number;
  flavors: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
  }[];
}

interface StandardCategory {
  id: string;
  name: string;
  products: {
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
  }[];
}

interface MenuPageProps {
  pizzaCategories: PizzaCategory[];
  standardCategories: StandardCategory[];
}

export default function MenuPage({ pizzaCategories, standardCategories }: MenuPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("todas-pizzas"); // "todas-pizzas" | Category Names
  const addItem = useCartStore((state) => state.addItem);

  // Tabs de Categoria no topo
  const tabs = useMemo(() => {
    const list = [
      { id: "todas-pizzas", name: "Pizzas (Todas)" },
      ...pizzaCategories.map((c) => ({ id: c.name, name: c.name })),
      ...standardCategories.map((c) => ({ id: c.name, name: c.name })),
    ];
    return list;
  }, [pizzaCategories, standardCategories]);

  // Filtro de pizzas
  const filteredPizzas = useMemo(() => {
    const result: { flavor: any; categoryName: string; prices: any }[] = [];
    
    for (const cat of pizzaCategories) {
      // Se não for a aba "todas-pizzas" e não for a aba específica desse sabor, ignora
      if (activeTab !== "todas-pizzas" && activeTab !== cat.name) {
        continue;
      }
      
      for (const flavor of cat.flavors) {
        const matchesSearch =
          flavor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          flavor.description.toLowerCase().includes(searchQuery.toLowerCase());
          
        if (matchesSearch) {
          result.push({
            flavor,
            categoryName: cat.name,
            prices: {
              P: cat.priceP,
              M: cat.priceM,
              G: cat.priceG,
              GG: cat.priceGG,
            },
          });
        }
      }
    }
    return result;
  }, [pizzaCategories, activeTab, searchQuery]);

  // Filtro de produtos avulsos
  const filteredProducts = useMemo(() => {
    const result: { product: any; categoryName: string }[] = [];

    for (const cat of standardCategories) {
      if (activeTab !== "todas-pizzas" && activeTab !== cat.name) {
        continue;
      }

      for (const product of cat.products) {
        const matchesSearch =
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.description.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesSearch) {
          result.push({
            product,
            categoryName: cat.name,
          });
        }
      }
    }
    return result;
  }, [standardCategories, activeTab, searchQuery]);

  // Ação de adicionar produto comum ao carrinho
  const handleAddProduct = (product: any) => {
    addItem({
      name: product.name,
      isPizza: false,
      quantity: 1,
      price: product.price,
      productId: product.id,
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Banner Superior com Chamada para o Construtor */}
      <section className="mb-12 overflow-hidden rounded-3xl border border-brand-mediumGray bg-brand-darkGray relative p-8 sm:p-12 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="space-y-4 max-w-lg text-center md:text-left">
          <span className="inline-block rounded-full bg-brand-red/10 border border-brand-red/20 px-3 py-1 text-xs font-semibold tracking-wider text-brand-red uppercase">
            Inovação Exclusiva
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold leading-tight">
            Monte sua Pizza Fracionada
          </h2>
          <p className="text-sm text-brand-lightGray">
            Divida sua pizza em até 3 sabores diferentes e pague apenas o valor proporcional à categoria de maior valor monetário. Escolha bordas e monte como preferir!
          </p>
          <div className="pt-2">
            <Link
              href="/monte-sua-pizza"
              className="inline-block rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-semibold text-sm transition-colors text-white cursor-pointer"
            >
              Criar Pizza Personalizada
            </Link>
          </div>
        </div>
        
        {/* Renderização de representação simbólica da pizza fracionada */}
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border border-brand-mediumGray bg-brand-bg flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 border-4 border-dashed border-brand-mediumGray/50 rounded-full animate-[spin_60s_linear_infinite]" />
          <div className="absolute w-full h-px bg-brand-mediumGray/50 transform rotate-45" />
          <div className="absolute w-full h-px bg-brand-mediumGray/50 transform -rotate-45" />
          <div className="z-10 text-center space-y-1">
            <span className="font-serif text-xs italic text-brand-lightGray">Sabores Divididos</span>
            <div className="text-xl font-bold text-brand-red">1/2 ou 1/3</div>
          </div>
        </div>
      </section>

      {/* Caixa de Busca */}
      <section className="mb-8 max-w-xl mx-auto">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por sabores, bebidas ou acompanhamentos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-brand-mediumGray bg-brand-darkGray px-5 py-4 pl-12 text-sm text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none transition-colors"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-lightGray/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </section>

      {/* Categorias (Filtro Horizontal) */}
      <section className="mb-10 overflow-x-auto scrollbar-none flex space-x-3 pb-2 border-b border-brand-mediumGray/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer ${
              activeTab === tab.id
                ? "bg-brand-red text-white"
                : "bg-brand-darkGray text-brand-lightGray hover:text-white"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </section>

      {/* Listagem de Pizzas */}
      {filteredPizzas.length > 0 && (
        <section className="mb-12">
          <h3 className="font-serif text-2xl font-bold tracking-wide mb-6 border-l-4 border-brand-red pl-3">
            Sabores de Pizzas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-4">
            {filteredPizzas.map(({ flavor, categoryName, prices }) => (
              <div
                key={flavor.id}
                className="group relative ml-6 sm:ml-8 flex items-center rounded-2xl border border-brand-mediumGray bg-brand-darkGray hover:border-brand-red/30 transition-all p-4 pl-20 sm:pl-24 shadow-lg min-h-[140px]"
              >
                {/* Pizza Image - Left side overlapping */}
                <div className="absolute -left-6 sm:-left-8 top-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-brand-mediumGray bg-brand-bg shadow-xl overflow-hidden flex-shrink-0">
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
                <div className="flex-1 flex flex-col justify-between min-w-0 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-serif text-base sm:text-lg font-bold tracking-wide group-hover:text-brand-red transition-colors truncate">
                        {flavor.name}
                      </h4>
                      <span className="text-xxs font-semibold uppercase tracking-wider bg-brand-bg border border-brand-mediumGray text-brand-lightGray px-2 py-0.5 rounded-md flex-shrink-0">
                        {categoryName}
                      </span>
                    </div>
                    <p className="text-xs text-brand-lightGray line-clamp-2 leading-normal">
                      {flavor.description}
                    </p>
                    
                    {/* Tabela de Preços Simples no card */}
                    <div className="grid grid-cols-4 gap-1 text-center py-1 bg-brand-bg/50 rounded-lg text-xxs font-mono text-brand-lightGray border border-brand-mediumGray/35">
                      <div>P: R${prices.P}</div>
                      <div>M: R${prices.M}</div>
                      <div>G: R${prices.G}</div>
                      <div>GG: R${prices.GG}</div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-4 border-t border-brand-mediumGray/30">
                    <span className="text-[10px] text-brand-lightGray/70 font-sans italic">
                      Preço inteiro acima
                    </span>
                    <Link
                      href={`/monte-sua-pizza?flavorId=${flavor.id}`}
                      className="rounded-lg bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray px-3 py-1.5 text-xs font-semibold text-white transition-colors text-center"
                    >
                      Montar Pizza
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Listagem de Bebidas e Produtos Avulsos */}
      {filteredProducts.length > 0 && (
        <section className="mb-12">
          <h3 className="font-serif text-2xl font-bold tracking-wide mb-6 border-l-4 border-brand-red pl-3">
            Bebidas e Outros
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProducts.map(({ product, categoryName }) => (
              <div
                key={product.id}
                className="group flex flex-col justify-between rounded-2xl border border-brand-mediumGray bg-brand-darkGray hover:border-brand-red/30 transition-all p-5 shadow-lg min-h-[140px]"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-serif text-lg font-bold tracking-wide group-hover:text-brand-red transition-colors">
                      {product.name}
                    </h4>
                    <span className="text-xxs font-semibold uppercase tracking-wider bg-brand-bg border border-brand-mediumGray text-brand-lightGray px-2.5 py-1 rounded-md">
                      {categoryName}
                    </span>
                  </div>
                  <p className="text-xs text-brand-lightGray line-clamp-2 h-8">
                    {product.description}
                  </p>
                  
                  <div className="text-lg font-bold font-mono text-brand-red">
                    R$ {product.price.toFixed(2)}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={() => handleAddProduct(product)}
                    className="w-full rounded-lg bg-brand-red hover:bg-brand-redHover py-2 text-xs font-semibold text-white transition-colors cursor-pointer text-center"
                  >
                    Adicionar ao Carrinho
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mensagem de Vazio */}
      {filteredPizzas.length === 0 && filteredProducts.length === 0 && (
        <div className="text-center py-20 border border-dashed border-brand-mediumGray rounded-3xl bg-brand-darkGray/30">
          <p className="text-brand-lightGray text-sm">
            Nenhum produto correspondente à sua pesquisa foi encontrado.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveTab("todas-pizzas");
            }}
            className="mt-4 text-xs font-semibold text-brand-red hover:underline"
          >
            Limpar Busca
          </button>
        </div>
      )}
    </main>
  );
}
