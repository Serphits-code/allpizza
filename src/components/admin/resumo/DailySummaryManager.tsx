"use client";

import React, { useState, useEffect, useMemo } from "react";

interface StalledOrder {
  id: string;
  orderNumber: number;
  status: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  addressNumber?: string;
  total: number;
  driverName?: string | null;
  itemsCount: number;
  createdAt: string;
  elapsedTimeFormatted: string;
}

interface SummaryOrder {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  addressNumber?: string | null;
  reference?: string | null;
  paymentMethod: string;
  changeFor?: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string | null;
  createdAt: string;
  preparedAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  driver?: {
    id: string;
    name: string;
  } | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    basePrice: number;
    totalPrice: number;
    isPizza: boolean;
    pizzaSize?: string | null;
    crustType?: string | null;
    crustPrice: number;
    flavors: { id: string; flavorName: string; categoryName: string }[];
    toppings: { id: string; toppingName: string; price: number }[];
  }[];
}

interface SummaryData {
  date: string;
  total: number;
  count: number;
  finishedCount: number;
  averageTicket: number;
  orders: SummaryOrder[];
  stalledDeliveryAlert: StalledOrder[];
}

export default function DailySummaryManager() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Ações em pedidos travados
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchSummary = async (dateStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/summary?date=${dateStr}`);
      if (!res.ok) throw new Error("Falha ao buscar resumo da data");
      const json: SummaryData = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar dados do resumo diário");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(selectedDate);
  }, [selectedDate]);

  // Navegação de Datas
  const changeDateByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleResolveStalledOrder = async (
    orderId: string,
    newStatus: "ENTREGUE" | "CANCELADO"
  ) => {
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const resData = await res.json();
      if (resData.success) {
        fetchSummary(selectedDate);
      } else {
        alert(resData.error || "Erro ao atualizar status do pedido");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar ao servidor");
    } finally {
      setActionLoadingId(null);
    }
  };

  const formattedDateHeader = useMemo(() => {
    if (!selectedDate) return "";
    const [year, month, day] = selectedDate.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((o) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "FINISHED" && (o.status === "ENTREGUE" || o.status === "PRONTO_RETIRADA")) ||
        (statusFilter === "IN_PROGRESS" && ["NOVO", "EM_PREPARO", "EM_ROTA"].includes(o.status)) ||
        o.status === statusFilter;

      const matchesType = typeFilter === "ALL" || o.type === typeFilter;
      return matchesStatus && matchesType;
    });
  }, [data, statusFilter, typeFilter]);

  const formatCurrency = (val: number) =>
    `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusColors: Record<string, string> = {
    NOVO: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    EM_PREPARO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    EM_ROTA: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    PRONTO_RETIRADA: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    ENTREGUE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    CANCELADO: "bg-red-500/10 text-red-400 border-red-500/20",
    COMANDA_MESA: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans pb-12">
      {/* Header & Seletor de Data */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-red">📅</span> Resumo Diário de Operação
          </h2>
          <p className="text-xs text-brand-lightGray mt-1 capitalize">
            {formattedDateHeader}
          </p>
        </div>

        {/* Controles de Navegação de Data */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => changeDateByDays(-1)}
            className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white text-xs font-bold text-brand-lightGray transition-colors cursor-pointer"
          >
            ◀ Dia Anterior
          </button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
            className="px-3 py-1.5 rounded-lg bg-brand-red hover:bg-brand-redHover text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Hoje
          </button>
          <button
            onClick={() => changeDateByDays(1)}
            className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white text-xs font-bold text-brand-lightGray transition-colors cursor-pointer"
          >
            Próximo Dia ▶
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-brand-bg border border-brand-mediumGray rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-brand-red/10 border border-brand-red/20 text-brand-red text-xs font-semibold">
          {error}
        </div>
      )}

      {/* 🚨 Alerta de Entregas Aguardando Fechamento (Se houver pedidos travados) */}
      {data && data.stalledDeliveryAlert.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-5 shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-red" />
            </span>
            <div>
              <h3 className="font-serif text-base font-bold text-red-400">
                Atenção: {data.stalledDeliveryAlert.length} entrega(s) de sessão anterior aguardando fechamento!
              </h3>
              <p className="text-xxs text-brand-lightGray">
                Estes pedidos foram iniciados em dias anteriores e continuam em aberto. Confirme a entrega ou cancele para não distorcer as métricas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.stalledDeliveryAlert.map((stalled) => (
              <div
                key={stalled.id}
                className="bg-brand-darkGray p-4 rounded-xl border border-brand-mediumGray space-y-2.5 text-xs"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono font-bold text-brand-red text-sm">
                      #{stalled.orderNumber}
                    </span>
                    <span className="block font-semibold text-white mt-0.5">
                      {stalled.customerName}
                    </span>
                  </div>
                  <span className="text-xxxs font-mono font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    Parado há {stalled.elapsedTimeFormatted}
                  </span>
                </div>

                <div className="text-xxs text-brand-lightGray">
                  📍 {stalled.customerAddress || "Sem endereço"}, {stalled.addressNumber}
                </div>

                <div className="flex justify-between items-center text-xxs pt-2 border-t border-brand-mediumGray/30">
                  <span className="font-mono font-bold text-white">
                    Total: {formatCurrency(stalled.total)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoadingId === stalled.id}
                      onClick={() => handleResolveStalledOrder(stalled.id, "CANCELADO")}
                      className="px-2.5 py-1 rounded bg-brand-bg border border-brand-red/50 hover:bg-brand-red text-brand-red hover:text-white text-xxs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={actionLoadingId === stalled.id}
                      onClick={() => handleResolveStalledOrder(stalled.id, "ENTREGUE")}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xxs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Confirmar Entrega
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs do Dia */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-lg">
            <span className="text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
              Faturamento do Dia
            </span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {formatCurrency(data.total)}
            </div>
            <div className="text-xxs text-brand-lightGray mt-2">
              Soma total de todos os pedidos
            </div>
          </div>

          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-lg">
            <span className="text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
              Total de Pedidos
            </span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{data.count}</div>
            <div className="text-xxs text-brand-lightGray mt-2">Criados nesta data</div>
          </div>

          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-lg">
            <span className="text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
              Pedidos Finalizados
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {data.finishedCount}
            </div>
            <div className="text-xxs text-brand-lightGray mt-2">
              Entregues ou Retirados
            </div>
          </div>

          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-lg">
            <span className="text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
              Ticket Médio do Dia
            </span>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {formatCurrency(data.averageTicket)}
            </div>
            <div className="text-xxs text-brand-lightGray mt-2">Média por pedido</div>
          </div>
        </div>
      )}

      {/* Lista de Pedidos do Dia com Filtros */}
      <div className="space-y-4">
        {/* Barra de Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-4 rounded-xl">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray mr-1">Status:</span>
            {[
              { key: "ALL", label: "Todos" },
              { key: "FINISHED", label: "Finalizados" },
              { key: "IN_PROGRESS", label: "Em Andamento" },
              { key: "CANCELADO", label: "Cancelados" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === tab.key
                    ? "bg-brand-red text-white"
                    : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray">Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-1 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Canais</option>
              <option value="DELIVERY">Delivery</option>
              <option value="RETIRADA">Retirada</option>
              <option value="COMANDA">Mesa / Comanda</option>
            </select>
          </div>
        </div>

        {/* Listagem de Pedidos */}
        <div className="space-y-3">
          {filteredOrders.map((ord) => {
            const isExpanded = expandedOrderId === ord.id;
            const statusBadge = statusColors[ord.status] || "bg-gray-500/10 text-gray-400";

            return (
              <div
                key={ord.id}
                className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden shadow-lg transition-all"
              >
                {/* Header do Card */}
                <div
                  onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer hover:bg-brand-bg/40 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-brand-red text-base">
                      #{ord.orderNumber}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xxs font-bold border uppercase ${statusBadge}`}
                    >
                      {ord.status}
                    </span>
                    <span className="text-xxs bg-brand-bg px-2 py-0.5 rounded border border-brand-mediumGray text-white font-semibold">
                      {ord.type === "DELIVERY" ? "🛵 Delivery" : ord.type === "RETIRADA" ? "🥡 Retirada" : "🍽️ Mesa"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-brand-lightGray">
                    <div>
                      <span className="font-bold text-white block">{ord.customerName}</span>
                      <span className="text-xxxs font-mono">{ord.customerPhone}</span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-white text-sm block">
                        {formatCurrency(ord.total)}
                      </span>
                      <span className="text-xxxs font-mono">
                        {new Date(ord.createdAt).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>

                    <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Detalhe Expandido */}
                {isExpanded && (
                  <div className="p-4 border-t border-brand-mediumGray/40 bg-brand-bg/50 space-y-4 text-xs">
                    {/* Itens */}
                    <div className="space-y-2">
                      <span className="text-xxs font-semibold uppercase text-brand-lightGray block">
                        Itens ({ord.items.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ord.items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-brand-darkGray p-3 rounded-xl border border-brand-mediumGray/40 space-y-1 text-xs"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-white">
                                {item.quantity}x {item.name}
                              </span>
                              <span className="font-mono text-brand-lightGray">
                                {formatCurrency(item.totalPrice)}
                              </span>
                            </div>

                            {item.isPizza && item.flavors?.length > 0 && (
                              <div className="text-xxxs text-amber-300">
                                Sabores: {item.flavors.map((f) => f.flavorName).join(" / ")}
                              </div>
                            )}

                            {item.crustType && (
                              <div className="text-xxxs text-brand-lightGray">
                                Borda: {item.crustType} (+{formatCurrency(item.crustPrice)})
                              </div>
                            )}

                            {item.toppings?.length > 0 && (
                              <div className="text-xxxs text-brand-lightGray">
                                Adicionais: {item.toppings.map((t) => t.toppingName).join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dados Financeiros e de Entrega */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xxs text-brand-lightGray pt-2 border-t border-brand-mediumGray/30">
                      <div>
                        <strong className="text-white block mb-0.5">Endereço de Entrega:</strong>
                        {ord.customerAddress ? (
                          <span>
                            {ord.customerAddress}, {ord.addressNumber}
                            {ord.reference && <span className="block opacity-70">Ref: {ord.reference}</span>}
                          </span>
                        ) : (
                          <span>Retirada / Consumo Local</span>
                        )}
                      </div>

                      <div>
                        <strong className="text-white block mb-0.5">Pagamento:</strong>
                        <span>Método: {ord.paymentMethod}</span>
                        {ord.changeFor && (
                          <span className="block font-mono">Troco para: {formatCurrency(ord.changeFor)}</span>
                        )}
                        <span className="block font-mono mt-0.5">
                          Taxa de Entrega: {formatCurrency(ord.deliveryFee)}
                        </span>
                      </div>

                      <div>
                        <strong className="text-white block mb-0.5">Horários e Piloto:</strong>
                        <span>Criação: {new Date(ord.createdAt).toLocaleTimeString("pt-BR")}</span>
                        {ord.preparedAt && (
                          <span className="block">Preparo: {new Date(ord.preparedAt).toLocaleTimeString("pt-BR")}</span>
                        )}
                        {ord.deliveredAt && (
                          <span className="block">Entrega: {new Date(ord.deliveredAt).toLocaleTimeString("pt-BR")}</span>
                        )}
                        {ord.driver && (
                          <span className="block text-purple-400 font-semibold mt-0.5">
                            Entregador: {ord.driver.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {ord.notes && (
                      <div className="p-2 rounded-lg bg-brand-red/5 border border-brand-red/10 text-xxs italic text-brand-red">
                        Obs: &quot;{ord.notes}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredOrders.length === 0 && !loading && (
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-12 text-center text-xs text-brand-lightGray/50 shadow-lg">
              Nenhum pedido encontrado nesta data com os filtros selecionados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
