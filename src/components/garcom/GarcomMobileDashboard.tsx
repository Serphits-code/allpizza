"use client";

import React, { useState, useEffect, useMemo } from "react";
import { signOut } from "next-auth/react";
import GarcomOrderBuilder from "./GarcomOrderBuilder";
import { playNotificationSound } from "@/lib/sound";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  basePrice: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  notes?: string | null;
  flavors?: { flavorName: string; categoryName: string }[];
  toppings?: { toppingName: string; price: number }[];
}

interface OrderDetail {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  notes?: string | null;
  createdAt: string | Date;
  items: OrderItem[];
}

interface ComandaItem {
  id: string;
  number: number;
  status: "LIVRE" | "OCUPADA" | "INATIVA";
  responsibleName?: string | null;
  active: boolean;
  activeOrdersCount: number;
  readyOrdersCount: number;
  currentConsumption: number;
  orders?: any[];
}

interface GarcomMobileDashboardProps {
  initialComandas: ComandaItem[];
  flavors: any[];
  crusts: any[];
  standardCategories: any[];
  toppingCategories: any[];
  companyName?: string;
  companyLogo?: string;
  userName?: string;
}

export default function GarcomMobileDashboard({
  initialComandas,
  flavors,
  crusts,
  standardCategories,
  toppingCategories = [],
  companyName = "AllPizza",
  companyLogo,
  userName = "Garçom",
}: GarcomMobileDashboardProps) {
  // Navegação: "tables" | "ready-alerts" | "builder"
  const [activeTab, setActiveTab] = useState<"tables" | "ready-alerts" | "builder">("tables");

  // Dados das Comandas / Mesas
  const [comandas, setComandas] = useState<ComandaItem[]>(initialComandas);
  const [selectedComanda, setSelectedComanda] = useState<ComandaItem | null>(null);
  const [tableDetailsModalOpen, setTableDetailsModalOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"ALL" | "LIVRE" | "OCUPADA" | "READY">("ALL");

  // Densidade de visualização das Mesas: "compact" (2 colunas) ou "ultra" (3 colunas)
  const [gridDensity, setGridDensity] = useState<"compact" | "ultra">("compact");

  // Mesa Ativa para Lançar Pedido com PizzaBuilder
  const [builderMesa, setBuilderMesa] = useState<ComandaItem | null>(null);

  // Modal de Seleção de Mesa para Novo Pedido
  const [tablePickerModalOpen, setTablePickerModalOpen] = useState<boolean>(false);
  const [tablePickerSearch, setTablePickerSearch] = useState<string>("");

  // Modal de Abertura / Edição de Responsável da Mesa
  const [editMesaModalOpen, setEditMesaModalOpen] = useState(false);
  const [mesaToEdit, setMesaToEdit] = useState<ComandaItem | null>(null);
  const [newResponsibleName, setNewResponsibleName] = useState("");
  const [savingResponsible, setSavingResponsible] = useState(false);

  // Notificações e Alertas em Tempo Real
  const [readyToast, setReadyToast] = useState<{
    id: string;
    tableNumber: number;
    orderNumber: number;
    text: string;
  } | null>(null);
  const [orderCreatedSuccessToast, setOrderCreatedSuccessToast] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(true);

  // Toca som de alerta nativo (sem rede externa)
  const playAlertSound = () => {
    playNotificationSound();
  };

  // Busca dados atualizados das mesas
  const fetchMesas = async () => {
    try {
      const res = await fetch("/api/garcom/mesas");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.comandas) {
        setComandas(data.comandas);

        // Atualiza a comanda selecionada se estiver aberta
        if (selectedComanda) {
          const updated = data.comandas.find((c: ComandaItem) => c.id === selectedComanda.id);
          if (updated) setSelectedComanda(updated);
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar mesas:", err);
    }
  };

  // Polling em background a cada 5 segundos + SSE em tempo real
  useEffect(() => {
    fetchMesas();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchMesas();
    }, 20000);

    const eventSource = new EventSource("/api/print/events");

    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);

    // Quando a cozinha marca um pedido de mesa como PRONTO_RETIRADA
    eventSource.addEventListener("table_order_ready", (event: any) => {
      try {
        const order = JSON.parse(event.data);
        console.log("[SSE Garçom] Pedido pronto para servir:", order);

        const tableNum =
          order.comanda?.number ||
          (order.customerName?.match(/\d+/) ? order.customerName.match(/\d+/)[0] : "—");

        playAlertSound();
        setReadyToast({
          id: order.id,
          tableNumber: Number(tableNum) || 0,
          orderNumber: order.orderNumber,
          text: `Mesa #${tableNum}: Pedido #${order.orderNumber} está PRONTO na cozinha!`,
        });

        fetchMesas();
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("order_created", () => fetchMesas());
    eventSource.addEventListener("order_updated", () => fetchMesas());

    const onFocus = () => {
      fetchMesas();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      eventSource.close();
    };
  }, []);

  // Lista de todos os pedidos prontos para servir no salão
  const readyOrdersList = useMemo(() => {
    const list: { comanda: ComandaItem; order: OrderDetail }[] = [];
    for (const c of comandas) {
      if (c.orders) {
        for (const o of c.orders) {
          if (o.status === "PRONTO_RETIRADA") {
            list.push({ comanda: c, order: o });
          }
        }
      }
    }
    return list;
  }, [comandas]);

  // Filtro de mesas
  const filteredComandas = useMemo(() => {
    return comandas.filter((c) => {
      const matchesSearch =
        tableSearch === "" ||
        String(c.number).includes(tableSearch) ||
        (c.responsibleName &&
          c.responsibleName.toLowerCase().includes(tableSearch.toLowerCase()));

      let matchesFilter = true;
      if (tableFilter === "LIVRE") matchesFilter = c.status === "LIVRE";
      if (tableFilter === "OCUPADA") matchesFilter = c.status === "OCUPADA";
      if (tableFilter === "READY") matchesFilter = c.readyOrdersCount > 0;

      return matchesSearch && matchesFilter;
    });
  }, [comandas, tableSearch, tableFilter]);

  // Iniciar lançamento de pedido para uma mesa específica
  const handleStartOrderForMesa = (mesa: ComandaItem) => {
    setBuilderMesa(mesa);
    setActiveTab("builder");
  };

  // Marca pedido de mesa como concluído / servido (mantém em COMANDA_MESA até fechamento da conta)
  const handleMarkOrderServed = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMANDA_MESA" }),
      });
      if (res.ok) {
        fetchMesas();
        if (readyToast?.id === orderId) {
          setReadyToast(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Salva / Abre mesa com nome do responsável
  const handleSaveResponsible = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mesaToEdit) return;

    setSavingResponsible(true);
    try {
      const res = await fetch("/api/garcom/mesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comandaId: mesaToEdit.id,
          responsibleName: newResponsibleName,
          action: "OPEN",
        }),
      });

      if (res.ok) {
        setEditMesaModalOpen(false);
        setMesaToEdit(null);
        fetchMesas();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingResponsible(false);
    }
  };

  // Abre visualização de detalhes do consumo da mesa
  const handleOpenTableDetails = (mesa: ComandaItem) => {
    setSelectedComanda(mesa);
    setTableDetailsModalOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand-bg text-white selection:bg-brand-red selection:text-white pb-20 sm:pb-6">
      {/* HEADER MOBILE DO GARÇOM */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-mediumGray/70 bg-brand-darkGray/95 px-3 py-2 sm:py-2.5 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-red/20 border border-brand-red/40 text-brand-red font-black text-sm">
            🍽️
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-serif text-xs sm:text-sm font-bold text-white leading-tight">
                {companyName} • Garçom
              </h1>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
                title={sseConnected ? "Conectado em tempo real" : "Reconectando..."}
              />
            </div>
            <span className="text-[10px] text-brand-lightGray block leading-none mt-0.5">
              Operador: <strong className="text-white">{userName}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Botão de Alertas Prontos */}
          <button
            type="button"
            onClick={() => setActiveTab("ready-alerts")}
            className={`relative px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              readyOrdersList.length > 0
                ? "bg-purple-600/25 border-purple-500 text-purple-300 animate-pulse"
                : "bg-brand-bg border-brand-mediumGray/60 text-brand-lightGray"
            }`}
          >
            <span>🛎️</span>
            <span>Prontos</span>
            {readyOrdersList.length > 0 && (
              <span className="w-3.5 h-3.5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[9px] font-bold font-mono">
                {readyOrdersList.length}
              </span>
            )}
          </button>

          {/* Sair */}
          <button
            type="button"
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.href = "/admin/login";
            }}
            className="p-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray/60 text-brand-lightGray hover:text-white text-xs cursor-pointer"
            title="Sair"
          >
            🚪
          </button>
        </div>
      </header>

      {/* TOAST FLUTUANTE DE PEDIDO PRONTO */}
      {readyToast && (
        <div className="fixed top-16 inset-x-3 z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-purple-950/95 border-2 border-purple-400 p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-white backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl animate-bounce">🍽️</span>
              <div>
                <span className="text-xs font-bold block text-purple-200">
                  {readyToast.text}
                </span>
                <span className="text-xxxs text-purple-300">
                  Pronto na cozinha para servir!
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleMarkOrderServed(readyToast.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xxs cursor-pointer shadow-md"
              >
                ✓ Servido
              </button>
              <button
                type="button"
                onClick={() => setReadyToast(null)}
                className="w-6 h-6 rounded-full bg-purple-900 text-purple-200 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE SUCESSO DE PEDIDO ENVIADO */}
      {orderCreatedSuccessToast && (
        <div className="fixed top-16 inset-x-3 z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-emerald-950 border-2 border-emerald-500 p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-white backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🔥</span>
              <div>
                <span className="text-xs font-bold block text-emerald-200">
                  {orderCreatedSuccessToast}
                </span>
                <span className="text-xxxs text-emerald-300">
                  Pedido já está na tela da Cozinha no Kanban!
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOrderCreatedSuccessToast(null)}
              className="w-6 h-6 rounded-full bg-emerald-900 text-emerald-200 flex items-center justify-center text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 w-full">
        {/* ABA 1: LISTA DE MESAS & COMANDAS */}
        {activeTab === "tables" && (
          <div className="p-2.5 sm:p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Barra de Busca e Filtros de Mesa */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar mesa ou cliente..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray/70 bg-brand-darkGray px-3 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch("")}
                    className="absolute right-3 top-2 text-xs text-brand-lightGray hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filtros Rápidos & Seletor de Densidade */}
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5 text-xxs font-bold">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTableFilter("ALL")}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${
                      tableFilter === "ALL"
                        ? "bg-brand-red text-white shadow-sm"
                        : "bg-brand-darkGray border border-brand-mediumGray/60 text-brand-lightGray"
                    }`}
                  >
                    Todas ({comandas.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableFilter("LIVRE")}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${
                      tableFilter === "LIVRE"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-brand-darkGray border border-brand-mediumGray/60 text-brand-lightGray"
                    }`}
                  >
                    Livres ({comandas.filter((c) => c.status === "LIVRE").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableFilter("OCUPADA")}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${
                      tableFilter === "OCUPADA"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-brand-darkGray border border-brand-mediumGray/60 text-brand-lightGray"
                    }`}
                  >
                    Ocupadas ({comandas.filter((c) => c.status === "OCUPADA").length})
                  </button>
                  {readyOrdersList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTableFilter("READY")}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[11px] ${
                        tableFilter === "READY"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "bg-purple-950/40 border border-purple-500/50 text-purple-300"
                      }`}
                    >
                      <span>🛎️</span> Prontos ({readyOrdersList.length})
                    </button>
                  )}
                </div>

                {/* Alternador de 2 vs 3 Colunas no Mobile */}
                <button
                  type="button"
                  onClick={() => setGridDensity(gridDensity === "compact" ? "ultra" : "compact")}
                  className="px-2 py-1 rounded-lg bg-brand-darkGray border border-brand-mediumGray/70 text-brand-lightGray hover:text-white text-[10px] font-mono shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Alternar tamanho das mesas (2 ou 3 colunas)"
                >
                  <span>{gridDensity === "compact" ? "▦ 3 Col" : "⊞ 2 Col"}</span>
                </button>
              </div>
            </div>

            {/* Grid de Mesas */}
            <div
              className={`grid gap-2 sm:gap-3 ${
                gridDensity === "ultra"
                  ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
                  : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
              }`}
            >
              {filteredComandas.map((mesa) => {
                const isReady = mesa.readyOrdersCount > 0;
                const isOccupied = mesa.status === "OCUPADA";
                const isInactive = mesa.status === "INATIVA";

                return (
                  <div
                    key={mesa.id}
                    className={`p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col justify-between gap-1.5 shadow-md active:scale-[0.99] ${
                      isReady
                        ? "bg-purple-950/25 border-purple-500/70 ring-1 ring-purple-500/40"
                        : isOccupied
                        ? "bg-[#1c1818] border-rose-900/50 hover:border-rose-700/60"
                        : isInactive
                        ? "bg-brand-bg/40 border-brand-mediumGray/30 opacity-60"
                        : "bg-[#181818] border-brand-mediumGray/60 hover:border-brand-mediumGray"
                    }`}
                  >
                    {/* Header do Card */}
                    <div className="flex justify-between items-center gap-1">
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-brand-lightGray/70">
                          Mesa
                        </span>
                        <span
                          className={`text-base sm:text-lg font-mono font-black tracking-tight ${
                            isReady
                              ? "text-purple-300"
                              : isOccupied
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          #{String(mesa.number).padStart(2, "0")}
                        </span>
                      </div>

                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${
                          isReady
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse"
                            : isOccupied
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        }`}
                      >
                        {isReady ? "🛎️ PRONTO" : isOccupied ? "● Ocupada" : "● Livre"}
                      </span>
                    </div>

                    {/* Informações da Mesa */}
                    <div className="text-left space-y-0.5 min-w-0">
                      <div className="flex justify-between items-center gap-1">
                        <span className="text-[11px] font-medium text-white/90 truncate flex-1">
                          {mesa.responsibleName ? (
                            <span>👤 {mesa.responsibleName}</span>
                          ) : (
                            <span className="text-brand-lightGray/50 text-[10px] italic">Sem titular</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMesaToEdit(mesa);
                            setNewResponsibleName(mesa.responsibleName || "");
                            setEditMesaModalOpen(true);
                          }}
                          className="text-brand-lightGray hover:text-white p-0.5 text-[10px] shrink-0"
                          title="Editar titular"
                        >
                          ✏️
                        </button>
                      </div>

                      {isOccupied ? (
                        <div className="flex items-baseline justify-between text-[11px] pt-0.5 border-t border-brand-mediumGray/40">
                          <span className="text-[10px] text-brand-lightGray">
                            Consumo{mesa.orders?.length ? ` (${mesa.orders.length})` : ""}:
                          </span>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            R$ {mesa.currentConsumption.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-emerald-400/70 font-medium">
                          Disponível
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação do Card */}
                    <div className="pt-0.5">
                      {isReady ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("ready-alerts")}
                          className="w-full py-1.5 px-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center justify-center gap-1 animate-pulse"
                        >
                          <span>🛎️</span> Servir Pedido
                        </button>
                      ) : isOccupied ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartOrderForMesa(mesa)}
                            className="flex-1 py-1.5 px-1 rounded-lg bg-brand-red hover:bg-brand-redHover text-white font-bold text-[11px] transition-all cursor-pointer shadow-sm flex items-center justify-center gap-0.5"
                            title="Lançar novo pedido nesta mesa"
                          >
                            <span>＋</span> Pedido
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenTableDetails(mesa)}
                            className="flex-1 py-1.5 px-1 rounded-lg bg-[#242424] hover:bg-[#2d2d2d] border border-brand-mediumGray/70 text-brand-lightGray hover:text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center justify-center gap-0.5"
                            title="Ver consumo e detalhes"
                          >
                            <span>📋</span> Conta
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartOrderForMesa(mesa)}
                          className="w-full py-1.5 px-2 rounded-lg bg-brand-red hover:bg-brand-redHover text-white font-bold text-[11px] transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1"
                        >
                          <span>＋</span> Lançar Pedido
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredComandas.length === 0 && (
                <div className="col-span-full py-12 text-center text-xs text-brand-lightGray/50 border border-dashed border-brand-mediumGray/40 rounded-2xl">
                  Nenhuma comanda encontrada.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: PEDIDOS PRONTOS PARA SERVIR (ALERTAS DA COZINHA) */}
        {activeTab === "ready-alerts" && (
          <div className="p-3.5 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
            <div className="flex items-center justify-between border-b border-brand-mediumGray/40 pb-2">
              <div>
                <h2 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <span>🛎️</span> Pedidos Prontos na Cozinha
                </h2>
                <span className="text-xxs text-brand-lightGray">
                  Entregue os itens no salão e confirme como servido
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("tables")}
                className="px-3 py-1.5 rounded-xl bg-brand-darkGray border border-brand-mediumGray text-xs text-brand-lightGray hover:text-white font-bold"
              >
                ← Voltar às Mesas
              </button>
            </div>

            <div className="space-y-3">
              {readyOrdersList.map(({ comanda, order }) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-purple-950/20 border-2 border-purple-500/60 space-y-3 shadow-xl"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-purple-300 font-serif">
                          Mesa #{String(comanda.number).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-xs font-bold text-brand-red">
                          Pedido #{order.orderNumber}
                        </span>
                      </div>
                      <span className="text-xxs text-brand-lightGray block mt-0.5">
                        {comanda.responsibleName
                          ? `Titular: ${comanda.responsibleName}`
                          : "Mesa do Salão"}
                      </span>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xxs font-bold uppercase tracking-wider animate-pulse">
                      🍽️ Pronto p/ Servir
                    </span>
                  </div>

                  {/* Itens do Pedido */}
                  <div className="space-y-1 bg-brand-darkGray/60 p-3 rounded-xl border border-brand-mediumGray/40 text-xs">
                    {order.items?.map((item: any) => (
                      <div key={item.id} className="text-xxs text-brand-lightGray">
                        <strong className="text-white">{item.quantity}x</strong> {item.name}
                        {item.notes && (
                          <span className="block text-xxxs text-rose-300 italic">
                            Obs: &quot;{item.notes}&quot;
                          </span>
                        )}
                      </div>
                    ))}
                    {order.notes && (
                      <div className="pt-1 text-xxxs text-amber-300 italic border-t border-brand-mediumGray/30">
                        Obs geral: &quot;{order.notes}&quot;
                      </div>
                    )}
                  </div>

                  {/* Ação de confirmação */}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs font-mono font-bold text-amber-400">
                      Total: R$ {order.total.toFixed(2)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleMarkOrderServed(order.id)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-lg flex items-center gap-1.5"
                    >
                      <span>✓</span> Confirmar Servido na Mesa
                    </button>
                  </div>
                </div>
              ))}

              {readyOrdersList.length === 0 && (
                <div className="py-16 text-center text-xs text-brand-lightGray/50 border border-dashed border-brand-mediumGray/40 rounded-3xl p-6">
                  <span>🎉 Nenhum pedido aguardando entrega no momento!</span>
                  <span className="block text-xxxs text-brand-lightGray/40 mt-1">
                    Quando a cozinha finalizar um pedido de mesa, ele aparecerá aqui com alerta sonoro.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 3: MONTE SUA PIZZA / LANÇAMENTO DE PEDIDO (GARCOMORDERBUILDER) */}
        {activeTab === "builder" && (
          <div className="w-full">
            {builderMesa ? (
              <GarcomOrderBuilder
                flavors={flavors}
                crusts={crusts}
                standardCategories={standardCategories}
                toppingCategories={toppingCategories}
                comandas={comandas}
                activeComandaId={builderMesa?.id}
                onMesaChange={(newMesaId) => {
                  const m = comandas.find((c) => c.id === newMesaId);
                  if (m) setBuilderMesa(m);
                }}
                onOrderPlaced={async (order) => {
                  await fetchMesas();
                  setOrderCreatedSuccessToast(
                    `Pedido #${order.orderNumber} da Mesa #${order.comanda?.number || builderMesa?.number || "—"} enviado para a Cozinha!`
                  );
                  setActiveTab("tables");
                  setBuilderMesa(null);
                }}
                onCancel={() => {
                  setActiveTab("tables");
                  setBuilderMesa(null);
                }}
              />
            ) : (
              <div className="py-16 text-center text-xs text-brand-lightGray max-w-md mx-auto p-6 space-y-4">
                <span className="text-4xl block">🍽️</span>
                <h3 className="text-base font-bold text-white">Nenhuma Mesa Selecionada</h3>
                <p className="text-xxs text-brand-lightGray">
                  Selecione a mesa que vai receber este pedido antes de montar os itens.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTablePickerSearch("");
                    setTablePickerModalOpen(true);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs cursor-pointer shadow-lg inline-flex items-center gap-1.5"
                >
                  <span>🍽️</span> Selecionar Mesa Agora
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* BARRA DE NAVEGAÇÃO INFERIOR FIXA (MOBILE BOTTOM BAR) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-brand-mediumGray/70 bg-brand-darkGray/95 py-1.5 px-3 backdrop-blur-md pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          onClick={() => {
            setActiveTab("tables");
            setBuilderMesa(null);
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
            activeTab === "tables" ? "text-brand-red" : "text-brand-lightGray hover:text-white"
          }`}
        >
          <span className="text-base">🍽️</span>
          <span>Mesas</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (builderMesa) {
              setActiveTab("builder");
            } else {
              setTablePickerSearch("");
              setTablePickerModalOpen(true);
            }
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
            activeTab === "builder" ? "text-brand-red" : "text-brand-lightGray hover:text-white"
          }`}
        >
          <span className="text-base">🍕</span>
          <span>Novo Pedido</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ready-alerts")}
          className={`relative flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
            activeTab === "ready-alerts" ? "text-purple-300" : "text-brand-lightGray hover:text-white"
          }`}
        >
          <span className="text-base">🛎️</span>
          <span>Prontos</span>
          {readyOrdersList.length > 0 && (
            <span className="absolute -top-1 right-2 w-3.5 h-3.5 rounded-full bg-purple-500 text-white text-[9px] flex items-center justify-center font-bold">
              {readyOrdersList.length}
            </span>
          )}
        </button>
      </nav>

      {/* MODAL / DRAWER DE CONSUMO DA MESA */}
      {tableDetailsModalOpen && selectedComanda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3">
          <div className="w-full max-w-lg rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-white">
                  Mesa #{String(selectedComanda.number).padStart(2, "0")} • Consumo
                </h3>
                <span className="text-xxs text-brand-lightGray">
                  {selectedComanda.responsibleName
                    ? `Titular: ${selectedComanda.responsibleName}`
                    : "Mesa do Salão"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setTableDetailsModalOpen(false)}
                className="p-1.5 rounded-xl bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {selectedComanda.orders && selectedComanda.orders.length > 0 ? (
                selectedComanda.orders.map((o: any) => (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-2xl bg-brand-bg/80 border border-brand-mediumGray/60 space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white font-mono">
                        Pedido #{o.orderNumber}
                      </span>
                      <span
                        className={`text-xxxs font-bold uppercase px-2 py-0.5 rounded-full border ${
                          o.status === "ENTREGUE"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : o.status === "COMANDA_MESA"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                            : o.status === "PRONTO_RETIRADA"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        }`}
                      >
                        {o.status === "EM_PREPARO"
                          ? "Na Cozinha"
                          : o.status === "PRONTO_RETIRADA"
                          ? "Pronto"
                          : o.status === "COMANDA_MESA"
                          ? "Servido na Mesa"
                          : o.status === "ENTREGUE"
                          ? "Quitado & Fechado"
                          : o.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {o.items?.map((item: any) => (
                        <div key={item.id} className="text-xxs text-brand-lightGray flex justify-between">
                          <span>
                            <strong className="text-white">{item.quantity}x</strong> {item.name}
                          </span>
                          <span className="font-mono text-white">
                            R$ {Number(item.totalPrice || item.price || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-brand-mediumGray/30 font-bold">
                      <span className="text-xxs text-brand-lightGray">Subtotal</span>
                      <span className="text-xs font-mono text-amber-400">
                        R$ {o.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-brand-lightGray/50">
                  Nenhum pedido lançado nesta mesa ainda.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-brand-mediumGray/40 flex justify-between items-center">
              <div>
                <span className="text-xxs text-brand-lightGray block uppercase font-semibold">
                  Total da Mesa
                </span>
                <span className="text-xl font-mono font-bold text-amber-400">
                  R$ {selectedComanda.currentConsumption.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTableDetailsModalOpen(false);
                  handleStartOrderForMesa(selectedComanda);
                }}
                className="px-4 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-colors cursor-pointer shadow-lg"
              >
                ＋ Adicionar Mais Itens
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE RESPONSÁVEL DA MESA */}
      {editMesaModalOpen && mesaToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3">
          <div className="w-full max-w-sm rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-2xl space-y-4">
            <h3 className="font-serif text-base font-bold text-white">
              Mesa #{String(mesaToEdit.number).padStart(2, "0")} • Titular
            </h3>

            <form onSubmit={handleSaveResponsible} className="space-y-4">
              <div>
                <label className="text-xxs uppercase tracking-wider font-semibold text-brand-lightGray block mb-1">
                  Nome do Cliente / Responsável
                </label>
                <input
                  type="text"
                  placeholder="Ex: Família Silva, João..."
                  value={newResponsibleName}
                  onChange={(e) => setNewResponsibleName(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white focus:border-brand-red focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditMesaModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-brand-bg border border-brand-mediumGray text-xs text-brand-lightGray hover:text-white font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingResponsible}
                  className="flex-1 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-xs text-white font-bold transition-colors disabled:opacity-50"
                >
                  {savingResponsible ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL DE SELEÇÃO DE MESA PARA NOVO PEDIDO */}
      {tablePickerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3">
          <div className="w-full max-w-lg rounded-3xl border border-brand-mediumGray bg-brand-darkGray p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍕</span>
                <div>
                  <h3 className="font-serif text-base sm:text-lg font-bold text-white leading-tight">
                    Novo Pedido • Selecionar Mesa
                  </h3>
                  <span className="text-xxs text-brand-lightGray block">
                    Escolha a mesa onde os itens serão servidos
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTablePickerModalOpen(false)}
                className="p-1.5 rounded-xl bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Campo de Busca Rápida de Mesa */}
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Digite o número da mesa ou nome do cliente..."
                value={tablePickerSearch}
                onChange={(e) => setTablePickerSearch(e.target.value)}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2.5 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                autoFocus
              />
              {tablePickerSearch && (
                <button
                  type="button"
                  onClick={() => setTablePickerSearch("")}
                  className="absolute right-3 top-2.5 text-xs text-brand-lightGray hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Grid de Mesas */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {comandas
                  .filter((c) => {
                    if (!tablePickerSearch) return true;
                    const query = tablePickerSearch.toLowerCase();
                    return (
                      String(c.number).includes(query) ||
                      (c.responsibleName && c.responsibleName.toLowerCase().includes(query))
                    );
                  })
                  .map((mesa) => {
                    const isOcupada = mesa.status === "OCUPADA";
                    return (
                      <button
                        key={mesa.id}
                        type="button"
                        onClick={() => handleStartOrderForMesa(mesa)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 hover:scale-[1.02] active:scale-[0.98] ${
                          isOcupada
                            ? "border-purple-500/50 bg-purple-950/20 hover:border-purple-400"
                            : "border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-400"
                        }`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="font-mono text-base font-black text-white">
                            #{String(mesa.number).padStart(2, "0")}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                              isOcupada
                                ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            }`}
                          >
                            {isOcupada ? "Ocupada" : "Livre"}
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] font-bold text-white block truncate">
                            {mesa.responsibleName || (isOcupada ? "Mesa em Consumo" : "Disponível")}
                          </span>
                          {isOcupada && (
                            <span className="text-xxs font-mono text-amber-400 font-bold block mt-0.5">
                              Consumo: R$ {mesa.currentConsumption.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <div className="pt-1.5 border-t border-brand-mediumGray/30 flex items-center justify-between text-xxs font-bold text-brand-red">
                          <span>Lançar Pedido</span>
                          <span>→</span>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {comandas.length === 0 && (
                <div className="py-12 text-center text-xs text-brand-lightGray">
                  Nenhuma mesa cadastrada no sistema.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
