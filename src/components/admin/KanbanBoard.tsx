"use client";

import React, { useEffect, useState, useMemo } from "react";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
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
  crustPrice: number;
  flavors: {
    id: string;
    flavorName: string;
    categoryName: string;
  }[];
  toppings?: {
    id?: string;
    toppingName?: string;
    name?: string;
    targetType: string;
    flavorName?: string | null;
    slicesCount?: number;
    price?: number;
  }[];
}

interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  type: OrderType;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  addressNumber?: string | null;
  reference?: string | null;
  paymentMethod: PaymentMethod;
  changeFor?: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string | null;
  createdAt: string | Date;
  items: OrderItem[];
  payments?: { id?: string; method: string; amount: number }[];
}

interface KanbanBoardProps {
  initialOrders: any[];
  initialStoreOpen: boolean;
}

export default function KanbanBoard({ initialOrders, initialStoreOpen }: KanbanBoardProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [storeOpen, setStoreOpen] = useState<boolean>(initialStoreOpen);

  // Impressao e feita automaticamente pelo Electron via SSE ao criar/atualizar pedidos

  // Se conecta ao SSE Stream no mount para receber atualizacoes automaticas
  useEffect(() => {
    const eventSource = new EventSource("/api/print/events");

    eventSource.addEventListener("order_created", (event: any) => {
      const newOrder = JSON.parse(event.data);
      console.log("[SSE] Novo pedido recebido no painel:", newOrder.orderNumber);
      
      // Toca um alerta sonoro discreto de notificacao sem dependência externa
      playNotificationSound();

      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
    });

    eventSource.addEventListener("order_updated", (event: any) => {
      const updatedOrder = JSON.parse(event.data);
      console.log("[SSE] Pedido atualizado no painel:", updatedOrder.orderNumber);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );
    });

    eventSource.addEventListener("store_status_changed", (event: any) => {
      const data = JSON.parse(event.data);
      console.log("[SSE] Status do delivery alterado:", data.open);
      setStoreOpen(data.open); 
    });

    eventSource.onerror = (err) => {
      console.error("[SSE] Erro no stream do Kanban. Tentando reconectar...", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleToggleStore = async () => {
    const nextState = !storeOpen;
    try {
      const res = await fetch("/api/admin/store-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: nextState }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Erro ao alterar status da loja");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar para alterar status da loja");
    }
  };

  // Handler para atualizar o status do pedido
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      
      if (!data.success) {
        alert(data.error || "Erro ao atualizar status");
      }
    } catch (err) {
      console.error("Status update error:", err);
      alert("Erro de conexao ao atualizar status.");
    }
  };

  // Separacao de pedidos pelas colunas convencionais e areas exclusivas
  const columns = useMemo(() => {
    // Coluna Novos recebe tanto Delivery, Retirada quanto Comandas de Mesa
    const novo = orders.filter((o) => o.status === OrderStatus.NOVO);

    // Coluna Em Preparo (Na Cozinha)
    const emPreparo = orders.filter((o) => o.status === OrderStatus.EM_PREPARO);

    // Coluna Em Rota (apenas Delivery)
    const emRota = orders.filter(
      (o) => o.status === OrderStatus.EM_ROTA && o.type === OrderType.DELIVERY
    );

    // Coluna Concluídos
    const entregue = orders.filter((o) => o.status === OrderStatus.ENTREGUE);

    // Area de Balcao (PRONTO_RETIRADA para Retirada)
    const balcao = orders.filter(
      (o) => o.status === OrderStatus.PRONTO_RETIRADA && o.type === OrderType.RETIRADA
    );

    // Area de Comandas de Mesa (Prontos para Servir no salão ou em consumo)
    const comandas = orders.filter(
      (o) =>
        o.type === OrderType.COMANDA &&
        (o.status === OrderStatus.PRONTO_RETIRADA || o.status === OrderStatus.COMANDA_MESA)
    );

    return { novo, emPreparo, emRota, entregue, balcao, comandas };
  }, [orders]);

  const renderOrderCard = (order: Order) => {
    const paymentLabels = {
      [PaymentMethod.PIX]: "PIX",
      [PaymentMethod.DINHEIRO]: "Dinheiro",
      [PaymentMethod.CREDITO]: "Credito",
      [PaymentMethod.DEBITO]: "Debito",
    };

    const isTableOrder = order.type === OrderType.COMANDA;

    return (
      <div
        key={order.id}
        className={`rounded-xl border bg-brand-bg p-4 space-y-3 hover:border-brand-lightGray/30 transition-all text-xs ${
          isTableOrder ? "border-purple-500/40 bg-purple-950/10" : "border-brand-mediumGray"
        }`}
      >
        {/* Header do Card */}
        <div className="flex justify-between items-start">
          <div>
            <span className="font-mono font-bold text-brand-red text-sm">#{order.orderNumber}</span>
            <span className="block text-xxs text-brand-lightGray/85 capitalize font-semibold">
              {order.customerName}
            </span>
          </div>
          <span
            className={`text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
              isTableOrder
                ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                : order.type === OrderType.DELIVERY
                ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                : "bg-amber-500/15 text-amber-300 border-amber-500/25"
            }`}
          >
            {isTableOrder
              ? `🍽️ ${order.customerName.includes("Mesa") ? order.customerName : "Mesa"}`
              : order.type === OrderType.DELIVERY
              ? "🛵 Delivery"
              : "🛍️ Retirada"}
          </span>
        </div>

        {/* Itens do Pedido */}
        <div className="space-y-1.5 bg-brand-darkGray/40 p-2.5 rounded border border-brand-mediumGray/20">
          {order.items.map((item) => (
            <div key={item.id} className="text-xs text-brand-lightGray leading-normal">
              <span className="font-bold text-white">{item.quantity}x</span> {item.name}
              {item.isPizza && item.flavors.length > 0 && (
                <div className="space-y-1 mt-1 pl-1 border-l-2 border-brand-red/60">
                  {item.flavors.map((f, i) => {
                    const cleanName = f.flavorName.replace(/^\d+\s*fatias?\s*(?:de\s*)?/i, "").trim();
                    const sliceMatch = f.flavorName.match(/^(\d+)\s*fat/i);
                    const flavorToppings = (item.toppings || [])
                      .filter((t: any) => {
                        if (t.targetType === "FULL" || t.targetType === "INTEIRA" || !t.flavorName) return false;
                        const target = (t.flavorName || "").toLowerCase().replace(/^\d+\s*fatias?\s*/i, "").trim();
                        const fn = cleanName.toLowerCase();
                        return target === fn || target.includes(fn) || fn.includes(target);
                      })
                      .map((t: any) => t.toppingName || t.name);

                    return (
                      <div key={f.id || i} className="text-xxs flex items-center gap-1.5 flex-wrap">
                        {sliceMatch ? (
                          <span className="bg-brand-red text-white font-extrabold px-1 py-0.5 rounded text-xxxs tracking-wide">
                            {sliceMatch[1]} FAT
                          </span>
                        ) : null}
                        <span className="text-white font-semibold">{cleanName}</span>
                        {flavorToppings.length > 0 && (
                          <span className="text-emerald-400 font-bold text-xxxs">
                            (+ {flavorToppings.join(", ")})
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {(item.toppings || [])
                    .filter((t: any) => t.targetType === "FULL" || t.targetType === "INTEIRA" || !t.flavorName)
                    .map((t: any, idx: number) => (
                      <div key={idx} className="text-xxxs text-emerald-400 font-bold pl-1">
                        + Toda pizza: {t.toppingName || t.name}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Notas da Cozinha (Destacada) */}
        {order.notes && (
          <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-start gap-1.5">
            <span>⚠️</span>
            <div>
              <span className="block text-xxxs uppercase tracking-wider font-extrabold text-emerald-400">Observação da Cozinha:</span>
              <span>&quot;{order.notes}&quot;</span>
            </div>
          </div>
        )}

        {/* Informacoes de Endereco ou Mesa */}
        {order.type === OrderType.DELIVERY && order.customerAddress && (
          <div className="text-xxs text-brand-lightGray">
            📍 {order.customerAddress}, {order.addressNumber}
            {order.reference && <span className="block opacity-75">Ref: {order.reference}</span>}
          </div>
        )}

        {/* Pagamento e Valor */}
        {isTableOrder && order.payments && order.payments.length > 0 ? (
          <div className="space-y-1.5 pt-1.5 border-t border-purple-500/25">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-purple-300 font-extrabold text-xxs uppercase tracking-wider flex items-center gap-1">
                <span>🍽️</span> Baixas da Mesa ({order.payments.length}):
              </span>
              <span className="font-bold text-white text-xs font-mono">Total: R$ {order.total.toFixed(2)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {order.payments.map((p, idx) => (
                <span
                  key={idx}
                  className="bg-purple-950/70 border border-purple-500/40 text-purple-200 px-1.5 py-0.5 rounded text-xxs font-mono font-bold"
                >
                  {p.method === "PIX" ? "⚡ PIX" : p.method === "DINHEIRO" ? "💵 Dinheiro" : p.method === "DEBITO" ? "💳 Débito" : "💳 Crédito"}: R$ {Number(p.amount).toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center text-xs text-brand-lightGray font-mono pt-1">
            {!isTableOrder ? (
              <span>Pg: {paymentLabels[order.paymentMethod] || "Comanda"}</span>
            ) : order.status === OrderStatus.ENTREGUE ? (
              <span className="text-emerald-400 font-bold">✓ Concluído & Quitado</span>
            ) : order.status === OrderStatus.COMANDA_MESA ? (
              <span className="text-purple-300 font-bold">🍽️ Servido (Em Consumo)</span>
            ) : (
              <span className="text-purple-300 font-bold">🍽️ Consumo na Mesa</span>
            )}
            <span className="font-bold text-white text-xs">Total: R$ {order.total.toFixed(2)}</span>
          </div>
        )}

        {/* Acoes de Estado */}
        <div className="pt-2 flex flex-wrap gap-1.5 border-t border-brand-mediumGray/50">
          {/* Status NOVO -> Prepara */}
          {order.status === OrderStatus.NOVO && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.EM_PREPARO)}
              className="flex-1 bg-brand-red hover:bg-brand-redHover text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs"
            >
              Preparar (Cozinha)
            </button>
          )}

          {/* Status EM_PREPARO para Delivery -> Envia Rota */}
          {order.status === OrderStatus.EM_PREPARO && order.type === OrderType.DELIVERY && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.EM_ROTA)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs"
            >
              Enviar Rota
            </button>
          )}

          {/* Status EM_PREPARO para Retirada -> Balcão */}
          {order.status === OrderStatus.EM_PREPARO && order.type === OrderType.RETIRADA && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.PRONTO_RETIRADA)}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs"
            >
              Colocar no Balcao
            </button>
          )}

          {/* Status EM_PREPARO para Comanda de Mesa -> Pronto para Servir na Mesa */}
          {order.status === OrderStatus.EM_PREPARO && order.type === OrderType.COMANDA && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.PRONTO_RETIRADA)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs flex items-center justify-center gap-1 shadow-sm"
              title="Avisa o garçom no salão que o pedido está pronto para servir"
            >
              <span>🍽️</span> Pronto p/ Servir (Mesa)
            </button>
          )}

          {/* Status EM_ROTA (Delivery) -> Conclui */}
          {order.status === OrderStatus.EM_ROTA && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.ENTREGUE)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs"
            >
              Entregue
            </button>
          )}

          {/* Status PRONTO_RETIRADA (Retirada) -> Cliente Retirou */}
          {order.status === OrderStatus.PRONTO_RETIRADA && order.type === OrderType.RETIRADA && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.ENTREGUE)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs"
            >
              Cliente Retirou
            </button>
          )}

          {/* Status PRONTO_RETIRADA (Mesa) -> Garçom / Admin marca como Servido */}
          {order.status === OrderStatus.PRONTO_RETIRADA && order.type === OrderType.COMANDA && (
            <button
              onClick={() => handleUpdateStatus(order.id, OrderStatus.COMANDA_MESA)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded font-bold transition-colors cursor-pointer text-center text-xxs flex items-center justify-center gap-1"
            >
              <span>✓</span> Servido na Mesa
            </button>
          )}

          {/* Status COMANDA_MESA (Mesa) -> Já servido na mesa, em consumo no salão */}
          {order.status === OrderStatus.COMANDA_MESA && (
            <span className="flex-1 text-center py-1 bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold rounded text-xxs flex items-center justify-center gap-1">
              <span>🍽️</span> Servido na Mesa (Em Consumo)
            </span>
          )}

          {/* Pedidos concluídos */}
          {order.status === OrderStatus.ENTREGUE && (
            <span className="flex-1 text-center py-1 bg-green-500/10 border border-green-500/20 text-green-400 font-bold rounded text-xxs">
              ✓ Pedido Concluido
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      
      {/* Grid Principal do Kanban (Delivery Convencional) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="font-serif text-lg font-bold text-brand-red border-l-4 border-brand-red pl-2.5">
            Fluxo de Entrega (Delivery)
          </h3>
          
          <div className="flex items-center gap-3">
            {/* Botao de Status do Delivery */}
            <button
              onClick={handleToggleStore}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all border ${
                storeOpen
                  ? "bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/25"
                  : "bg-brand-red/10 border-brand-red/35 text-brand-red hover:bg-brand-red/25"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${storeOpen ? "bg-green-400 animate-pulse" : "bg-brand-red"}`} />
              DELIVERY: {storeOpen ? "ABERTO (ON)" : "FECHADO (OFF)"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Coluna 1: NOVO */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 flex flex-col space-y-4 min-h-[300px]">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-2">
              <span className="font-bold text-xs uppercase text-white">Novos</span>
              <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-brand-red text-xxs">
                {columns.novo.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
              {columns.novo.map(renderOrderCard)}
              {columns.novo.length === 0 && (
                <div className="text-center text-xxs text-brand-lightGray/50 py-12">Sem novos pedidos.</div>
              )}
            </div>
          </div>

          {/* Coluna 2: EM PREPARO */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 flex flex-col space-y-4 min-h-[300px]">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-2">
              <span className="font-bold text-xs uppercase text-white">Na Cozinha</span>
              <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-white text-xxs">
                {columns.emPreparo.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
              {columns.emPreparo.map(renderOrderCard)}
              {columns.emPreparo.length === 0 && (
                <div className="text-center text-xxs text-brand-lightGray/50 py-12">Nenhum em preparo.</div>
              )}
            </div>
          </div>

          {/* Coluna 3: EM ROTA */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 flex flex-col space-y-4 min-h-[300px]">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-2">
              <span className="font-bold text-xs uppercase text-white">Em Rota (Motoboy)</span>
              <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-blue-400 text-xxs">
                {columns.emRota.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
              {columns.emRota.map(renderOrderCard)}
              {columns.emRota.length === 0 && (
                <div className="text-center text-xxs text-brand-lightGray/50 py-12">Sem envios em rota.</div>
              )}
            </div>
          </div>

          {/* Coluna 4: ENTREGUE */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 flex flex-col space-y-4 min-h-[300px]">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-2">
              <span className="font-bold text-xs uppercase text-white">Concluidos</span>
              <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-green-400 text-xxs">
                {columns.entregue.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
              {columns.entregue.map(renderOrderCard)}
              {columns.entregue.length === 0 && (
                <div className="text-center text-xxs text-brand-lightGray/50 py-12">Sem concluidos hoje.</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Areas Laterais/Horizontais Exclusivas: Balcao & Comandas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-brand-mediumGray/40">
        
        {/* Balcao / Retiradas */}
        <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 flex flex-col space-y-4">
          <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-3">
            <h3 className="font-serif text-base font-bold text-white">
              Retirada no Balcao
            </h3>
            <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-brand-red text-xxs">
              {columns.balcao.length} ativas
            </span>
          </div>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
            {columns.balcao.map(renderOrderCard)}
            {columns.balcao.length === 0 && (
              <div className="text-center text-xxs text-brand-lightGray/50 py-12">Sem retiradas agendadas.</div>
            )}
          </div>
        </div>

        {/* Consumo Local / Comandas */}
        <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 flex flex-col space-y-4">
          <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-3">
            <h3 className="font-serif text-base font-bold text-white">
              Comandas de Mesa
            </h3>
            <span className="font-mono font-bold bg-brand-bg px-2.5 py-0.5 rounded text-brand-red text-xxs">
              {columns.comandas.length} mesas
            </span>
          </div>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
            {columns.comandas.map(renderOrderCard)}
            {columns.comandas.length === 0 && (
              <div className="text-center text-xxs text-brand-lightGray/50 py-12">Sem comandas abertas no local.</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
