"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";

interface OrderFlavor {
  id: string;
  flavorName: string;
  categoryName?: string;
}

interface OrderTopping {
  id?: string;
  toppingName: string;
  targetType: string;
  flavorName?: string | null;
  slicesCount: number;
  totalSlices: number;
  price: number;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  crustPrice?: number;
  caracolRequested?: boolean;
  flavors?: OrderFlavor[];
  toppings?: OrderTopping[];
}

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  total: number;
  createdAt: string;
  items?: OrderItem[];
}

type FilterTab = "TODOS" | "EM_ANDAMENTO" | "FINALIZADOS" | "CANCELADOS";

export default function MeusPedidosPage() {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [phone, setPhone] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerName, setCustomerName] = useState<string>("Cliente");
  const [favoriteCategory, setFavoriteCategory] = useState<string>("Pizzas");
  const [counts, setCounts] = useState({ total: 0, inProgress: 0, finished: 0, canceled: 0 });
  const [activeTab, setActiveTab] = useState<FilterTab>("TODOS");
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Inicializa dados do localStorage
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const savedPhone = localStorage.getItem("alldelivery_customer_phone") || "";
        const savedName = localStorage.getItem("alldelivery_customer_name") || "";
        if (savedPhone) {
          setPhone(savedPhone);
          setPhoneInput(savedPhone);
        }
        if (savedName) {
          setCustomerName(savedName);
        }
      }
    } catch (e) {
      console.warn("Error reading localStorage:", e);
    }
  }, []);

  // Busca pedidos na API quando o telefone estiver definido ou buscar por IDs locais
  const fetchCustomerOrders = async (targetPhone?: string) => {
    setLoading(true);
    try {
      const activePhone = targetPhone !== undefined ? targetPhone : phone;
      let url = "";

      if (activePhone && activePhone.length >= 8) {
        url = `/api/public/customer-orders?phone=${encodeURIComponent(activePhone)}`;
      } else {
        const savedIds = JSON.parse(localStorage.getItem("alldelivery_customer_orders") || "[]");
        if (savedIds.length > 0) {
          url = `/api/public/customer-orders?ids=${encodeURIComponent(savedIds.join(","))}`;
        }
      }

      if (!url) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setOrders(data.orders || []);
        if (data.customerName) setCustomerName(data.customerName);
        if (data.favoriteCategory) setFavoriteCategory(data.favoriteCategory);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error("Error loading customer orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerOrders();
  }, [phone]);

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phoneInput.replace(/\D/g, "");
    if (clean.length < 8) {
      alert("Por favor, digite um número de WhatsApp válido.");
      return;
    }
    setPhone(clean);
    setIsEditingPhone(false);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("alldelivery_customer_phone", clean);
      }
    } catch (e) {}
    fetchCustomerOrders(clean);
  };

  // Reordenação de pedido (Clone de itens com fatias, adicionais e bordas)
  const handleReorder = (order: Order) => {
    if (!order.items || order.items.length === 0) return;
    setReorderingId(order.id);

    try {
      order.items.forEach((it) => {
        addItem({
          name: it.name,
          isPizza: Boolean(it.isPizza),
          quantity: it.quantity || 1,
          price: (it.totalPrice || 0) / (it.quantity || 1),
          pizzaSize: it.pizzaSize || undefined,
          crustType: it.crustType || undefined,
          crustPrice: it.crustPrice || undefined,
          caracolRequested: it.caracolRequested || undefined,
          flavors: (it.flavors || []).map((f) => ({
            name: f.flavorName,
            categoryName: f.categoryName || "Pizza",
          })),
          toppings: (it.toppings || []).map((t) => ({
            toppingName: t.toppingName,
            targetType: t.targetType,
            flavorName: t.flavorName || null,
            slicesCount: t.slicesCount || 1,
            totalSlices: t.totalSlices || 1,
            price: t.price || 0,
          })),
        });
      });

      router.push("/carrinho");
    } catch (err) {
      console.error("Reorder error:", err);
      alert("Erro ao adicionar itens ao carrinho.");
      setReorderingId(null);
    }
  };

  // Filtra lista de pedidos conforme a aba ativa
  const filteredOrders = orders.filter((o) => {
    if (activeTab === "TODOS") return true;
    if (activeTab === "EM_ANDAMENTO") {
      return o.status === "NOVO" || o.status === "EM_PREPARO" || o.status === "EM_ROTA" || o.status === "PRONTO_RETIRADA";
    }
    if (activeTab === "FINALIZADOS") return o.status === "ENTREGUE";
    if (activeTab === "CANCELADOS") return o.status === "CANCELADO";
    return true;
  });

  // Badge de status no card
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "ENTREGUE":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Entregue</span>;
      case "EM_ROTA":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">Em Rota</span>;
      case "PRONTO_RETIRADA":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Pronto</span>;
      case "EM_PREPARO":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Em Preparo</span>;
      case "NOVO":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">Recebido</span>;
      case "CANCELADO":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">Cancelado</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#090c13] text-neutral-100 py-10 px-4 sm:px-6 flex flex-col items-center selection:bg-amber-400 selection:text-black">
      <div className="w-full max-w-2xl space-y-6">

        {/* Barra superior de navegação */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Voltar ao Cardápio</span>
          </Link>

          {phone && (
            <button
              onClick={() => setIsEditingPhone(!isEditingPhone)}
              className="text-xs text-neutral-400 hover:text-amber-400 transition"
            >
              {isEditingPhone ? "Cancelar" : `WhatsApp: ${phone} (Alterar)`}
            </button>
          )}
        </div>

        {/* Modal/Input para alterar telefone */}
        {(isEditingPhone || (!phone && !loading && orders.length === 0)) && (
          <form
            onSubmit={handleSavePhone}
            className="bg-[#111622] border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-3"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📱</span> Digite seu número de WhatsApp
            </h3>
            <p className="text-xs text-neutral-400">
              Para listar todos os seus pedidos anteriores automaticamente:
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="(DDD) 99999-9999"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-neutral-900 border border-neutral-700 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl transition"
              >
                Buscar Pedidos
              </button>
            </div>
          </form>
        )}

        {/* 1. CARD DE CABEÇALHO DO CLIENTE (IDÊNTICO AO PRINT 1) */}
        <div className="bg-[#111622] border border-neutral-800/80 rounded-2xl p-6 sm:p-7 shadow-2xl relative overflow-hidden space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
            <span>✨</span>
            <span>Área do Cliente</span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Bem-vindo(a), {customerName}!
            </h1>
            <p className="text-sm text-neutral-400 mt-1 font-medium">
              O que vamos pedir hoje?
            </p>
          </div>

          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1a1824] border border-amber-500/30 text-amber-300">
              <span>❤️</span>
              <span>Meu favorito: <strong className="text-amber-400">{favoriteCategory}</strong></span>
            </span>
          </div>
        </div>

        {/* 2. ABAS DE FILTRO COM CONTADORES (IDÊNTICO AO PRINT 1) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab("TODOS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "TODOS"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-[#141925] text-neutral-400 border border-neutral-800 hover:text-white"
            }`}
          >
            <span>Todos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-xxs font-extrabold ${activeTab === "TODOS" ? "bg-black/20 text-black" : "bg-neutral-800 text-neutral-300"}`}>
              {counts.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("EM_ANDAMENTO")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "EM_ANDAMENTO"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-[#141925] text-neutral-400 border border-neutral-800 hover:text-white"
            }`}
          >
            <span>Em andamento</span>
            <span className={`px-1.5 py-0.2 rounded-full text-xxs font-extrabold ${activeTab === "EM_ANDAMENTO" ? "bg-black/20 text-black" : "bg-neutral-800 text-neutral-300"}`}>
              {counts.inProgress}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("FINALIZADOS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "FINALIZADOS"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-[#141925] text-neutral-400 border border-neutral-800 hover:text-white"
            }`}
          >
            <span>Finalizados</span>
            <span className={`px-1.5 py-0.2 rounded-full text-xxs font-extrabold ${activeTab === "FINALIZADOS" ? "bg-black/20 text-black" : "bg-neutral-800 text-neutral-300"}`}>
              {counts.finished}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("CANCELADOS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "CANCELADOS"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-[#141925] text-neutral-400 border border-neutral-800 hover:text-white"
            }`}
          >
            <span>Cancelados</span>
            <span className={`px-1.5 py-0.2 rounded-full text-xxs font-extrabold ${activeTab === "CANCELADOS" ? "bg-black/20 text-black" : "bg-neutral-800 text-neutral-300"}`}>
              {counts.canceled}
            </span>
          </button>
        </div>

        {/* 3. LISTA DE CARDS DE PEDIDOS (IDÊNTICO AO PRINT 1) */}
        {loading ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            Carregando seus pedidos...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-[#111622] border border-neutral-800/80 rounded-2xl p-10 text-center space-y-3 shadow-xl">
            <span className="text-3xl">🍕</span>
            <h3 className="text-base font-bold text-white">Nenhum pedido encontrado nesta aba</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Que tal saborear uma pizza quentinha hoje?
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl transition"
            >
              Fazer um Pedido Agora
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((ord, idx) => {
              const isFirst = idx === 0 && activeTab === "TODOS";
              const formattedDate = new Date(ord.createdAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={ord.id}
                  className={`bg-[#111622] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    isFirst
                      ? "border border-amber-500/70 shadow-lg shadow-amber-500/10"
                      : "border border-neutral-800/80 hover:border-neutral-700"
                  }`}
                >
                  {/* Informações à Esquerda */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base">
                        Pedido #{ord.orderNumber}
                      </span>
                      {renderStatusBadge(ord.status)}
                      {isFirst && (
                        <span className="px-2 py-0.5 rounded-full text-xxs font-bold bg-amber-400 text-black">
                          Mais recente
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{formattedDate}</span>
                      <span>•</span>
                      <span className="capitalize">{ord.type === "DELIVERY" ? "Delivery" : ord.type === "RETIRADA" ? "Retirada" : "Mesa"}</span>
                    </div>
                  </div>

                  {/* Preço e Botões de Ação à Direita */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-neutral-800/50 sm:border-t-0">
                    <span className="font-mono text-base sm:text-lg font-bold text-white whitespace-nowrap">
                      R$ {Number(ord.total || 0).toFixed(2).replace(".", ",")}
                    </span>

                    <button
                      onClick={() => handleReorder(ord)}
                      disabled={reorderingId === ord.id}
                      className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{reorderingId === ord.id ? "Adicionando..." : "Pedir Novamente"}</span>
                    </button>

                    <Link
                      href={`/pedido/${ord.id}`}
                      className="w-9 h-9 rounded-xl bg-[#181f2f] hover:bg-[#20293d] border border-neutral-700/60 flex items-center justify-center text-neutral-300 hover:text-white transition cursor-pointer"
                      title="Ver Acompanhamento"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
