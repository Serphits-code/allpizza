"use client";

import React, { useState, useMemo, useEffect } from "react";
import PizzaBuilder from "@/components/client/PizzaBuilder";
import { getOptimizedImageUrl } from "@/lib/imageHelper";
import type { ToppingCategory } from "@/components/client/ToppingSelector";

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

export interface MesaCartItem {
  id: string;
  name: string;
  isPizza: boolean;
  quantity: number;
  price: number;
  basePrice?: number;
  totalPrice: number;
  pizzaSize?: string;
  flavors?: {
    name?: string;
    flavorName?: string;
    categoryName?: string;
    slices?: number;
  }[];
  crustType?: string;
  crustPrice?: number;
  caracolRequested?: boolean;
  toppings?: {
    toppingId?: string;
    toppingName: string;
    targetType: string;
    flavorName?: string | null;
    slicesCount?: number;
    totalSlices?: number;
    price: number;
    quantity?: number;
  }[];
  notes?: string;
  productId?: string;
}

interface MesaMenuClientProps {
  tableNumber: number;
  pizzaCategories: PizzaCategory[];
  flavors: PizzaFlavor[];
  crustTypes: CrustType[];
  standardCategories: StandardCategory[];
  toppingCategories?: ToppingCategory[];
}

export default function MesaMenuClient({
  tableNumber,
  pizzaCategories,
  flavors,
  crustTypes,
  standardCategories,
  toppingCategories = [],
}: MesaMenuClientProps) {
  // Visão atual dentro da aba de pedidos: "menu" (cardápio estilo delivery), "builder" (montagem dinâmica), "cart" (carrinho da mesa), "success" (pedido enviado)
  const [currentView, setCurrentView] = useState<"menu" | "builder" | "cart" | "success">("menu");
  const [builderFlavorId, setBuilderFlavorId] = useState<string | null>(null);

  // Navegação entre as 2 páginas principais do autoatendimento: "pedidos" vs "conta"
  const [activePage, setActivePage] = useState<"pedidos" | "conta">("pedidos");

  // Estado da conta da mesa em tempo real
  const [accountData, setAccountData] = useState<any | null>(null);
  const [loadingAccount, setLoadingAccount] = useState<boolean>(false);
  const [assistanceMessage, setAssistanceMessage] = useState<string | null>(null);
  const [sendingAssistance, setSendingAssistance] = useState<boolean>(false);

  // Busca conta da mesa em tempo real
  const fetchAccountData = async (silent = false) => {
    if (!silent) setLoadingAccount(true);
    try {
      const res = await fetch(`/api/public/table-account?tableNumber=${tableNumber}&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setAccountData(data);
      }
    } catch (err) {
      console.error("Erro ao carregar conta da mesa:", err);
    } finally {
      if (!silent) setLoadingAccount(false);
    }
  };

  // Carrega conta na inicialização e faz polling periódico quando na aba "conta"
  useEffect(() => {
    fetchAccountData(true);
  }, [tableNumber]);

  useEffect(() => {
    if (activePage === "conta") {
      fetchAccountData(true);
      const interval = setInterval(() => {
        fetchAccountData(true);
      }, 7000);
      return () => clearInterval(interval);
    }
  }, [activePage, tableNumber]);

  // Chamar garçom ou pedir a conta
  const handleCallAssistance = async (type: "BILL" | "WAITER") => {
    if (sendingAssistance) return;
    setSendingAssistance(true);
    try {
      const res = await fetch("/api/public/table-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber, type }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAssistanceMessage(
          type === "BILL"
            ? "💳 Pedido de conta enviado! O garçom foi avisado e trará o fechamento até a sua mesa."
            : "🙋‍♂️ Garçom chamado! Um atendente já está a caminho da sua mesa."
        );
        showToast(type === "BILL" ? "Conta solicitada com sucesso!" : "Garçom chamado com sucesso!");
      } else {
        alert(data.error || "Erro ao solicitar atendimento.");
      }
    } catch (err) {
      console.error("Falha ao chamar atendimento:", err);
      alert("Erro de conexão ao chamar garçom.");
    } finally {
      setSendingAssistance(false);
    }
  };

  // Formatação de data/hora
  const formatOrderTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatOrderDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    } catch {
      return "";
    }
  };

  // Badge de status do pedido
  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "PENDENTE":
      case "NOVO":
        return {
          label: "Aguardando Cozinha",
          emoji: "⏳",
          bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        };
      case "EM_PREPARO":
        return {
          label: "No Forno / Em Preparo",
          emoji: "🔥",
          bg: "bg-orange-500/20 border-orange-500/40 text-orange-400 animate-pulse",
        };
      case "PRONTO":
      case "PRONTO_RETIRADA":
        return {
          label: "Pronto na Cozinha",
          emoji: "🛎️",
          bg: "bg-purple-500/20 border-purple-500/40 text-purple-300 animate-pulse",
        };
      case "COMANDA_MESA":
        return {
          label: "Servido na Mesa",
          emoji: "🍽️",
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        };
      case "ENTREGUE":
        return {
          label: "Conta Quitada & Concluída",
          emoji: "✅",
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        };
      case "FINALIZADO":
        return {
          label: "Finalizado",
          emoji: "✅",
          bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
        };
      case "CANCELADO":
        return {
          label: "Cancelado",
          emoji: "❌",
          bg: "bg-red-500/15 border-red-500/30 text-red-400",
        };
      default:
        return {
          label: status,
          emoji: "📋",
          bg: "bg-brand-mediumGray border-brand-lightGray/20 text-white",
        };
    }
  };

  // Estados do Cardápio
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("todas-pizzas");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Carrinho da Mesa
  const [cart, setCart] = useState<MesaCartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`mesa_cart_${tableNumber}`);
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Salva no localStorage para persistência se a página for recarregada no celular
  useEffect(() => {
    try {
      localStorage.setItem(`mesa_cart_${tableNumber}`, JSON.stringify(cart));
    } catch (e) {
      // Ignora erro de cota
    }
  }, [cart, tableNumber]);

  // Checkout Mesa
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  // Toast automático
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Contagem de itens no carrinho
  const cartTotalItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [cart]);

  // Subtotal monetário do carrinho
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.totalPrice || item.price * (item.quantity || 1)), 0);
  }, [cart]);

  // Switch Principal: Pizzas vs Outros
  const [mainSection, setMainSection] = useState<"pizzas" | "outros">("pizzas");

  // Tabs do Cardápio por seção
  const tabs = useMemo(() => {
    if (mainSection === "pizzas") {
      return [
        { id: "todas-pizzas", name: "Pizzas (Todas)" },
        ...pizzaCategories.map((c) => ({ id: c.name, name: c.name })),
      ];
    } else {
      return [
        { id: "todos-outros", name: "Todos os Produtos" },
        ...standardCategories.map((c) => ({ id: c.name, name: c.name })),
      ];
    }
  }, [mainSection, pizzaCategories, standardCategories]);

  // Filtro de Pizzas
  const filteredPizzas = useMemo(() => {
    if (mainSection !== "pizzas") return [];
    const result: { flavor: any; categoryName: string; prices: any }[] = [];

    for (const cat of pizzaCategories) {
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
  }, [mainSection, pizzaCategories, activeTab, searchQuery]);

  // Filtro de Produtos Avulsos (Bebidas, etc.)
  const filteredProducts = useMemo(() => {
    if (mainSection !== "outros") return [];
    const result: { product: StandardProduct; categoryName: string }[] = [];

    for (const cat of standardCategories) {
      if (activeTab !== "todos-outros" && activeTab !== cat.name) {
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
  }, [mainSection, standardCategories, activeTab, searchQuery]);

  // Adicionar produto avulso direto do cardápio
  const handleAddStandardProduct = (prod: StandardProduct) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => !i.isPizza && i.productId === prod.id);
      if (existingIdx > -1) {
        const copy = [...prev];
        const item = copy[existingIdx];
        const newQty = item.quantity + 1;
        copy[existingIdx] = {
          ...item,
          quantity: newQty,
          totalPrice: newQty * item.price,
        };
        return copy;
      }

      return [
        ...prev,
        {
          id: `prod-${prod.id}-${Date.now()}`,
          name: prod.name,
          isPizza: false,
          quantity: 1,
          price: prod.price,
          basePrice: prod.price,
          totalPrice: prod.price,
          productId: prod.id,
        },
      ];
    });

    showToast(`"${prod.name}" adicionado ao pedido!`);
  };

  // Recebe pizza montada + bebidas selecionadas no construtor dinâmico PizzaBuilder
  const handleAddFromPizzaBuilder = (pizzaItem: any, drinksList: any[]) => {
    setCart((prev) => {
      const newItems: MesaCartItem[] = [...prev];

      // Adiciona a pizza customizada
      newItems.push({
        ...pizzaItem,
        id: `pizza-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      });

      // Adiciona as bebidas selecionadas no passo 4
      drinksList.forEach((drink) => {
        const existingIdx = newItems.findIndex((i) => !i.isPizza && i.productId === drink.productId);
        if (existingIdx > -1) {
          const item = newItems[existingIdx];
          const newQty = item.quantity + drink.quantity;
          newItems[existingIdx] = {
            ...item,
            quantity: newQty,
            totalPrice: newQty * item.price,
          };
        } else {
          newItems.push({
            ...drink,
            id: `drink-${drink.productId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          });
        }
      });

      return newItems;
    });

    showToast("Pizza customizada adicionada ao pedido da mesa!");
    setCurrentView("cart");
  };

  // Altera quantidade no carrinho
  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          return {
            ...i,
            quantity: newQty,
            totalPrice: newQty * i.price,
          };
        }
        return i;
      })
    );
  };

  // Remove item do carrinho
  const handleRemoveItem = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
    showToast("Item removido do pedido.");
  };

  // Esvazia carrinho
  const handleClearCart = () => {
    if (window.confirm("Deseja realmente limpar todos os itens do pedido?")) {
      setCart([]);
      showToast("Pedido esvaziado.");
    }
  };

  // Enviar pedido da mesa para a cozinha
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      alert("O seu carrinho está vazio. Adicione itens antes de enviar.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/table-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber,
          customerName: customerName.trim() || `Mesa ${tableNumber}`,
          notes: orderNotes.trim(),
          items: cart.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            basePrice: item.basePrice || item.price,
            totalPrice: item.totalPrice,
            isPizza: item.isPizza,
            pizzaSize: item.pizzaSize || null,
            crustType: item.crustType || null,
            crustPrice: item.crustPrice || 0,
            flavors: item.flavors?.map((f: any) => ({
              flavorName: f.name || f.flavorName || "Sabor",
              slices: f.slices,
              categoryName: f.categoryName || "Pizza",
            })) || [],
            toppings: item.toppings?.map((t) => ({
              toppingName: t.toppingName,
              targetType: t.targetType,
              flavorName: t.flavorName || null,
              slicesCount: t.slicesCount || 1,
              totalSlices: t.totalSlices || 1,
              price: t.price,
            })) || [],
            notes: item.notes || null,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Erro ao enviar pedido para a cozinha.");
        setSubmitting(false);
        return;
      }

      // Sucesso!
      setCompletedOrder(data.order);
      setCart([]);
      try {
        localStorage.removeItem(`mesa_cart_${tableNumber}`);
      } catch (e) {}
      fetchAccountData(true);
      setCurrentView("success");
    } catch (err) {
      console.error("Falha ao enviar pedido:", err);
      alert("Erro de conexão ao enviar o pedido. Por favor, tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-white font-sans flex flex-col selection:bg-brand-red selection:text-white pb-16">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-brand-red/50 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <span>🍕</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Unificado da Mesa */}
      <header className="sticky top-0 z-40 bg-brand-darkGray/95 backdrop-blur-md border-b border-brand-mediumGray/70 px-4 py-3 flex items-center justify-between shadow-md">
        <div
          onClick={() => {
            setActivePage("pedidos");
            setCurrentView("menu");
          }}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-red to-amber-600 flex items-center justify-center font-bold text-white shadow-lg shadow-brand-red/20 group-hover:scale-105 transition-transform">
            🍕
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">AllDelivery</h1>
            <p className="text-[11px] text-brand-lightGray font-medium">Autoatendimento Salão</p>
          </div>
        </div>

        {/* Badge da Mesa & Botão do Carrinho */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="bg-brand-red/15 border border-brand-red/30 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-full shadow-inner flex items-center gap-1.5 select-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Mesa {tableNumber}
          </span>

          <button
            type="button"
            onClick={() => {
              if (activePage !== "pedidos") {
                setActivePage("pedidos");
                setCurrentView("cart");
              } else {
                setCurrentView(currentView === "cart" ? "menu" : "cart");
              }
            }}
            className="relative bg-brand-bg hover:bg-brand-mediumGray p-2.5 rounded-xl border border-brand-mediumGray transition-all cursor-pointer flex items-center justify-center text-white"
            title="Ver Pedido da Mesa"
          >
            <span className="text-base">🛒</span>
            {cartTotalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-red text-white font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-brand-darkGray animate-pulse">
                {cartTotalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* SWITCHER DAS 2 PÁGINAS PRINCIPAIS: FAZER PEDIDOS vs VER A CONTA */}
      {/* ========================================================================= */}
      <div className="sticky top-[57px] z-30 bg-brand-darkGray/95 backdrop-blur-md border-b border-brand-mediumGray/70 px-4 py-2.5 flex items-center justify-center">
        <div className="grid grid-cols-2 w-full max-w-md bg-brand-bg p-1 rounded-2xl border border-brand-mediumGray shadow-inner gap-1">
          <button
            type="button"
            onClick={() => {
              setActivePage("pedidos");
              if (currentView === "success") {
                setCurrentView("menu");
              }
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activePage === "pedidos"
                ? "bg-brand-red text-white shadow-md shadow-brand-red/30 scale-[1.01]"
                : "text-brand-lightGray hover:text-white"
            }`}
          >
            <span className="text-base">🍕</span>
            <span>Fazer Pedidos</span>
            {cartTotalItems > 0 && (
              <span className="bg-white text-brand-red text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                {cartTotalItems}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActivePage("conta");
              fetchAccountData();
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activePage === "conta"
                ? "bg-brand-red text-white shadow-md shadow-brand-red/30 scale-[1.01]"
                : "text-brand-lightGray hover:text-white"
            }`}
          >
            <span className="text-base">🧾</span>
            <span>Ver a Conta</span>
            {accountData && accountData.orderCount > 0 && (
              <span className="bg-amber-400 text-neutral-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                {accountData.orderCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PÁGINA 1: FAZER NOVOS PEDIDOS (CARDÁPIO, BUILDER, CARRINHO, SUCESSO) */}
      {/* ========================================================================= */}
      {activePage === "pedidos" && (
        <>
          {/* ========================================================================= */}
          {/* VISÃO 1: CARDÁPIO COMPLETO (IDÊNTICO AO MENU DO DELIVERY) */}
          {/* ========================================================================= */}
          {currentView === "menu" && (
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 flex-1 w-full">
          {/* SWITCH RÁPIDO ENTRE PIZZAS E OUTROS PRODUTOS */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1.5 rounded-2xl bg-brand-darkGray border border-brand-mediumGray shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setMainSection("pizzas");
                  setActiveTab("todas-pizzas");
                }}
                className={`flex items-center gap-2.5 px-6 sm:px-8 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  mainSection === "pizzas"
                    ? "bg-brand-red text-white shadow-lg shadow-brand-red/35 scale-[1.02]"
                    : "text-brand-lightGray hover:text-white"
                }`}
              >
                <span className="text-base sm:text-lg">🍕</span>
                <span>Pizzas</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMainSection("outros");
                  setActiveTab("todos-outros");
                }}
                className={`flex items-center gap-2.5 px-6 sm:px-8 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  mainSection === "outros"
                    ? "bg-brand-red text-white shadow-lg shadow-brand-red/35 scale-[1.02]"
                    : "text-brand-lightGray hover:text-white"
                }`}
              >
                <span className="text-base sm:text-lg">🥤</span>
                <span>Outros (Bebidas & Produtos)</span>
              </button>
            </div>
          </div>

          {/* Banner Superior Idêntico ao Delivery (Apenas na aba Pizzas) */}
          {mainSection === "pizzas" && (
            <section className="mb-10 overflow-hidden rounded-3xl border border-brand-mediumGray bg-brand-darkGray relative p-6 sm:p-10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-lg text-center md:text-left">
              <span className="inline-block rounded-full bg-brand-red/10 border border-brand-red/20 px-3 py-1 text-xs font-semibold tracking-wider text-brand-red uppercase">
                Inovação Exclusiva
              </span>
              <h2 className="text-2xl sm:text-4xl font-bold leading-tight text-white tracking-tight">
                Monte sua Pizza Fracionada
              </h2>
              <p className="text-xs sm:text-sm text-brand-lightGray leading-relaxed">
                Divida sua pizza em até 3 sabores diferentes e pague apenas o valor proporcional à categoria de maior valor monetário. Escolha bordas, adicionais e monte como preferir!
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBuilderFlavorId(null);
                    setCurrentView("builder");
                  }}
                  className="inline-block rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-bold text-xs sm:text-sm transition-all text-white cursor-pointer shadow-lg shadow-brand-red/25 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Criar Pizza Personalizada
                </button>
              </div>
            </div>

            {/* Representação visual circular animada */}
            <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-brand-mediumGray bg-brand-bg flex items-center justify-center overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 border-4 border-dashed border-brand-mediumGray/50 rounded-full animate-[spin_60s_linear_infinite]" />
              <div className="absolute w-full h-px bg-brand-mediumGray/50 transform rotate-45" />
              <div className="absolute w-full h-px bg-brand-mediumGray/50 transform -rotate-45" />
              <div className="z-10 text-center space-y-1 select-none">
                <span className="text-xs text-brand-lightGray">Sabores Divididos</span>
                <div className="text-xl font-bold text-brand-red">1/2 ou 1/3</div>
              </div>
            </div>
          </section>
          )}

          {/* Caixa de Busca */}
          <section className="mb-8 max-w-xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder={
                  mainSection === "pizzas"
                    ? "Buscar por sabores de pizzas..."
                    : "Buscar por bebidas, sobremesas ou porções..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-brand-mediumGray bg-brand-darkGray px-5 py-3.5 pl-12 text-sm text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none transition-colors"
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

          {/* Abas de Categorias (Filtro Horizontal) */}
          <section className="mb-10 overflow-x-auto scrollbar-none flex space-x-2.5 pb-2 border-b border-brand-mediumGray/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-4 py-2 text-xs sm:text-sm font-semibold rounded-full transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-brand-red text-white shadow-md shadow-brand-red/20"
                    : "bg-brand-darkGray text-brand-lightGray hover:text-white"
                }`}
              >
                {tab.name}
              </button>
            ))}
          </section>

          {/* Listagem de Pizzas (Card idêntico ao delivery com fotos sem sobreposição) */}
          {mainSection === "pizzas" && filteredPizzas.length > 0 && (
            <section className="mb-12">
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-6 border-l-4 border-brand-red pl-3 text-white">
                Sabores de Pizzas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-4">
                {filteredPizzas.map(({ flavor, categoryName, prices }) => (
                  <div
                    key={flavor.id}
                    className="group relative ml-10 sm:ml-12 flex items-center rounded-2xl border border-brand-mediumGray bg-brand-darkGray hover:border-brand-red/40 transition-all p-4 pl-24 sm:pl-28 shadow-lg min-h-[150px]"
                  >
                    {/* Imagem circular da Pizza com zoom e clique */}
                    <div
                      onClick={() => setLightboxImage(getOptimizedImageUrl(flavor.imageUrl))}
                      className="absolute -left-10 sm:-left-12 top-1/2 -translate-y-1/2 w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-brand-mediumGray bg-brand-bg shadow-xl overflow-hidden flex-shrink-0 cursor-pointer group/img"
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
                      {/* Hover Overlay com Ícone de Olho */}
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity duration-300">
                        <svg
                          className="w-6 h-6 transform scale-75 group-hover/img:scale-100 transition-transform duration-300"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Conteúdo do Card */}
                    <div className="flex-1 flex flex-col justify-between min-w-0 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-3">
                          <h4 className="font-serif text-base sm:text-lg font-bold tracking-wide text-white group-hover:text-brand-red transition-colors whitespace-normal break-words">
                            {flavor.name}
                          </h4>
                          {/* Botão de Olhinho */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLightboxImage(getOptimizedImageUrl(flavor.imageUrl));
                            }}
                            className="p-1.5 rounded-lg bg-brand-bg/60 hover:bg-brand-mediumGray border border-brand-mediumGray/50 text-brand-lightGray hover:text-white transition-colors cursor-pointer flex-shrink-0"
                            title="Visualizar pizza grande"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-xs text-brand-lightGray line-clamp-2 leading-relaxed">
                          {flavor.description}
                        </p>

                        {/* Tabela de Preços */}
                        <div className="grid grid-cols-4 gap-1 text-center py-1 bg-brand-bg/50 rounded-lg text-[10px] sm:text-xs font-mono text-brand-lightGray border border-brand-mediumGray/35">
                          <div>P: R${Number(prices.P || 0).toFixed(2)}</div>
                          <div>M: R${Number(prices.M || 0).toFixed(2)}</div>
                          <div>G: R${Number(prices.G || 0).toFixed(2)}</div>
                          <div>GG: R${Number(prices.GG || 0).toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-4 border-t border-brand-mediumGray/30">
                        <span className="text-[10px] text-brand-lightGray/70 italic">Preço inteiro acima</span>
                        <button
                          type="button"
                          onClick={() => {
                            setBuilderFlavorId(flavor.id);
                            setCurrentView("builder");
                          }}
                          className="rounded-lg bg-brand-red hover:bg-brand-redHover px-3.5 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer text-center shadow-md shadow-brand-red/20 hover:scale-105 active:scale-95"
                        >
                          Montar Pizza
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Listagem de Bebidas e Outros Produtos */}
          {mainSection === "outros" && filteredProducts.length > 0 && (
            <section className="mb-12">
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-6 border-l-4 border-brand-red pl-3 text-white">
                Bebidas & Outros Produtos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredProducts.map(({ product, categoryName }) => (
                  <div
                    key={product.id}
                    className="group flex flex-col justify-between rounded-2xl border border-brand-mediumGray bg-brand-darkGray hover:border-brand-red/40 transition-all p-5 shadow-lg min-h-[140px]"
                  >
                    <div className="flex gap-4 items-start">
                      {product.imageUrl && (
                        <div className="w-16 h-16 rounded-xl bg-brand-bg border border-brand-mediumGray overflow-hidden flex-shrink-0">
                          <img
                            src={getOptimizedImageUrl(product.imageUrl)}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/images/pizza-placeholder.png";
                            }}
                          />
                        </div>
                      )}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-brand-red transition-colors truncate">
                            {product.name}
                          </h4>
                          <span className="text-[10px] font-semibold uppercase tracking-wider bg-brand-bg border border-brand-mediumGray text-brand-lightGray px-2 py-0.5 rounded-md flex-shrink-0">
                            {categoryName}
                          </span>
                        </div>
                        <p className="text-xs text-brand-lightGray line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>

                        <div className="text-base sm:text-lg font-bold font-mono text-brand-red">
                          R$ {Number(product.price || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-2 border-t border-brand-mediumGray/40">
                      <button
                        type="button"
                        onClick={() => handleAddStandardProduct(product)}
                        className="w-full rounded-xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray py-2 text-xs font-bold text-white transition-colors cursor-pointer text-center hover:border-brand-red hover:text-brand-red"
                      >
                        + Adicionar ao Pedido da Mesa
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
              <p className="text-brand-lightGray text-sm">Nenhum produto correspondente à sua pesquisa foi encontrado.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setActiveTab("todas-pizzas");
                }}
                className="mt-4 text-xs font-bold text-brand-red hover:underline"
              >
                Limpar Busca
              </button>
            </div>
          )}

          {/* Floating Bottom Bar quando o carrinho tiver itens */}
          {cartTotalItems > 0 && (
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40">
              <div
                onClick={() => setCurrentView("cart")}
                className="bg-brand-red hover:bg-brand-redHover text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between cursor-pointer border border-brand-red/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <span className="bg-white/20 text-white font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                    {cartTotalItems}
                  </span>
                  <div>
                    <div className="text-xs font-bold leading-tight">Ver Pedido da Mesa {tableNumber}</div>
                    <div className="text-[11px] text-white/80 font-mono">
                      Subtotal: R$ {cartSubtotal.toFixed(2)}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider bg-black/30 px-3 py-1.5 rounded-xl flex items-center gap-1">
                  <span>Concluir</span>
                  <span>→</span>
                </span>
              </div>
            </div>
          )}

          {/* Lightbox Modal de Imagem Ampliada */}
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
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="absolute right-4 top-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 transition-all text-white font-bold cursor-pointer border border-brand-mediumGray/50"
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
                <p className="mt-3 text-xs text-brand-lightGray italic">Clique fora ou no botão fechar para sair</p>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* VISÃO 2: CONSTRUTOR DINÂMICO DE PIZZA (100% IDÊNTICO AO DELIVERY) */}
      {/* ========================================================================= */}
      {currentView === "builder" && (
        <div className="flex-1 w-full">
          <PizzaBuilder
            flavors={flavors}
            crusts={crustTypes}
            standardCategories={standardCategories}
            toppingCategories={toppingCategories}
            tableNumber={tableNumber}
            initialFlavorId={builderFlavorId}
            cartCount={cartTotalItems}
            hideDrinksStep={true}
            onCancel={() => setCurrentView("menu")}
            onOpenCart={() => setCurrentView("cart")}
            onFinishOrder={(pizzaItem, drinksList) => {
              handleAddFromPizzaBuilder(pizzaItem, drinksList);
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISÃO 3: CARRINHO E CHECKOUT DIRETO PARA A MESA */}
      {/* ========================================================================= */}
      {currentView === "cart" && (
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 flex-1 w-full">
          {/* Header do Carrinho */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-brand-mediumGray/50">
            <button
              type="button"
              onClick={() => setCurrentView("menu")}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-lightGray hover:text-white transition-colors cursor-pointer"
            >
              <span>←</span> Continuar Escolhendo
            </button>
            <span className="text-xs font-bold text-brand-red bg-brand-red/10 border border-brand-red/20 px-3 py-1 rounded-full">
              Mesa {tableNumber}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6 border-l-4 border-brand-red pl-3 text-white">
            Pedido da Mesa {tableNumber}
          </h2>

          {cart.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-brand-mediumGray bg-brand-darkGray/30 rounded-3xl space-y-5">
              <span className="text-4xl block">🛒</span>
              <p className="text-brand-lightGray text-sm">Seu pedido está vazio no momento.</p>
              <div>
                <button
                  type="button"
                  onClick={() => setCurrentView("menu")}
                  className="rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-3 font-bold text-xs text-white transition-colors cursor-pointer shadow-lg shadow-brand-red/20"
                >
                  Explorar Cardápio da Mesa
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Lista de Itens do Pedido */}
              <div className="lg:col-span-8 space-y-4">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 sm:p-5 gap-4 hover:border-brand-mediumGray/80 transition-colors shadow-lg"
                  >
                    <div className="space-y-1.5 max-w-md">
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-brand-red">
                        {item.isPizza ? "Pizza Customizada" : "Acompanhamento"}
                      </span>
                      <h3 className="text-base font-bold text-white leading-snug">{item.name}</h3>

                      {item.isPizza && (
                        <div className="text-xs text-brand-lightGray space-y-1 pt-1 border-t border-brand-mediumGray/30">
                          <p>
                            Tamanho: <span className="text-white font-mono font-bold">{item.pizzaSize}</span>
                          </p>
                          <p>
                            Borda: <span className="text-white">{item.crustType || "Tradicional"}</span>
                            {item.caracolRequested && (
                              <span className="text-brand-red ml-1 font-bold">(Caracol +R$ 5,00)</span>
                            )}
                          </p>
                          {item.toppings && item.toppings.length > 0 && (
                            <div className="text-xs text-amber-300/90 pt-1 space-y-0.5">
                              <span className="font-semibold block text-brand-gold">Adicionais:</span>
                              {item.toppings.map((top, tIdx) => (
                                <p key={tIdx} className="leading-tight">
                                  + {top.toppingName} (
                                  {top.targetType === "FULL" ? "Pizza Inteira" : top.flavorName}) -{" "}
                                  <span className="font-mono text-white">R$ {Number(top.price || 0).toFixed(2)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                          {item.notes && <p className="italic text-brand-red/80 pt-1">Obs: &quot;{item.notes}&quot;</p>}
                        </div>
                      )}

                      {!item.isPizza && item.notes && (
                        <p className="text-xs italic text-brand-red/80">Obs: &quot;{item.notes}&quot;</p>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t border-brand-mediumGray/30 sm:border-t-0">
                      {/* Preço Unitário / Total */}
                      <span className="font-mono text-base font-bold text-brand-red">
                        R$ {Number(item.totalPrice || item.price * item.quantity).toFixed(2)}
                      </span>

                      {/* Controle de Quantidade */}
                      <div className="flex items-center space-x-2 bg-brand-bg rounded-xl p-1 border border-brand-mediumGray">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-brand-lightGray hover:text-white rounded-lg hover:bg-brand-mediumGray transition-colors cursor-pointer font-bold text-xs"
                        >
                          -
                        </button>
                        <span className="w-7 text-center font-mono text-xs font-bold text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-brand-lightGray hover:text-white rounded-lg hover:bg-brand-mediumGray transition-colors cursor-pointer font-bold text-xs"
                        >
                          +
                        </button>
                      </div>

                      {/* Remover Item */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-xs text-brand-lightGray/60 hover:text-brand-red transition-colors cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}

                {/* Ações Auxiliares */}
                <div className="flex items-center justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setCurrentView("menu")}
                    className="text-xs font-semibold text-brand-lightGray hover:text-white transition-colors cursor-pointer"
                  >
                    ← Adicionar mais itens ao pedido
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="text-xs font-semibold text-brand-lightGray/50 hover:text-brand-red transition-colors cursor-pointer"
                  >
                    Esvaziar Pedido
                  </button>
                </div>
              </div>

              {/* Painel de Confirmação & Envio para a Cozinha */}
              <div className="lg:col-span-4 rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-2xl">
                <h3 className="text-lg font-bold border-b border-brand-mediumGray/50 pb-3 text-white">
                  Resumo do Pedido
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-brand-lightGray">
                    <span>Mesa do Pedido</span>
                    <span className="font-bold text-amber-300 font-mono">Mesa {tableNumber}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-brand-lightGray">
                    <span>Quantidade de Itens</span>
                    <span className="font-bold text-white font-mono">{cartTotalItems}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-brand-lightGray">
                    <span>Subtotal</span>
                    <span className="font-mono text-white font-bold">R$ {cartSubtotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Campos opcionais de identificação na mesa */}
                <div className="space-y-3 border-t border-brand-mediumGray/50 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-lightGray mb-1">
                      Seu Nome ou Apelido (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder={`Ex: João (Mesa ${tableNumber})`}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-lightGray mb-1">
                      Observação para a Cozinha (opcional)
                    </label>
                    <textarea
                      placeholder="Ex: Trazer pratos extras, pizza bem tostada..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-brand-mediumGray/50 pt-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Total do Pedido</span>
                  <span className="font-mono text-2xl font-bold text-brand-red">
                    R$ {cartSubtotal.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitOrder}
                  className="w-full rounded-2xl bg-brand-red hover:bg-brand-redHover py-4 text-center text-sm font-bold text-white transition-all cursor-pointer shadow-xl shadow-brand-red/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Enviando para a Cozinha...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      <span>Enviar Pedido para a Cozinha</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-brand-lightGray/70 text-center leading-relaxed">
                  Ao confirmar, o pedido entra imediatamente na fila de preparo da Cozinha e é registrado na comanda da sua mesa. O pagamento é realizado ao fechar a conta.
                </p>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* VISÃO 4: PEDIDO ENVIADO COM SUCESSO */}
      {/* ========================================================================= */}
      {currentView === "success" && completedOrder && (
        <main className="mx-auto max-w-lg px-4 py-12 flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-full rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-8 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-3xl mx-auto shadow-inner animate-bounce">
              ✓
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
                Pedido Confirmado!
              </span>
              <h2 className="text-2xl font-bold text-white">Enviado para a Cozinha!</h2>
              <p className="text-xs text-brand-lightGray">
                Seu pedido foi recebido e já está entrando no forno.
              </p>
            </div>

            <div className="rounded-2xl bg-brand-bg p-4 border border-brand-mediumGray space-y-2 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-brand-lightGray">Número do Pedido:</span>
                <span className="font-bold text-white">#{completedOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-brand-lightGray">Mesa:</span>
                <span className="font-bold text-amber-300">Mesa {tableNumber}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-brand-lightGray">Status:</span>
                <span className="font-bold text-emerald-400">EM PREPARO</span>
              </div>
              <div className="flex justify-between font-mono border-t border-brand-mediumGray/40 pt-2">
                <span className="text-brand-lightGray">Total:</span>
                <span className="font-bold text-brand-red text-sm">
                  R$ {Number(completedOrder.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  setCurrentView("menu");
                }}
                className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-xs font-bold text-white transition-all cursor-pointer shadow-lg shadow-brand-red/20"
              >
                Fazer Novo Pedido para a Mesa {tableNumber}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  setActivePage("conta");
                  fetchAccountData();
                }}
                className="w-full rounded-xl bg-brand-darkGray hover:bg-brand-mediumGray border border-brand-mediumGray py-3 text-xs font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md hover:border-amber-400"
              >
                <span>🧾</span>
                <span>Acompanhar na Minha Conta</span>
              </button>
            </div>
          </div>
        </main>
      )}
        </>
      )}

      {/* ========================================================================= */}
      {/* PÁGINA 2: VER A CONTA DA MESA (CONSUMO, PEDIDOS, STATUS, PAGAMENTOS) */}
      {/* ========================================================================= */}
      {activePage === "conta" && (
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 flex-1 w-full space-y-6">
          {/* Card de Identificação da Mesa & Status */}
          <div className="rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-5 sm:p-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-brand-red">
                    Autoatendimento
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-mediumGray"></span>
                  <span className="text-xs font-semibold text-brand-lightGray font-mono">
                    Comanda #{accountData?.comandaId ? accountData.comandaId.slice(-4) : tableNumber}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Conta da Mesa {tableNumber}
                </h2>
                <p className="text-xs text-brand-lightGray">
                  Responsável:{" "}
                  <strong className="text-white">
                    {accountData?.responsibleName || `Mesa ${tableNumber}`}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => fetchAccountData()}
                  disabled={loadingAccount}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray text-xs font-semibold text-brand-lightGray hover:text-white transition-all cursor-pointer shadow-md"
                  title="Atualizar conta agora"
                >
                  <span className={loadingAccount ? "animate-spin" : ""}>🔄</span>
                  <span>{loadingAccount ? "Atualizando..." : "Atualizar Conta"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Banner de Feedback de Chamada de Garçom / Pedido de Conta */}
          {assistanceMessage && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-200 flex items-center justify-between gap-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🔔</span>
                <span className="font-medium">{assistanceMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setAssistanceMessage(null)}
                className="text-amber-300 hover:text-white font-bold text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Grid com 3 Métricas Financeiras */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Consumo Total */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-brand-lightGray text-xs font-semibold mb-2">
                <span>Consumo Total</span>
                <span className="text-base">🍽️</span>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-white">
                  R$ {Number(accountData?.totalConsumption || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-brand-lightGray/80 mt-1">
                  {accountData?.orderCount || 0} pedido(s) realizados
                </div>
              </div>
            </div>

            {/* Total Pago / Baixas */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-brand-lightGray text-xs font-semibold mb-2">
                <span>Total Pago (Adiantamentos)</span>
                <span className="text-base">💰</span>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  R$ {Number(accountData?.totalPaid || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-brand-lightGray/80 mt-1">
                  {accountData?.payments?.length || 0} baixa(s) registrada(s)
                </div>
              </div>
            </div>

            {/* Saldo Restante */}
            <div
              className={`rounded-2xl border p-4 shadow-lg flex flex-col justify-between ${
                (accountData?.remainingBalance || 0) === 0 && (accountData?.totalConsumption || 0) > 0
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-brand-red/40 bg-brand-darkGray"
              }`}
            >
              <div className="flex items-center justify-between text-brand-lightGray text-xs font-semibold mb-2">
                <span>Saldo Restante a Pagar</span>
                <span className="text-base">💳</span>
              </div>
              <div>
                <div
                  className={`text-2xl font-bold font-mono ${
                    (accountData?.remainingBalance || 0) === 0 && (accountData?.totalConsumption || 0) > 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  R$ {Number(accountData?.remainingBalance || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-brand-lightGray/80 mt-1">
                  {(accountData?.remainingBalance || 0) === 0 && (accountData?.totalConsumption || 0) > 0
                    ? "Conta 100% quitada! 🎉"
                    : "Valor a acertar ao fechar"}
                </div>
              </div>
            </div>
          </div>

          {/* Painel de Ações Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={sendingAssistance}
              onClick={() => handleCallAssistance("WAITER")}
              className="rounded-2xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray p-3.5 text-xs sm:text-sm font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md hover:border-amber-400 hover:text-amber-300 active:scale-95 disabled:opacity-50"
            >
              <span>🙋‍♂️</span>
              <span>Chamar Garçom</span>
            </button>

            <button
              type="button"
              disabled={sendingAssistance}
              onClick={() => handleCallAssistance("BILL")}
              className="rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 p-3.5 text-xs sm:text-sm font-bold text-amber-300 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50"
            >
              <span>💳</span>
              <span>Pedir a Conta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActivePage("pedidos");
                setCurrentView("menu");
              }}
              className="rounded-2xl bg-brand-red hover:bg-brand-redHover p-3.5 text-xs sm:text-sm font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-brand-red/25 active:scale-95"
            >
              <span>🍕</span>
              <span>Fazer Mais Pedidos</span>
            </button>
          </div>

          {/* Histórico Completo de Pedidos */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white border-l-4 border-brand-red pl-3">
                Pedidos Realizados na Mesa ({accountData?.orders?.length || 0})
              </h3>
              <span className="text-[11px] text-brand-lightGray hidden sm:inline">
                Atualização automática
              </span>
            </div>

            {(!accountData?.orders || accountData.orders.length === 0) ? (
              <div className="text-center py-12 rounded-3xl border border-dashed border-brand-mediumGray bg-brand-darkGray/30 space-y-4 p-6">
                <span className="text-4xl block">📋</span>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Nenhum pedido realizado nesta mesa ainda</h4>
                  <p className="text-xs text-brand-lightGray max-w-sm mx-auto">
                    Abra o cardápio para montar suas pizzas exclusivas ou escolher bebidas refrescantes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivePage("pedidos");
                    setCurrentView("menu");
                  }}
                  className="rounded-xl bg-brand-red hover:bg-brand-redHover px-6 py-2.5 text-xs font-bold text-white transition-all cursor-pointer shadow-lg shadow-brand-red/20"
                >
                  Explorar Cardápio Agora
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {accountData.orders.map((order: any) => {
                  const badge = getOrderStatusBadge(order.status);
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 sm:p-5 shadow-lg space-y-3"
                    >
                      {/* Header do Pedido */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-mediumGray/50">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-sm font-extrabold text-white">
                            Pedido #{order.orderNumber}
                          </span>
                          <span className="text-xs text-brand-lightGray font-mono">
                            {formatOrderTime(order.createdAt)}
                          </span>
                        </div>

                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${badge.bg}`}
                        >
                          <span>{badge.emoji}</span>
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      {/* Itens do Pedido */}
                      <div className="space-y-2.5">
                        {order.items?.map((it: any) => (
                          <div key={it.id} className="text-xs flex items-start justify-between gap-3">
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <div className="font-semibold text-white">
                                <span className="font-mono text-brand-red mr-1.5">{it.quantity}x</span>
                                <span>{it.name}</span>
                              </div>

                              {it.isPizza && (
                                <div className="text-[11px] text-brand-lightGray space-y-0.5 pl-5">
                                  {it.pizzaSize && (
                                    <div>
                                      Tamanho: <strong className="text-white">{it.pizzaSize}</strong>
                                      {it.crustType && (
                                        <span className="ml-2">
                                          • Borda: <strong className="text-white">{it.crustType}</strong>
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {it.flavors && Array.isArray(it.flavors) && it.flavors.length > 0 && (
                                    <div>
                                      <span className="text-white/80">Sabores: </span>
                                      {it.flavors.map((f: any, fIdx: number) => (
                                        <span key={f.id || fIdx}>
                                          {f.flavorName}
                                          {f.slices ? ` (${f.slices} fat.)` : ""}
                                          {fIdx < it.flavors.length - 1 ? ", " : ""}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {it.toppings && Array.isArray(it.toppings) && it.toppings.length > 0 && (
                                    <div className="text-amber-300/90">
                                      <span>Adicionais: </span>
                                      {it.toppings.map((top: any, tIdx: number) => (
                                        <span key={top.id || tIdx} className="mr-1.5">
                                          +{top.toppingName}
                                          {top.price ? ` (R$ ${Number(top.price).toFixed(2)})` : ""}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="font-mono text-xs font-bold text-brand-lightGray whitespace-nowrap">
                              R$ {Number(it.totalPrice || it.basePrice * it.quantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="text-xs italic text-brand-lightGray bg-brand-bg/50 p-2.5 rounded-xl border border-brand-mediumGray/30">
                          Obs: &quot;{order.notes}&quot;
                        </div>
                      )}

                      {/* Subtotal do Pedido */}
                      <div className="pt-2 border-t border-brand-mediumGray/40 flex items-center justify-between text-xs font-bold">
                        <span className="text-brand-lightGray">Subtotal deste pedido</span>
                        <span className="font-mono text-white text-sm">
                          R$ {Number(order.total || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Histórico de Baixas / Pagamentos Registrados */}
          {accountData?.payments && accountData.payments.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white border-l-4 border-emerald-500 pl-3">
                Baixas & Pagamentos Registrados ({accountData.payments.length})
              </h3>
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 space-y-2">
                {accountData.payments.map((p: any, idx: number) => (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between text-xs py-2 border-b border-brand-mediumGray/40 last:border-b-0"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-white flex items-center gap-2">
                        <span>{p.method === "PIX" ? "📱" : p.method === "DINHEIRO" ? "💵" : "💳"}</span>
                        <span>{p.method}</span>
                      </div>
                      <div className="text-[11px] text-brand-lightGray font-mono">
                        {formatOrderTime(p.createdAt)} {formatOrderDate(p.createdAt)}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-emerald-400 text-sm">
                      R$ {Number(p.amount || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer Informativo */}
          <div className="rounded-2xl bg-brand-darkGray/60 border border-brand-mediumGray/40 p-4 text-center text-xs text-brand-lightGray/80 space-y-1">
            <p>
              Ao encerrar seu consumo, você pode clicar em <strong>&quot;Pedir a Conta&quot;</strong> para que o garçom traga a máquina até você, ou se dirigir diretamente ao caixa informando a <strong>Mesa {tableNumber}</strong>.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
