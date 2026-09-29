"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface KPIs {
  totalSales: number;
  orderCount: number;
  averageTicket: number;
  itemsSold: number;
  activeOrders: number;
  deliveryFees: number;
  cancellations: number;
  cancellationRate: number;
  pickupCount: number;
}

interface StatusTimes {
  novoMin: number;
  emPreparoMin: number;
  emRotaMin: number;
  balcaoMin: number;
}

interface StatusCounts {
  novo: number;
  em_preparo: number;
  em_rota: number;
  pronto_retirada: number;
  entregue: number;
  cancelado: number;
}

interface ChannelItem {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

interface PaymentItem {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

interface WeekdaySale {
  dayIndex: number;
  dayName: string;
  occurrences: number;
  count: number;
  averageOrders: number;
  totalRevenue: number;
  averageRevenue: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface IngredientItem {
  name: string;
  count: number;
  baseCount: number;
  extraCount: number;
}

interface DashboardData {
  kpis: KPIs;
  averageStatusTimes: StatusTimes;
  peakHour: { hour: number; count: number; label: string };
  statusCounts: StatusCounts;
  channels: ChannelItem[];
  payments: PaymentItem[];
  weekdaySales: WeekdaySale[];
  topProducts: TopProduct[];
  ingredientFavorites: {
    totalOutputs: number;
    items: IngredientItem[];
  };
  period: { from: string; to: string };
}

export default function DashboardMetrics() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  // Filtros de Data Formatados no Fuso Local
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Inicializa datas locais (30 dias atrás até hoje) e estado montado
  useEffect(() => {
    setMounted(true);
    setLastUpdated(new Date());

    const now = new Date();
    const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
      start.getDate()
    ).padStart(2, "0")}`;

    setFromDate(startStr);
    setToDate(endStr);
  }, []);

  const fetchDashboard = useCallback(
    async (from: string, to: string, isBackground: boolean = false) => {
      if (!from || !to) return;
      if (!isBackground) setLoading(true);
      else setIsRefreshing(true);

      setError(null);
      try {
        const res = await fetch(`/api/admin/dashboard?from=${from}&to=${to}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Erro ao carregar indicadores");
        const json: DashboardData = await res.json();
        setData(json);
        setLastUpdated(new Date());
      } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        if (!isBackground) {
          setError(err.message || "Erro de conexão ao buscar dados");
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  // Busca inicial quando as datas estão prontas
  useEffect(() => {
    if (fromDate && toDate) {
      fetchDashboard(fromDate, toDate, false);
    }
  }, [fromDate, toDate, fetchDashboard]);

  // Polling com detecção de visibilidade da aba (15s) e atualização imediata ao focar na janela
  useEffect(() => {
    if (!fromDate || !toDate) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchDashboard(fromDate, toDate, true);
    }, 15000);

    const onFocus = () => {
      fetchDashboard(fromDate, toDate, true);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fromDate, toDate, fetchDashboard]);

  const formatCurrency = (val: number) =>
    `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTime = (minutes: number) => {
    if (!minutes || minutes <= 0) return "0min";
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  // Máximo de pedidos médios por dia para a escala da barra
  const maxAverageOrders = useMemo(() => {
    if (!data || data.weekdaySales.length === 0) return 1;
    const maxVal = Math.max(...data.weekdaySales.map((w) => w.averageOrders));
    return maxVal > 0 ? maxVal : 1;
  }, [data]);

  // Máximo de ingredientes para a barra verde
  const maxIngredientCount = useMemo(() => {
    if (!data || data.ingredientFavorites.items.length === 0) return 1;
    const maxVal = Math.max(...data.ingredientFavorites.items.map((i) => i.count));
    return maxVal > 0 ? maxVal : 1;
  }, [data]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto font-sans pb-16 text-slate-100">
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER COM SELETOR DE DATAS & INDICADOR TEMPO REAL        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Dashboard
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/50 text-emerald-400 text-xxs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Tempo Real</span>
            </div>
          </div>
          <span className="text-xxs text-slate-400 block mt-0.5" suppressHydrationWarning>
            Última atualização: {mounted && lastUpdated ? lastUpdated.toLocaleTimeString("pt-BR") : "--:--:--"}
          </span>
        </div>

        {/* Date pickers e botão de refresh */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex items-center bg-[#131b2e] border border-[#243048] rounded-lg px-3 py-1.5 shadow-inner">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            />
          </div>
          <span className="text-slate-400 text-xs font-medium">até</span>
          <div className="relative flex items-center bg-[#131b2e] border border-[#243048] rounded-lg px-3 py-1.5 shadow-inner">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => fetchDashboard(fromDate, toDate, false)}
            disabled={loading || isRefreshing}
            className="p-2 rounded-lg bg-[#131b2e] border border-[#243048] hover:bg-[#1c2742] text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Atualizar agora"
          >
            <span className={`inline-block ${isRefreshing ? "animate-spin" : ""}`}>↻</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs font-semibold">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-28 space-y-3">
          <div className="w-9 h-9 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 animate-pulse">Carregando métricas...</span>
        </div>
      )}

      {data && (
        <div className="space-y-6 animate-fadeIn">
          {/* ------------------------------------------------------------- */}
          {/* LINHA 1: 4 CARDS DE KPIS                                      */}
          {/* ------------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total de Vendas */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-emerald-950/70 border border-emerald-800/40 text-emerald-400 flex items-center justify-center font-bold text-lg">
                $
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Total de Vendas</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {formatCurrency(data.kpis.totalSales)}
                </span>
              </div>
            </div>

            {/* Pedidos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-blue-950/70 border border-blue-800/40 text-blue-400 flex items-center justify-center text-lg">
                🛍️
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Pedidos</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {data.kpis.orderCount}
                </span>
              </div>
            </div>

            {/* Ticket Médio */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-purple-950/70 border border-purple-800/40 text-purple-400 flex items-center justify-center text-lg">
                📈
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Ticket Médio</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {formatCurrency(data.kpis.averageTicket)}
                </span>
              </div>
            </div>

            {/* Itens Vendidos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-orange-950/70 border border-orange-800/40 text-orange-400 flex items-center justify-center text-lg">
                📦
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Itens Vendidos</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {data.kpis.itemsSold}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* LINHA 2: 4 CARDS OPERACIONAIS                                 */}
          {/* ------------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pedidos Ativos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-blue-950/70 border border-blue-800/40 text-blue-400 flex items-center justify-center text-lg">
                🕒
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Pedidos Ativos</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {data.kpis.activeOrders}
                </span>
              </div>
            </div>

            {/* Taxas de Entrega */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-cyan-950/70 border border-cyan-800/40 text-cyan-400 flex items-center justify-center text-lg">
                🚚
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Taxas de Entrega</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {formatCurrency(data.kpis.deliveryFees)}
                </span>
              </div>
            </div>

            {/* Cancelamentos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-red-950/70 border border-red-800/40 text-red-400 flex items-center justify-center text-lg">
                📊
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Cancelamentos</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {data.kpis.cancellations}{" "}
                  <span className="text-sm font-normal text-slate-400">
                    ({data.kpis.cancellationRate.toFixed(1)}%)
                  </span>
                </span>
              </div>
            </div>

            {/* Retiradas */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-4 flex items-center gap-4 shadow-md">
              <div className="w-11 h-11 rounded-xl bg-amber-950/70 border border-amber-800/40 text-amber-400 flex items-center justify-center text-lg">
                🏪
              </div>
              <div>
                <span className="text-xxs font-medium text-slate-400 block">Retiradas</span>
                <span className="text-lg font-bold text-white tracking-wide block mt-0.5">
                  {data.kpis.pickupCount}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SEÇÃO: MÉDIA DE TEMPO POR STATUS                              */}
          {/* ------------------------------------------------------------- */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs md:text-sm font-bold text-white">
                Média de Tempo por Status
              </h2>
              {data.peakHour && (
                <span className="text-xxs text-slate-400 font-mono">
                  {data.peakHour.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-3.5 shadow-md">
                <span className="text-xxs text-slate-400 block">Novo</span>
                <span className="text-base md:text-lg font-bold text-white block mt-1">
                  {formatTime(data.averageStatusTimes.novoMin)}
                </span>
              </div>

              <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-3.5 shadow-md">
                <span className="text-xxs text-slate-400 block">Em preparo</span>
                <span className="text-base md:text-lg font-bold text-white block mt-1">
                  {formatTime(data.averageStatusTimes.emPreparoMin)}
                </span>
              </div>

              <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-3.5 shadow-md">
                <span className="text-xxs text-slate-400 block">Em rota</span>
                <span className="text-base md:text-lg font-bold text-white block mt-1">
                  {formatTime(data.averageStatusTimes.emRotaMin)}
                </span>
              </div>

              <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-3.5 shadow-md">
                <span className="text-xxs text-slate-400 block">Até balcão</span>
                <span className="text-base md:text-lg font-bold text-white block mt-1">
                  {formatTime(data.averageStatusTimes.balcaoMin)}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SEÇÃO DO MEIO (3 COLUNAS): STATUS, CANAIS E PAGAMENTOS        */}
          {/* ------------------------------------------------------------- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Status dos Pedidos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <h3 className="text-xs md:text-sm font-bold text-white">Status dos Pedidos</h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Novo Pedido</span>
                  <span className="font-bold text-white">{data.statusCounts.novo}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Em Preparo</span>
                  <span className="font-bold text-white">{data.statusCounts.em_preparo}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Em Rota de Entrega</span>
                  <span className="font-bold text-white">{data.statusCounts.em_rota}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Pronto para Retirada</span>
                  <span className="font-bold text-white">{data.statusCounts.pronto_retirada}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Entregue</span>
                  <span className="font-bold text-white">{data.statusCounts.entregue}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Cancelado</span>
                  <span className="font-bold text-white">{data.statusCounts.cancelado}</span>
                </div>
              </div>
            </div>

            {/* Canais de Pedido */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <h3 className="text-xs md:text-sm font-bold text-white">Canais de Pedido</h3>
              <div className="space-y-3.5 text-xs">
                {data.channels.map((chan) => (
                  <div key={chan.key} className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-white block">{chan.label}</span>
                      <span className="text-xxs text-slate-400 block">{chan.count} pedidos</span>
                    </div>
                    <span className="font-bold text-white text-xs md:text-sm">
                      {formatCurrency(chan.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagamentos */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <h3 className="text-xs md:text-sm font-bold text-white">Pagamentos</h3>
              <div className="space-y-3 text-xs">
                {data.payments.map((pm) => (
                  <div key={pm.key} className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">💳</span>
                      <div>
                        <span className="font-semibold text-white block">{pm.label}</span>
                        <span className="text-xxs text-slate-400 block">{pm.count} pedidos</span>
                      </div>
                    </div>
                    <span className="font-bold text-white text-xs md:text-sm">
                      {formatCurrency(pm.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SEÇÃO INFERIOR (3 COLUNAS): HORÁRIOS DE MOVIMENTO, TOP PRODUTOS, INGREDIENTES */}
          {/* ------------------------------------------------------------- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
            {/* 1. HORÁRIOS DE MOVIMENTO (Média geral por dia da semana) */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-bold text-white">Horários de Movimento</h3>
                <span className="text-xxs text-slate-400 block mt-0.5">
                  Média geral por dia da semana
                </span>
              </div>

              <div className="space-y-3.5 pt-1">
                {data.weekdaySales.map((w) => {
                  const fillPercent =
                    maxAverageOrders > 0
                      ? Math.min(100, (w.averageOrders / maxAverageOrders) * 100)
                      : 0;

                  return (
                    <div key={w.dayName} className="flex items-center justify-between gap-3 text-xs">
                      {/* Nome do dia */}
                      <span className="w-16 text-slate-300 font-medium text-xs truncate">
                        {w.dayName}
                      </span>

                      {/* Barra de Progresso Laranja Horizontal */}
                      <div className="flex-1 h-2 bg-[#1b263b] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(fillPercent, w.averageOrders > 0 ? 4 : 2)}%` }}
                        />
                      </div>

                      {/* Valor Numérico + 'média/dia' */}
                      <div className="w-16 text-right">
                        <span className="font-bold text-white block text-xs leading-none">
                          {w.averageOrders.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-xxxs text-slate-400 block mt-0.5 leading-none">
                          média/dia
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. TOP 6 PRODUTOS MAIS VENDIDOS */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <h3 className="text-xs md:text-sm font-bold text-white">
                Top 6 Produtos Mais Vendidos
              </h3>

              <div className="space-y-2.5">
                {data.topProducts.map((prod, idx) => (
                  <div
                    key={prod.name}
                    className="bg-[#18233a] border border-[#253450]/60 p-2.5 rounded-xl flex items-center gap-3 shadow-inner"
                  >
                    <div className="w-6 h-6 rounded-lg bg-orange-950/90 border border-orange-800/40 text-orange-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-white block text-xs truncate">
                        {prod.name}
                      </span>
                      <span className="text-xxs text-slate-400 block">
                        {prod.quantity} vendidos - {formatCurrency(prod.revenue)}
                      </span>
                    </div>
                  </div>
                ))}

                {data.topProducts.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Nenhum produto registrado no período.
                  </div>
                )}
              </div>
            </div>

            {/* 3. INGREDIENTES FAVORITOS */}
            <div className="bg-[#131b2e] border border-[#202b40] rounded-xl p-5 shadow-md space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-bold text-white">Ingredientes Favoritos</h3>
                <span className="text-xxs text-slate-400 block mt-0.5">
                  {data.ingredientFavorites.totalOutputs} saídas de ingredientes no período
                </span>
              </div>

              <div className="space-y-3.5 pt-1">
                {data.ingredientFavorites.items.map((ing, idx) => {
                  const greenPercent =
                    maxIngredientCount > 0
                      ? Math.min(100, (ing.count / maxIngredientCount) * 100)
                      : 0;

                  return (
                    <div key={ing.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded-md bg-emerald-950/80 border border-emerald-800/40 text-emerald-400 flex items-center justify-center font-bold text-xxs">
                            {idx + 1}
                          </div>
                          <div>
                            <span className="font-semibold text-white block text-xs">
                              {ing.name}
                            </span>
                            <span className="text-xxxs text-slate-400 block">
                              {ing.count} saídas • base {ing.baseCount}
                            </span>
                          </div>
                        </div>
                        <span className="font-bold text-white text-xs">{ing.count}</span>
                      </div>

                      {/* Barra Verde Horizontal */}
                      <div className="h-1.5 w-full bg-[#1b263b] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(greenPercent, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {data.ingredientFavorites.items.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Nenhum ingrediente registrado no período.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
