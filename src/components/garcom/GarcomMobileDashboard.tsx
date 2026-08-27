"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { signOut } from "next-auth/react";
import QuickOrderCatalog, { QuickOrderCartItem } from "@/components/quick-order/QuickOrderCatalog";

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
  pizzaCategories: any[];
  productCategories: any[];
  companyName?: string;
  companyLogo?: string;
  userName?: string;
}

export default function GarcomMobileDashboard({
  initialComandas,
  pizzaCategories,
  productCategories,
  companyName = "AllPizza",
  companyLogo,
  userName = "Garçom",
}: GarcomMobileDashboardProps) {
  // Navegação: "tables" | "quick-order" | "ready-alerts" | "table-details"
  const [activeTab, setActiveTab] = useState<"tables" | "quick-order" | "ready-alerts" | "table-details">("tables");

  // Dados das Comandas / Mesas
  const [comandas, setComandas] = useState<ComandaItem[]>(initialComandas);
  const [selectedComanda, setSelectedComanda] = useState<ComandaItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"ALL" | "LIVRE" | "OCUPADA" | "READY">("ALL");

  // Carrinho do Quick-Order para a Mesa Ativa
  const [cart, setCart] = useState<QuickOrderCartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [sendingOrder, setSendingOrder] = useState(false);

  // Modal de Abertura / Edição de Responsável da Mesa
  const [editMesaModalOpen, setEditMesaModalOpen] = useState(false);
  const [mesaToEdit, setMesaToEdit] = useState<ComandaItem | null>(null);
  const [newResponsibleName, setNewResponsibleName] = useState("");
  const [savingResponsible, setSavingResponsible] = useState(false);

  // Notificações e Alertas em Tempo Real
  const [readyToast, setReadyToast] = useState<{ id: string; tableNumber: number; orderNumber: number; text: string } | null>(null);
  const lastAlertedOrderIdRef = useRef<string | null>(null);

  // Toca som de alerta
  const playAlertSound = () => {
    try {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav");
      audio.play().catch(() => {});
    } catch (e) {}
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
          const updatedSelected = data.comandas.find((c: ComandaItem) => c.id === selectedComanda.id);
          if (updatedSelected) setSelectedComanda(updatedSelected);
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar mesas:", err);
    }
  };

  // Polling em background a cada 4 segundos + SSE em tempo real
  useEffect(() => {
    fetchMesas();
    const interval = setInterval(fetchMesas, 4000);

    // Conexão SSE
    const eventSource = new EventSource("/api/print/events");

    eventSource.addEventListener("table_order_ready", (event: any) => {
      try {
        const order = JSON.parse(event.data);
        console.log("[SSE Garçom] Pedido pronto para servir:", order);

        const tableNum = order.comanda?.number || (order.customerName?.match(/\d+/) ? order.customerName.match(/\d+/)[0] : "—");
        
        playAlertSound();
        setReadyToast({
          id: order.id,
          tableNumber: Number(tableNum) || 0,
          orderNumber: order.orderNumber,
          text: `Pedido #${order.orderNumber} da Mesa ${tableNum} está pronto na cozinha!`,
        });

        // Recarrega lista
        fetchMesas();
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("order_updated", () => {
      fetchMesas();
    });

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, []);

  // Total de pedidos prontos para servir no salão
  const readyOrdersList = useMemo(() => {
    const list: { comanda: ComandaItem; order: any }[] = [];
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
        (c.responsibleName && c.responsibleName.toLowerCase().includes(tableSearch.toLowerCase()));

      let matchesFilter = true;
      if (tableFilter === "LIVRE") matchesFilter = c.status === "LIVRE";
      if (tableFilter === "OCUPADA") matchesFilter = c.status === "OCUPADA";
      if (tableFilter === "READY") matchesFilter = c.readyOrdersCount > 0;

      return matchesSearch && matchesFilter;
    });
  }, [comandas, tableSearch, tableFilter]);

  // Adiciona item ao carrinho do Quick-Order
  const handleAddToCart = (item: QuickOrderCartItem) => {
    setCart((prev) => [...prev, item]);
  };

  // Remove item do carrinho
  const handleRemoveFromCart = (tempId: string) => {
    setCart((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  // Total do carrinho
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [cart]);

  // Enviar Pedido da Mesa para a Cozinha
  const handleSendOrderToKitchen = async () => {
    if (!selectedComanda) {
      alert("Por favor, selecione uma mesa antes de enviar o pedido.");
      return;
    }

    if (cart.length === 0) {
      alert("O pedido está vazio.");
      return;
    }

    setSendingOrder(true);
    try {
      const payload = {
        type: "COMANDA",
        comandaId: selectedComanda.id,
        customerName: selectedComanda.responsibleName || `Mesa ${selectedComanda.number}`,
        customerPhone: "00000000000",
        notes: orderNotes || undefined,
        status: "NOVO", // Entra no Kanban como NOVO
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          basePrice: item.basePrice,
          price: item.basePrice,
          isPizza: item.isPizza,
          pizzaSize: item.pizzaSize,
          crustType: item.crustType,
          crustPrice: item.crustPrice || 0,
          flavors: item.flavors || [],
          toppings: item.toppings || [],
        })),
      };

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao enviar pedido para a cozinha");
      }

      // Limpa carrinho e fecha gaveta
      setCart([]);
      setOrderNotes("");
      setCartDrawerOpen(false);
      
      // Atualiza mesas
      await fetchMesas();

      alert(`✅ Pedido #${data.order.orderNumber} enviado com sucesso para a Cozinha!`);
      setActiveTab("tables");
    } catch (err: any) {
      console.error("Erro ao enviar pedido:", err);
      alert(err.message || "Erro de conexão ao enviar pedido.");
    } finally {
      setSendingOrder(false);
    }
  };

  // Marca pedido de mesa como concluído (servido)
  const handleMarkOrderServed = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENTREGUE" }),
      });
      if (res.ok) {
        fetchMesas();
      }
    } catch (err) {
      console.error("Erro ao marcar pedido como servido:", err);
    }
  };

  // Salva ou abre comanda com responsável
  const handleSaveResponsible = async () => {
    if (!mesaToEdit) return;
    setSavingResponsible(true);
    try {
      const res = await fetch("/api/garcom/mesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comandaId: mesaToEdit.id,
          responsibleName: newResponsibleName.trim() || `Mesa ${mesaToEdit.number}`,
          action: "OPEN",
        }),
      });
      if (res.ok) {
        await fetchMesas();
        setEditMesaModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingResponsible(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-white font-sans flex flex-col pb-20">
      {/* HEADER SUPERIOR (Mobile Optimized) */}
      <header className="sticky top-0 z-40 bg-brand-darkGray/95 backdrop-blur-md border-b border-brand-mediumGray px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-red flex items-center justify-center text-sm font-bold shadow-md shadow-brand-red/20">
            🍕
          </div>
          <div>
            <h1 className="font-serif text-sm font-bold text-white leading-tight">
              {companyName}
            </h1>
            <span className="text-xxxs text-brand-lightGray/80 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {userName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Alertas Prontos */}
          <button
            type="button"
            onClick={() => setActiveTab("ready-alerts")}
            className={`relative px-3 py-1.5 rounded-xl border text-xxs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              readyOrdersList.length > 0
                ? "bg-purple-600/20 border-purple-500 text-purple-300 animate-bounce"
                : "bg-brand-bg border-brand-mediumGray text-brand-lightGray"
            }`}
          >
            <span>🛎️</span>
            <span>Prontos</span>
            {readyOrdersList.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-xxxs font-bold font-mono">
                {readyOrdersList.length}
              </span>
            )}
          </button>

          {/* Sair */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="p-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white text-xs cursor-pointer"
            title="Sair"
          >
            🚪
          </button>
        </div>
      </header>

      {/* TOAST FLUTUANTE DE PEDIDO PRONTO */}
      {readyToast && (
        <div className="fixed top-16 inset-x-3 z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-purple-900 border-2 border-purple-400 p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🍽️</span>
              <div>
                <span className="text-xs font-bold block">{readyToast.text}</span>
                <span className="text-xxxs text-purple-200">Pronto na cozinha para servir!</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleMarkOrderServed(readyToast.id);
                  setReadyToast(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xxs cursor-pointer"
              >
                ✓ Servido
              </button>
              <button
                type="button"
                onClick={() => setReadyToast(null)}
                className="w-6 h-6 rounded-full bg-purple-950 text-purple-200 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-4xl mx-auto w-full space-y-4">
        
        {/* ABA 1: SELETOR DE MESAS */}
        {activeTab === "tables" && (
          <div className="space-y-4">
            {/* Barra de Busca e Filtros de Mesa */}
            <div className="space-y-2.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar mesa ou cliente..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-darkGray px-4 py-2.5 text-xs text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch("")}
                    className="absolute right-3 top-2.5 text-xs text-brand-lightGray"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filtros Rápidos */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xxs font-bold">
                <button
                  type="button"
                  onClick={() => setTableFilter("ALL")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    tableFilter === "ALL"
                      ? "bg-brand-red text-white"
                      : "bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray"
                  }`}
                >
                  Todas ({comandas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter("LIVRE")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    tableFilter === "LIVRE"
                      ? "bg-emerald-600 text-white"
                      : "bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray"
                  }`}
                >
                  Livres ({comandas.filter((c) => c.status === "LIVRE").length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter("OCUPADA")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    tableFilter === "OCUPADA"
                      ? "bg-blue-600 text-white"
                      : "bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray"
                  }`}
                >
                  Ocupadas ({comandas.filter((c) => c.status === "OCUPADA").length})
                </button>
                {readyOrdersList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTableFilter("READY")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      tableFilter === "READY"
                        ? "bg-purple-600 text-white"
                        : "bg-purple-950/40 border border-purple-500/50 text-purple-300"
                    }`}
                  >
                    <span>🛎️</span> Prontos ({readyOrdersList.length})
                  </button>
                )}
              </div>
            </div>

            {/* Grid de Mesas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredComandas.map((mesa) => {
                const isReady = mesa.readyOrdersCount > 0;
                const isOccupied = mesa.status === "OCUPADA";

                return (
                  <div
                    key={mesa.id}
                    className={`p-3.5 rounded-2xl border flex flex-col justify-between space-y-3 transition-all relative shadow-sm ${
                      isReady
                        ? "border-purple-500 bg-purple-950/20 shadow-purple-500/10 shadow-lg animate-pulse"
                        : isOccupied
                        ? "border-blue-500/40 bg-blue-950/10"
                        : "border-brand-mediumGray bg-brand-darkGray/70 hover:border-brand-lightGray/40"
                    }`}
                  >
                    {/* Badge Superior */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-bold text-white">
                        Mesa {mesa.number}
                      </span>
                      <span
                        className={`text-xxxs font-bold uppercase px-2 py-0.5 rounded ${
                          isReady
                            ? "bg-purple-500 text-white"
                            : isOccupied
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {isReady ? "Pronto!" : isOccupied ? "Ocupada" : "Livre"}
                      </span>
                    </div>

                    {/* Dados da Mesa */}
                    <div className="space-y-1 text-xxs">
                      <div className="text-brand-lightGray truncate">
                        👤 {mesa.responsibleName || (isOccupied ? "Sem nome" : "—")}
                      </div>
                      {isOccupied && (
                        <div className="font-mono text-xs font-bold text-brand-red">
                          Total: R$ {mesa.currentConsumption.toFixed(2)}
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-brand-mediumGray/40">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComanda(mesa);
                          setActiveTab("quick-order");
                        }}
                        className="w-full py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-all cursor-pointer text-center shadow-md shadow-brand-red/10"
                      >
                        + Fazer Pedido
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComanda(mesa);
                          setActiveTab("table-details");
                        }}
                        className="w-full py-1 rounded-lg bg-brand-bg hover:bg-brand-mediumGray text-brand-lightGray text-xxs font-semibold transition-colors cursor-pointer text-center"
                      >
                        Ver Consumo ({mesa.orders?.length || 0})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredComandas.length === 0 && (
              <div className="text-center py-12 text-xs text-brand-lightGray">
                Nenhuma mesa encontrada com esses filtros.
              </div>
            )}
          </div>
        )}

        {/* ABA 2: QUICK-ORDER (CATÁLOGO PARA A MESA SELECIONADA) */}
        {activeTab === "quick-order" && selectedComanda && (
          <div className="space-y-4">
            {/* Banner da Mesa Selecionada */}
            <div className="p-3.5 rounded-2xl bg-brand-darkGray border border-brand-mediumGray flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center text-base font-bold font-mono">
                  {selectedComanda.number}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Mesa {selectedComanda.number}</span>
                    <span className="text-xxxs px-2 py-0.5 rounded bg-brand-bg text-brand-lightGray border border-brand-mediumGray">
                      {selectedComanda.responsibleName || "Consumo Local"}
                    </span>
                  </div>
                  <span className="text-xxxs text-brand-lightGray">
                    Consumo atual: R$ {selectedComanda.currentConsumption.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("tables")}
                className="px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white text-xxs font-bold transition-all cursor-pointer"
              >
                Trocar Mesa
              </button>
            </div>

            {/* Catálogo de Produtos e Pizzas */}
            <QuickOrderCatalog
              pizzaCategories={pizzaCategories}
              productCategories={productCategories}
              onAddToCart={handleAddToCart}
            />
          </div>
        )}

        {/* ABA 3: ALERTAS DE PEDIDOS PRONTOS PARA SERVIR */}
        {activeTab === "ready-alerts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-mediumGray/50 pb-2">
              <h2 className="font-serif text-base font-bold text-white flex items-center gap-2">
                <span>🛎️</span> Pedidos Prontos para Servir na Mesa ({readyOrdersList.length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("tables")}
                className="text-xxs text-brand-lightGray hover:text-white"
              >
                ← Voltar às Mesas
              </button>
            </div>

            <div className="space-y-3">
              {readyOrdersList.map(({ comanda, order }) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-purple-950/20 border-2 border-purple-500 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-mono font-bold text-xs">
                        Mesa {comanda.number}
                      </span>
                      <span className="font-mono text-xs font-bold text-brand-red">
                        Pedido #{order.orderNumber}
                      </span>
                      <span className="text-xxxs text-purple-300">
                        {comanda.responsibleName || "Consumo Local"}
                      </span>
                    </div>

                    {/* Itens do Pedido */}
                    <div className="space-y-1 bg-brand-darkGray/60 p-2.5 rounded-xl border border-purple-500/30 text-xxs">
                      {order.items.map((item: any) => (
                        <div key={item.id} className="text-brand-lightGray">
                          <span className="font-bold text-white">{item.quantity}x</span> {item.name}
                          {item.flavors && item.flavors.length > 0 && (
                            <span className="block text-xxxs text-purple-300">
                              {item.flavors.map((f: any) => f.flavorName).join(" / ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div className="text-xxxs text-brand-red italic">
                        Obs: &quot;{order.notes}&quot;
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleMarkOrderServed(order.id)}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                  >
                    <span>✓</span> Confirmar Entrega na Mesa
                  </button>
                </div>
              ))}

              {readyOrdersList.length === 0 && (
                <div className="text-center py-12 text-xs text-brand-lightGray">
                  Nenhum pedido aguardando entrega no salão no momento.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 4: DETALHES DE CONSUMO DA MESA */}
        {activeTab === "table-details" && selectedComanda && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-mediumGray/50 pb-2">
              <div>
                <h2 className="font-serif text-base font-bold text-white">
                  🍽️ Mesa {selectedComanda.number} — Detalhes do Consumo
                </h2>
                <span className="text-xxs text-brand-lightGray">
                  Cliente: {selectedComanda.responsibleName || "Não informado"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("tables")}
                className="text-xxs text-brand-lightGray hover:text-white"
              >
                ← Voltar
              </button>
            </div>

            {/* Ações da Mesa */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMesaToEdit(selectedComanda);
                  setNewResponsibleName(selectedComanda.responsibleName || "");
                  setEditMesaModalOpen(true);
                }}
                className="px-3 py-2 rounded-xl bg-brand-darkGray border border-brand-mediumGray hover:border-brand-lightGray text-xxs font-bold text-white cursor-pointer"
              >
                ✏️ Editar Responsável
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("quick-order")}
                className="px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xxs font-bold cursor-pointer"
              >
                + Fazer Novo Pedido
              </button>
            </div>

            {/* Lista de Pedidos da Mesa */}
            <div className="space-y-3">
              {selectedComanda.orders?.map((ord: any) => (
                <div
                  key={ord.id}
                  className="p-3.5 rounded-xl bg-brand-darkGray border border-brand-mediumGray text-xs space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-brand-red">
                      Pedido #{ord.orderNumber}
                    </span>
                    <span
                      className={`text-xxxs font-bold uppercase px-2 py-0.5 rounded ${
                        ord.status === "ENTREGUE"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : ord.status === "PRONTO_RETIRADA"
                          ? "bg-purple-500/20 text-purple-300"
                          : ord.status === "EM_PREPARO"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {ord.status === "ENTREGUE"
                        ? "Entregue"
                        : ord.status === "PRONTO_RETIRADA"
                        ? "Pronto"
                        : ord.status === "EM_PREPARO"
                        ? "Na Cozinha"
                        : "Novo"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xxs text-brand-lightGray">
                    {ord.items.map((it: any) => (
                      <div key={it.id}>
                        <span className="font-bold text-white">{it.quantity}x</span> {it.name} — R${" "}
                        {it.totalPrice.toFixed(2)}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-brand-mediumGray/30 flex justify-between font-mono text-xs">
                    <span>Total do Pedido:</span>
                    <span className="font-bold text-white">R$ {ord.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              {(!selectedComanda.orders || selectedComanda.orders.length === 0) && (
                <div className="text-center py-10 text-xs text-brand-lightGray">
                  Nenhum pedido lançado nesta mesa ainda.
                </div>
              )}
            </div>

            {/* Total Acumulado */}
            <div className="p-4 rounded-2xl bg-brand-darkGray border-2 border-brand-red flex justify-between items-center font-mono">
              <span className="text-xs font-bold uppercase text-brand-lightGray">
                Total Geral da Mesa:
              </span>
              <span className="text-lg font-bold text-white">
                R$ {selectedComanda.currentConsumption.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* BARRA INFERIOR FLUTUANTE DO CARRINHO (QUANDO HOUVER ITENS) */}
      {cart.length > 0 && activeTab === "quick-order" && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-brand-darkGray/95 backdrop-blur-md border-t border-brand-mediumGray p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom">
          <div
            onClick={() => setCartDrawerOpen(true)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-red text-white flex items-center justify-center font-mono font-bold text-sm shadow-md shadow-brand-red/20">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </div>
            <div>
              <span className="text-xxs uppercase text-brand-lightGray block font-semibold">
                Mesa {selectedComanda?.number}
              </span>
              <span className="text-sm font-mono font-bold text-white">
                R$ {cartTotal.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            className="px-6 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-all cursor-pointer shadow-lg shadow-brand-red/20 flex items-center gap-2"
          >
            <span>Ver Pedido</span>
            <span>➔</span>
          </button>
        </div>
      )}

      {/* DRAWER / MODAL DE REVISÃO E ENVIO DO CARRINHO */}
      {cartDrawerOpen && selectedComanda && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-md bg-brand-darkGray border-t sm:border border-brand-mediumGray rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-brand-mediumGray flex justify-between items-center bg-brand-bg/80">
              <div>
                <h3 className="font-serif text-base font-bold text-white">
                  🍽️ Pedido para Mesa {selectedComanda.number}
                </h3>
                <span className="text-xxs text-brand-lightGray">
                  {selectedComanda.responsibleName || "Consumo no Salão"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Lista de Itens */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              {cart.map((item) => (
                <div
                  key={item.tempId}
                  className="p-3 rounded-xl bg-brand-bg border border-brand-mediumGray/60 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white">
                      {item.quantity}x {item.name}
                    </div>
                    {item.crustType && item.crustType !== "Tradicional (Sem Borda Recheada)" && (
                      <div className="text-xxxs text-brand-red">{item.crustType}</div>
                    )}
                    {item.notes && (
                      <div className="text-xxxs text-brand-lightGray/70 italic mt-0.5">
                        Obs: &quot;{item.notes}&quot;
                      </div>
                    )}
                    <div className="text-xxs font-mono font-bold text-brand-red mt-1">
                      R$ {item.totalPrice.toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFromCart(item.tempId)}
                    className="text-red-400 hover:text-red-300 text-xs p-1 cursor-pointer"
                    title="Remover item"
                  >
                    🗑️
                  </button>
                </div>
              ))}

              {/* Observação Geral */}
              <div className="space-y-1 pt-2">
                <label className="block text-xxs font-bold uppercase text-brand-lightGray">
                  Observações Gerais do Pedido
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: entregar bebidas primeiro, pratos extras, etc."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg p-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
                />
              </div>
            </div>

            {/* Footer com Botão de Envio para a Cozinha */}
            <div className="p-4 bg-brand-bg border-t border-brand-mediumGray space-y-3">
              <div className="flex justify-between items-center font-mono">
                <span className="text-xs uppercase text-brand-lightGray font-bold">Total deste Envio:</span>
                <span className="text-base font-bold text-white">R$ {cartTotal.toFixed(2)}</span>
              </div>

              <button
                type="button"
                onClick={handleSendOrderToKitchen}
                disabled={sendingOrder || cart.length === 0}
                className="w-full py-3.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-brand-red/20 flex items-center justify-center gap-2"
              >
                <span>{sendingOrder ? "Enviando..." : "🚀 Enviar Pedido para a Cozinha"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE RESPONSÁVEL DA MESA */}
      {editMesaModalOpen && mesaToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-brand-darkGray border border-brand-mediumGray rounded-2xl p-5 space-y-4 shadow-2xl">
            <h3 className="font-serif text-base font-bold text-white">
              🍽️ Mesa {mesaToEdit.number} — Identificar Cliente
            </h3>

            <div className="space-y-1 text-xs">
              <label className="block text-xxs font-bold uppercase text-brand-lightGray">
                Nome do Responsável / Cliente
              </label>
              <input
                type="text"
                placeholder="Ex: Carlos Silva, Família Souza..."
                value={newResponsibleName}
                onChange={(e) => setNewResponsibleName(e.target.value)}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditMesaModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveResponsible}
                disabled={savingResponsible}
                className="flex-1 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {savingResponsible ? "Salvando..." : "Salvar Mesa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
