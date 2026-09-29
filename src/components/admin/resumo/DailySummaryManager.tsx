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

interface DailyPaymentRecord {
  id: string;
  comandaId?: string;
  comandaNumber?: number;
  responsibleName?: string | null;
  method: "PIX" | "DINHEIRO" | "DEBITO" | "CREDITO";
  amount: number;
  changeFor?: number | null;
  troco?: number | null;
  createdAt: string;
}

interface FinancialBreakdown {
  totalRevenue: number;
  totalDeliveryFee: number;
  totalPix: number;
  totalDinheiro: number;
  totalDebito: number;
  totalCredito: number;
  ordersBreakdown: {
    total: number;
    pix: number;
    dinheiro: number;
    debito: number;
    credito: number;
    deliveryFee: number;
    count: number;
  };
  comandasBreakdown: {
    total: number;
    pix: number;
    dinheiro: number;
    debito: number;
    credito: number;
    count: number;
    payments: DailyPaymentRecord[];
  };
}

interface SummaryData {
  date: string;
  total: number;
  totalRevenue?: number;
  totalDeliveryFee?: number;
  totalPix?: number;
  totalDinheiro?: number;
  totalDebito?: number;
  totalCredito?: number;
  financial?: FinancialBreakdown;
  count: number;
  canceledCount?: number;
  finishedCount: number;
  averageTicket: number;
  orders: SummaryOrder[];
  comandaPayments?: DailyPaymentRecord[];
  stalledDeliveryAlert: StalledOrder[];
}

export default function DailySummaryManager() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa: Pedidos ou Baixas de Comanda
  const [activeTab, setActiveTab] = useState<"ORDERS" | "COMANDAS">("ORDERS");

  // Filtros de pedidos
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

  const formatCurrency = (val: number | undefined | null) =>
    `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusColors: Record<string, string> = {
    NOVO: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    EM_PREPARO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    EM_ROTA: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    PRONTO_RETIRADA: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    ENTREGUE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    CANCELADO: "bg-red-500/10 text-red-400 border-red-500/20",
    COMANDA_MESA: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  };

  const methodBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
    PIX: { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30" },
    DINHEIRO: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
    DEBITO: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
    CREDITO: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
  };

  // Impressão térmica / relatório diário de fechamento de caixa
  const handlePrintDailyReport = () => {
    if (!data) return;

    const printWin = window.open("", "_blank", "width=480,height=700");
    if (!printWin) {
      alert("Permita pop-ups no navegador para imprimir o relatório.");
      return;
    }

    const totalPix = data.totalPix ?? data.financial?.totalPix ?? 0;
    const totalDinheiro = data.totalDinheiro ?? data.financial?.totalDinheiro ?? 0;
    const totalDebito = data.totalDebito ?? data.financial?.totalDebito ?? 0;
    const totalCredito = data.totalCredito ?? data.financial?.totalCredito ?? 0;
    const totalDeliveryFee = data.totalDeliveryFee ?? data.financial?.totalDeliveryFee ?? 0;
    const grandTotal = data.totalRevenue ?? data.total ?? 0;
    const comandaPayments = data.comandaPayments ?? data.financial?.comandasBreakdown?.payments ?? [];

    const paymentsRows = comandaPayments
      .map(
        (p) => `
        <tr>
          <td style="padding: 4px 2px; font-size: 11px;">${new Date(p.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
          <td style="padding: 4px 2px; font-size: 11px; font-weight: bold;">Mesa #${p.comandaNumber || "--"}</td>
          <td style="padding: 4px 2px; font-size: 11px;">${p.method}</td>
          <td style="padding: 4px 2px; font-size: 11px; text-align: right; font-weight: bold;">${formatCurrency(p.amount)}</td>
        </tr>
      `
      )
      .join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fechamento de Caixa - ${selectedDate}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 320px;
            margin: 0 auto;
            padding: 10px;
            color: #000;
            background: #fff;
            font-size: 12px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          @media print {
            body { width: 100%; margin: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="text-center bold" style="font-size: 15px;">ALLDELIVERY</div>
        <div class="text-center" style="font-size: 12px;">RESUMO DIARIO & FECHAMENTO</div>
        <div class="text-center" style="font-size: 10px;">Data: ${selectedDate} | Emitido: ${new Date().toLocaleTimeString("pt-BR")}</div>
        
        <div class="divider"></div>
        <div class="bold" style="font-size: 12px;">FORMA DE PAGAMENTO (TOTAL)</div>
        <div class="divider"></div>
        <div class="row"><span>⚡ PIX:</span><span class="bold">${formatCurrency(totalPix)}</span></div>
        <div class="row"><span>💵 DINHEIRO:</span><span class="bold">${formatCurrency(totalDinheiro)}</span></div>
        <div class="row"><span>💳 CARTAO DEBITO:</span><span class="bold">${formatCurrency(totalDebito)}</span></div>
        <div class="row"><span>💳 CARTAO CREDITO:</span><span class="bold">${formatCurrency(totalCredito)}</span></div>
        <div class="row"><span>🛵 TAXA DE ENTREGA:</span><span class="bold">${formatCurrency(totalDeliveryFee)}</span></div>
        <div class="divider"></div>
        <div class="row bold" style="font-size: 14px;">
          <span>FATURAMENTO TOTAL:</span>
          <span>${formatCurrency(grandTotal)}</span>
        </div>
        <div class="divider"></div>

        <div class="bold" style="font-size: 11px;">METRICAS OPERACIONAIS</div>
        <div class="row"><span>Total Pedidos:</span><span>${data.count}</span></div>
        <div class="row"><span>Pedidos Finalizados:</span><span>${data.finishedCount}</span></div>
        <div class="row"><span>Ticket Medio:</span><span>${formatCurrency(data.averageTicket)}</span></div>
        <div class="row"><span>Baixas de Mesas/Comandas:</span><span>${comandaPayments.length} baixas</span></div>

        ${
          comandaPayments.length > 0
            ? `
          <div class="divider"></div>
          <div class="bold" style="font-size: 11px;">BAIXAS DE MESAS DO DIA</div>
          <table>
            <thead>
              <tr style="border-bottom: 1px dashed #000;">
                <th style="text-align: left; font-size: 10px;">HORA</th>
                <th style="text-align: left; font-size: 10px;">MESA</th>
                <th style="text-align: left; font-size: 10px;">FORMA</th>
                <th style="text-align: right; font-size: 10px;">VALOR</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRows}
            </tbody>
          </table>
        `
            : ""
        }

        <div class="divider"></div>
        <div class="text-center" style="font-size: 10px; margin-top: 10px;">
          Sistema AllDelivery - Fechamento Seguro
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  const totalPix = data?.totalPix ?? data?.financial?.totalPix ?? 0;
  const totalDinheiro = data?.totalDinheiro ?? data?.financial?.totalDinheiro ?? 0;
  const totalDebito = data?.totalDebito ?? data?.financial?.totalDebito ?? 0;
  const totalCredito = data?.totalCredito ?? data?.financial?.totalCredito ?? 0;
  const totalDeliveryFee = data?.totalDeliveryFee ?? data?.financial?.totalDeliveryFee ?? 0;
  const grandTotalRevenue = data?.totalRevenue ?? data?.total ?? 0;
  const comandaPayments = data?.comandaPayments ?? data?.financial?.comandasBreakdown?.payments ?? [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans pb-12">
      {/* Header & Seletor de Data */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-red">📅</span> Resumo Diário & Fechamento de Caixa
          </h2>
          <p className="text-xs text-brand-lightGray mt-1 capitalize">
            {formattedDateHeader}
          </p>
        </div>

        {/* Controles de Navegação de Data & Impressão */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrintDailyReport}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500 hover:text-black text-xs font-bold text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
            title="Imprimir Relatório de Fechamento"
          >
            <span>🖨️</span>
            <span>Imprimir Resumo</span>
          </button>

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

      {/* 🚨 Alerta de Entregas Aguardando Fechamento */}
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

      {/* ========================================================= */}
      {/* 💰 CARDS FINANCEIROS DESTACADOS: FORMAS DE PAGAMENTO & CAIXA */}
      {/* ========================================================= */}
      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
              <span>💳</span> Resumo de Entradas no Caixa por Forma de Pagamento
            </h3>
            <span className="text-xxs text-brand-lightGray">
              Consolidação de Pedidos Delivery/Balcão + Baixas de Mesas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {/* 1. DINHEIRO */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-lg flex flex-col justify-between transition-all hover:border-emerald-500/50">
              <div>
                <div className="flex items-center justify-between text-emerald-400">
                  <span className="text-xxs font-bold uppercase tracking-wider">💵 Dinheiro</span>
                  <span className="text-xs">R$</span>
                </div>
                <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                  {formatCurrency(totalDinheiro)}
                </div>
              </div>
              <div className="text-xxxs text-emerald-400/80 mt-2.5 pt-2 border-t border-emerald-500/20 space-y-0.5">
                <div>Pedidos: {formatCurrency(data.financial?.ordersBreakdown.dinheiro || 0)}</div>
                <div>Mesas: {formatCurrency(data.financial?.comandasBreakdown.dinheiro || 0)}</div>
              </div>
            </div>

            {/* 2. PIX */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 shadow-lg flex flex-col justify-between transition-all hover:border-cyan-500/50">
              <div>
                <div className="flex items-center justify-between text-cyan-400">
                  <span className="text-xxs font-bold uppercase tracking-wider">⚡ PIX</span>
                  <span className="text-xs">Pix</span>
                </div>
                <div className="text-xl font-bold font-mono text-cyan-300 mt-1">
                  {formatCurrency(totalPix)}
                </div>
              </div>
              <div className="text-xxxs text-cyan-400/80 mt-2.5 pt-2 border-t border-cyan-500/20 space-y-0.5">
                <div>Pedidos: {formatCurrency(data.financial?.ordersBreakdown.pix || 0)}</div>
                <div>Mesas: {formatCurrency(data.financial?.comandasBreakdown.pix || 0)}</div>
              </div>
            </div>

            {/* 3. DÉBITO */}
            <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-4 shadow-lg flex flex-col justify-between transition-all hover:border-blue-500/50">
              <div>
                <div className="flex items-center justify-between text-blue-400">
                  <span className="text-xxs font-bold uppercase tracking-wider">💳 Débito</span>
                  <span className="text-xs">Cartão</span>
                </div>
                <div className="text-xl font-bold font-mono text-blue-300 mt-1">
                  {formatCurrency(totalDebito)}
                </div>
              </div>
              <div className="text-xxxs text-blue-400/80 mt-2.5 pt-2 border-t border-blue-500/20 space-y-0.5">
                <div>Pedidos: {formatCurrency(data.financial?.ordersBreakdown.debito || 0)}</div>
                <div>Mesas: {formatCurrency(data.financial?.comandasBreakdown.debito || 0)}</div>
              </div>
            </div>

            {/* 4. CRÉDITO */}
            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 shadow-lg flex flex-col justify-between transition-all hover:border-purple-500/50">
              <div>
                <div className="flex items-center justify-between text-purple-400">
                  <span className="text-xxs font-bold uppercase tracking-wider">💳 Crédito</span>
                  <span className="text-xs">Cartão</span>
                </div>
                <div className="text-xl font-bold font-mono text-purple-300 mt-1">
                  {formatCurrency(totalCredito)}
                </div>
              </div>
              <div className="text-xxxs text-purple-400/80 mt-2.5 pt-2 border-t border-purple-500/20 space-y-0.5">
                <div>Pedidos: {formatCurrency(data.financial?.ordersBreakdown.credito || 0)}</div>
                <div>Mesas: {formatCurrency(data.financial?.comandasBreakdown.credito || 0)}</div>
              </div>
            </div>

            {/* 5. TAXA DE ENTREGA */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-lg flex flex-col justify-between transition-all hover:border-amber-500/50">
              <div>
                <div className="flex items-center justify-between text-amber-400">
                  <span className="text-xxs font-bold uppercase tracking-wider">🛵 Taxa Entrega</span>
                  <span className="text-xs">Frete</span>
                </div>
                <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                  {formatCurrency(totalDeliveryFee)}
                </div>
              </div>
              <div className="text-xxxs text-amber-400/80 mt-2.5 pt-2 border-t border-amber-500/20">
                Total acumulado em fretes delivery
              </div>
            </div>

            {/* 6. FATURAMENTO TOTAL GERAL */}
            <div className="rounded-2xl border border-brand-red/40 bg-gradient-to-br from-brand-red/20 to-brand-darkGray p-4 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-brand-red">
                  <span className="text-xxs font-bold uppercase tracking-wider">💰 Faturamento Total</span>
                  <span className="text-xs">Geral</span>
                </div>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {formatCurrency(grandTotalRevenue)}
                </div>
              </div>
              <div className="text-xxxs text-brand-lightGray mt-2.5 pt-2 border-t border-brand-red/20">
                Soma total das entradas no dia
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs Operacionais do Dia */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-3.5 shadow">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray">Total Pedidos</span>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{data.count}</div>
          </div>

          <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-3.5 shadow">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray">Finalizados</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{data.finishedCount}</div>
          </div>

          <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-3.5 shadow">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray">Ticket Médio</span>
            <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">{formatCurrency(data.averageTicket)}</div>
          </div>

          <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-3.5 shadow">
            <span className="text-xxs font-semibold uppercase text-brand-lightGray">Baixas em Mesas</span>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">{comandaPayments.length} baixas</div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SELETOR DE SEÇÕES: PEDIDOS DO DIA VS BAIXAS DE MESAS */}
      {/* ========================================================= */}
      <div className="space-y-4">
        <div className="flex border-b border-brand-mediumGray gap-4 pb-2">
          <button
            onClick={() => setActiveTab("ORDERS")}
            className={`font-serif text-base font-bold pb-2 transition-colors cursor-pointer border-b-2 ${
              activeTab === "ORDERS"
                ? "border-brand-red text-white"
                : "border-transparent text-brand-lightGray hover:text-white"
            }`}
          >
            📦 Pedidos Delivery & Balcão ({data?.orders.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("COMANDAS")}
            className={`font-serif text-base font-bold pb-2 transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === "COMANDAS"
                ? "border-brand-red text-white"
                : "border-transparent text-brand-lightGray hover:text-white"
            }`}
          >
            <span>🍽️ Baixas de Comandas e Mesas</span>
            <span className="text-xxs font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              {comandaPayments.length}
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* ABA 1: LISTAGEM DE PEDIDOS DELIVERY & RETIRADA */}
        {/* ========================================================= */}
        {activeTab === "ORDERS" && (
          <div className="space-y-4">
            {/* Barra de Filtros de Pedidos */}
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
        )}

        {/* ========================================================= */}
        {/* ABA 2: LISTAGEM DE BAIXAS DE COMANDAS E MESAS NO DIA */}
        {/* ========================================================= */}
        {activeTab === "COMANDAS" && (
          <div className="space-y-4">
            {/* Banner de Totalizador das Baixas de Comanda */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-center">
                <span className="text-xxs font-bold uppercase text-cyan-400">⚡ Baixas em PIX</span>
                <div className="text-base font-bold font-mono text-cyan-300 mt-1">
                  {formatCurrency(data?.financial?.comandasBreakdown.pix || 0)}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-center">
                <span className="text-xxs font-bold uppercase text-emerald-400">💵 Baixas em Dinheiro</span>
                <div className="text-base font-bold font-mono text-emerald-300 mt-1">
                  {formatCurrency(data?.financial?.comandasBreakdown.dinheiro || 0)}
                </div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-3 text-center">
                <span className="text-xxs font-bold uppercase text-blue-400">💳 Baixas em Débito</span>
                <div className="text-base font-bold font-mono text-blue-300 mt-1">
                  {formatCurrency(data?.financial?.comandasBreakdown.debito || 0)}
                </div>
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3 text-center">
                <span className="text-xxs font-bold uppercase text-purple-400">💳 Baixas em Crédito</span>
                <div className="text-base font-bold font-mono text-purple-300 mt-1">
                  {formatCurrency(data?.financial?.comandasBreakdown.credito || 0)}
                </div>
              </div>
            </div>

            {/* Tabela de Baixas */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden shadow-lg">
              <div className="p-4 border-b border-brand-mediumGray/50 flex justify-between items-center">
                <h4 className="font-serif text-sm font-bold text-white flex items-center gap-2">
                  <span>🍽️</span> Baixas Efetuadas no Salão de Mesas
                </h4>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Total Baixado: {formatCurrency(data?.financial?.comandasBreakdown.total || 0)}
                </span>
              </div>

              {comandaPayments.length === 0 ? (
                <div className="p-12 text-center text-xs text-brand-lightGray/50">
                  Nenhuma baixa de mesa registrada nesta data.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-brand-bg/80 text-brand-lightGray uppercase text-xxs border-b border-brand-mediumGray/40">
                      <tr>
                        <th className="py-3 px-4">Horário</th>
                        <th className="py-3 px-4">Mesa / Comanda</th>
                        <th className="py-3 px-4">Responsável</th>
                        <th className="py-3 px-4">Forma de Pagamento</th>
                        <th className="py-3 px-4 text-right">Valor Baixado</th>
                        <th className="py-3 px-4">Troco / Obs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-mediumGray/30 text-brand-lightGray">
                      {comandaPayments.map((p) => {
                        const badge = methodBadgeColors[p.method] || {
                          bg: "bg-gray-500/10",
                          text: "text-gray-400",
                          border: "border-gray-500/20",
                        };

                        return (
                          <tr key={p.id} className="hover:bg-brand-bg/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-white text-xs">
                              {new Date(p.createdAt).toLocaleTimeString("pt-BR")}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-white text-xs">
                                Mesa #{p.comandaNumber ? String(p.comandaNumber).padStart(2, "0") : "--"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {p.responsibleName ? (
                                <span className="text-white font-medium">{p.responsibleName}</span>
                              ) : (
                                <span className="text-brand-lightGray/40 italic">Consumo Local</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xxs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                              >
                                {p.method === "PIX"
                                  ? "⚡ PIX"
                                  : p.method === "DINHEIRO"
                                  ? "💵 Dinheiro"
                                  : p.method === "DEBITO"
                                  ? "💳 Débito"
                                  : "💳 Crédito"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white text-sm">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="py-3 px-4 text-xxs">
                              {p.method === "DINHEIRO" && p.changeFor && p.troco && p.troco > 0 ? (
                                <span className="text-emerald-400 font-mono">
                                  Troco: {formatCurrency(p.troco)} (de {formatCurrency(p.changeFor)})
                                </span>
                              ) : (
                                <span className="text-brand-lightGray/40">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
