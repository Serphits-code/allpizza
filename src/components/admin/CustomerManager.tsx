"use client";

import React, { useState, useMemo } from "react";
import { OrderStatus } from "@prisma/client";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
}

interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: OrderItem[];
}

interface CustomerProfile {
  phoneKey: string;
  notes?: string | null;
  displayNameOverride?: string | null;
}

export default function CustomerManager() {
  const [phoneQuery, setPhoneQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Perfil e Histórico Carregado
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  // Campos de Edição de Perfil
  const [notes, setNotes] = useState("");
  const [displayNameOverride, setDisplayNameOverride] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Executa busca por telefone
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneQuery.trim()) return;

    setLoading(true);
    setError(null);
    setProfile(null);
    setOrders([]);

    try {
      const res = await fetch(`/api/admin/customers?phone=${phoneQuery}`);
      const data = await res.json();

      if (data.found) {
        setProfile(data.profile);
        setOrders(data.orders);
        setNotes(data.profile.notes || "");
        setDisplayNameOverride(data.profile.displayNameOverride || "");
      } else {
        setError(data.error || "Nenhum histórico encontrado para este telefone.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao buscar histórico do cliente.");
    } finally {
      setLoading(false);
    }
  };

  // Salvar edições do perfil de contato
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSavingProfile(true);

    try {
      const res = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneKey: profile.phoneKey,
          notes,
          displayNameOverride,
        }),
      });
      const data = await res.json();

      if (data.success && data.profile) {
        setProfile(data.profile);
        alert("Perfil do cliente atualizado com sucesso!");
      } else {
        alert(data.error || "Erro ao atualizar perfil");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar atualizações");
    } finally {
      setSavingProfile(false);
    }
  };

  // Estatísticas calculadas do cliente
  const stats = useMemo(() => {
    if (orders.length === 0) return { count: 0, totalSpent: 0 };
    const count = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
    return { count, totalSpent };
  }, [orders]);

  return (
    <div className="space-y-8">
      
      {/* Busca por Telefone */}
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
        <h3 className="font-serif text-base font-bold text-white mb-4">Buscar Histórico de Cliente</h3>
        <form onSubmit={handleSearch} className="flex gap-4 items-center max-w-md text-xs">
          <input
            type="tel"
            required
            placeholder="Telefone com DDD (Ex: 81999999999)"
            value={phoneQuery}
            onChange={(e) => setPhoneQuery(e.target.value)}
            className="flex-1 rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-red hover:bg-brand-redHover px-5 py-2.5 font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
        {error && <span className="text-xxs text-brand-red mt-2 block">{error}</span>}
      </div>

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Ficha de Edição de Anotações */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-4">
            <h3 className="font-serif text-base font-bold text-brand-red">Anotações Internas</h3>
            
            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Chave do Contato (Telefone)
                </label>
                <input
                  type="text"
                  disabled
                  value={profile.phoneKey}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg/50 px-4 py-2 text-brand-lightGray cursor-not-allowed font-mono"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Nome Personalizado (Apelido/Override)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Dr. João Silva"
                  value={displayNameOverride}
                  onChange={(e) => setDisplayNameOverride(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Anotações de Atendimento
                </label>
                <textarea
                  placeholder="Ex: Prefere massa bem assada, reclama se atrasar, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-2.5 rounded-lg bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingProfile ? "Salvando..." : "Salvar Perfil"}
              </button>
            </form>
          </div>

          {/* Histórico de Compras */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Cards Estatísticas Rápidas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-4">
                <span className="text-xxs text-brand-lightGray font-sans uppercase">Total de Pedidos</span>
                <div className="text-xl font-bold font-mono text-white mt-1">{stats.count}</div>
              </div>
              <div className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-4">
                <span className="text-xxs text-brand-lightGray font-sans uppercase">Total Gasto</span>
                <div className="text-xl font-bold font-mono text-brand-red mt-1">R$ {stats.totalSpent.toFixed(2)}</div>
              </div>
            </div>

            {/* Listagem de Compras Passadas */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
              <h3 className="font-serif text-base font-bold text-white mb-4">Pedidos Anteriores</h3>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {orders.map((order) => (
                  <div key={order.id} className="border-b border-brand-mediumGray/30 pb-3 space-y-2 text-xxs">
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-mono font-bold text-brand-red">#{order.orderNumber}</span>
                        <span className="text-xxs text-brand-lightGray/85 ml-2 font-semibold">
                          ({new Date(order.createdAt).toLocaleDateString("pt-BR")})
                        </span>
                      </div>
                      <span className="font-mono font-bold text-white">R$ {order.total.toFixed(2)}</span>
                    </div>

                    <div className="space-y-0.5 bg-brand-bg/40 p-2 rounded border border-brand-mediumGray/20 text-brand-lightGray">
                      {order.items.map((item) => (
                        <div key={item.id}>
                          <span className="font-bold text-white">{item.quantity}x</span> {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {orders.length === 0 && (
                  <div className="text-center text-xxs text-brand-lightGray/50 py-12">Nenhum pedido registrado.</div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
