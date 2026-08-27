"use client";

import React, { useState, useEffect, useTransition } from "react";
import { AggregatedContact, ContactDetail } from "@/lib/admin-contacts";

export default function ContactsMasterDetail() {
  // Estado da Lista Master
  const [contacts, setContacts] = useState<AggregatedContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [staleDays, setStaleDays] = useState("");
  const [hasNotesOnly, setHasNotesOnly] = useState(false);

  // Estado do Detalhe
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(null);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edição de Anotações e Nome
  const [notes, setNotes] = useState("");
  const [displayNameOverride, setDisplayNameOverride] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pedidos expandidos no histórico
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Debounce da busca (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  // Carrega Lista Master
  const fetchContacts = async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
        sort,
      });
      if (debouncedSearch) params.append("q", debouncedSearch);
      if (staleDays) params.append("staleDays", staleDays);
      if (hasNotesOnly) params.append("hasNotes", "true");

      const res = await fetch(`/api/admin/contacts?${params.toString()}`);
      const data = await res.json();

      setContacts(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);

      // Se nenhum contato selecionado e houver itens, seleciona o primeiro
      if (!selectedPhoneKey && data.items && data.items.length > 0) {
        setSelectedPhoneKey(data.items[0].phoneKey);
      }
    } catch (err) {
      console.error("Fetch contacts error:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [page, debouncedSearch, sort, staleDays, hasNotesOnly]);

  // Carrega Detalhe do Contato Selecionado
  const fetchContactDetail = async (phoneKey: string) => {
    setLoadingDetail(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/admin/contacts/${phoneKey}`);
      if (!res.ok) throw new Error("Erro ao buscar detalhes");
      const data: ContactDetail = await res.json();
      setContactDetail(data);
      setNotes(data.notes || "");
      setDisplayNameOverride(data.displayNameOverride || "");
      if (data.orders && data.orders.length > 0) {
        setExpandedOrderId(data.orders[0].id); // abre o pedido mais recente
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedPhoneKey) {
      fetchContactDetail(selectedPhoneKey);
    }
  }, [selectedPhoneKey]);

  // Salva Perfil de Anotações
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhoneKey) return;

    setSavingProfile(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/admin/contacts/${selectedPhoneKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          displayNameOverride,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        // Atualiza na lista master também
        setContacts((prev) =>
          prev.map((c) =>
            c.phoneKey === selectedPhoneKey
              ? {
                  ...c,
                  displayName: displayNameOverride.trim() || c.rawCustomerName,
                  displayNameOverride,
                  notes,
                  hasNotes: Boolean(notes.trim() || displayNameOverride.trim()),
                  notesPreview: notes.slice(0, 120),
                }
              : c
          )
        );
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar anotações do cliente");
    } finally {
      setSavingProfile(false);
    }
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

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
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-red">👥</span> Contatos & Histórico de Clientes
          </h2>
          <p className="text-xs text-brand-lightGray mt-1">
            Consolidação por telefone, anotações de atendimento e histórico completo de compras.
          </p>
        </div>
        <div className="text-xxs font-mono text-brand-lightGray bg-brand-bg px-3 py-1.5 rounded-lg border border-brand-mediumGray">
          Total de Clientes: <strong className="text-white">{total}</strong>
        </div>
      </div>

      {/* Grid Mestre-Detalhe */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Master List (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 space-y-4 shadow-xl">
          {/* Busca */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-2 text-xs text-brand-lightGray hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtros Secundários */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-brand-mediumGray bg-brand-bg px-2.5 py-1.5 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
            >
              <option value="recent">Mais Recentes</option>
              <option value="frequent">Mais Pedidos</option>
              <option value="spent">Maior Gasto Total</option>
            </select>

            <select
              value={staleDays}
              onChange={(e) => {
                setStaleDays(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-brand-mediumGray bg-brand-bg px-2.5 py-1.5 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
            >
              <option value="">Sem filtro de dias</option>
              <option value="7">&gt; 7 dias sem pedir</option>
              <option value="15">&gt; 15 dias sem pedir</option>
              <option value="30">&gt; 30 dias sem pedir</option>
              <option value="60">&gt; 60 dias sem pedir</option>
            </select>
          </div>

          {/* Checkbox Anotações */}
          <label className="flex items-center gap-2 text-xxs text-brand-lightGray cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasNotesOnly}
              onChange={(e) => {
                setHasNotesOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded bg-brand-bg border-brand-mediumGray text-brand-red focus:ring-0 cursor-pointer"
            />
            Somente contatos com anotações internas
          </label>

          {/* Lista de Contatos */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {loadingList && (
              <div className="py-12 text-center text-xs text-brand-lightGray animate-pulse">
                Carregando clientes...
              </div>
            )}

            {!loadingList && contacts.length === 0 && (
              <div className="py-12 text-center text-xs text-brand-lightGray/50">
                Nenhum contato encontrado com os filtros aplicados.
              </div>
            )}

            {!loadingList &&
              contacts.map((c) => {
                const isSelected = selectedPhoneKey === c.phoneKey;

                return (
                  <div
                    key={c.phoneKey}
                    onClick={() => setSelectedPhoneKey(c.phoneKey)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1.5 ${
                      isSelected
                        ? "bg-brand-red/10 border-brand-red shadow-md"
                        : "bg-brand-bg hover:bg-brand-bg/80 border-brand-mediumGray/50 hover:border-brand-lightGray/40"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-darkGray border border-brand-mediumGray flex items-center justify-center font-mono font-bold text-brand-red text-xxs">
                          {c.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white block leading-tight">
                            {c.displayName}
                          </span>
                          <span className="text-xxxs font-mono text-brand-lightGray">
                            {formatPhone(c.phoneKey)}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-brand-red text-xs">
                        {formatCurrency(c.totalSpent)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xxxs text-brand-lightGray pt-1 border-t border-brand-mediumGray/20">
                      <span>
                        {c.totalOrders} {c.totalOrders === 1 ? "pedido" : "pedidos"} •{" "}
                        <span className="text-white font-medium">{c.favoriteCategory}</span>
                      </span>
                      <span>
                        {c.daysSinceLastOrder === 0
                          ? "Hoje"
                          : c.daysSinceLastOrder === 1
                          ? "Ontem"
                          : `${c.daysSinceLastOrder}d atrás`}
                      </span>
                    </div>

                    {c.hasNotes && (
                      <div className="text-xxxs bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20 truncate">
                        📝 {c.notesPreview || "Perfil personalizado"}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xxs pt-2 border-t border-brand-mediumGray/30">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-brand-lightGray font-semibold"
              >
                ◀ Anterior
              </button>
              <span className="text-brand-lightGray font-mono">
                Pág {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-brand-lightGray font-semibold"
              >
                Próxima ▶
              </button>
            </div>
          )}
        </div>

        {/* Coluna Direita: Detail Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {loadingDetail && (
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-12 text-center text-xs text-brand-lightGray animate-pulse">
              Carregando ficha do cliente...
            </div>
          )}

          {!loadingDetail && !contactDetail && (
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-12 text-center text-xs text-brand-lightGray/50">
              Selecione um contato na coluna à esquerda para ver a ficha completa.
            </div>
          )}

          {!loadingDetail && contactDetail && (
            <>
              {/* Header do Cliente com KPIs Rápidos */}
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-brand-mediumGray/40 pb-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-brand-bg border border-brand-mediumGray flex items-center justify-center font-serif font-bold text-brand-red text-xl shadow-inner">
                      {contactDetail.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-serif text-lg font-bold text-white">
                        {contactDetail.displayName}
                      </h3>
                      <span className="text-xs font-mono text-brand-lightGray">
                        📞 {formatPhone(contactDetail.phoneKey)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xxs text-brand-lightGray block">Gasto Total Acumulado</span>
                    <span className="text-xl font-bold font-mono text-brand-red">
                      {formatCurrency(contactDetail.totalSpent)}
                    </span>
                  </div>
                </div>

                {/* Chips de KPIs do Cliente */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-mediumGray/40">
                    <span className="text-xxxs text-brand-lightGray uppercase font-semibold block">Pedidos Totais</span>
                    <span className="text-sm font-bold font-mono text-white mt-0.5 block">
                      {contactDetail.totalOrders}
                    </span>
                  </div>

                  <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-mediumGray/40">
                    <span className="text-xxxs text-brand-lightGray uppercase font-semibold block">Tempo Médio Entrega</span>
                    <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                      {contactDetail.averageDeliveryMinutes > 0 ? `${contactDetail.averageDeliveryMinutes} min` : "—"}
                    </span>
                  </div>

                  <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-mediumGray/40">
                    <span className="text-xxxs text-brand-lightGray uppercase font-semibold block">Cancelados</span>
                    <span className="text-sm font-bold font-mono text-red-400 mt-0.5 block">
                      {contactDetail.canceledOrders}
                    </span>
                  </div>

                  <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-mediumGray/40">
                    <span className="text-xxxs text-brand-lightGray uppercase font-semibold block">Categoria Favorita</span>
                    <span className="text-sm font-bold text-amber-400 mt-0.5 block truncate">
                      {contactDetail.favoriteCategory}
                    </span>
                  </div>
                </div>
              </div>

              {/* Anotações Internas e Nome Substituto */}
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-3">
                  <h4 className="font-serif text-sm font-bold text-white flex items-center gap-2">
                    <span>📝</span> Anotações de Atendimento & Apelido
                  </h4>
                  {saveSuccess && (
                    <span className="text-xxs text-emerald-400 font-semibold animate-fadeIn">
                      ✓ Salvo com sucesso!
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                      Nome Personalizado / Apelido (Substitui o nome do pedido)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Dr. Roberto / Vizinho da Loja"
                      value={displayNameOverride}
                      onChange={(e) => setDisplayNameOverride(e.target.value)}
                      className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-white focus:border-brand-red focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                      Notas Internas da Equipe (Ex: preferências, restrições, ponto de referência)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Não gosta de orégano, prefere massa bem assada, interfone quebrado."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-white focus:border-brand-red focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer disabled:opacity-50 text-xs"
                  >
                    {savingProfile ? "Salvando..." : "Salvar Anotações do Cliente"}
                  </button>
                </form>
              </div>

              {/* Endereços Conhecidos */}
              {contactDetail.addresses.length > 0 && (
                <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-3">
                  <h4 className="font-serif text-sm font-bold text-white flex items-center gap-2">
                    <span>📍</span> Endereços Utilizados ({contactDetail.addresses.length})
                  </h4>
                  <div className="space-y-2 text-xs">
                    {contactDetail.addresses.map((addr, idx) => (
                      <div
                        key={idx}
                        className="bg-brand-bg p-3 rounded-xl border border-brand-mediumGray/40 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-semibold text-white block">
                            {addr.address}, {addr.number}
                          </span>
                          {addr.reference && (
                            <span className="text-xxxs text-brand-lightGray block">
                              Ref: {addr.reference}
                            </span>
                          )}
                        </div>
                        <span className="text-xxxs text-brand-lightGray font-mono">
                          Último uso: {new Date(addr.lastUsedAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico Completo de Pedidos */}
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4">
                <h4 className="font-serif text-sm font-bold text-white flex items-center gap-2">
                  <span>📜</span> Histórico de Pedidos ({contactDetail.orders.length})
                </h4>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {contactDetail.orders.map((ord) => {
                    const isExpanded = expandedOrderId === ord.id;
                    const statusBadge = statusColors[ord.status] || "bg-gray-500/10 text-gray-400";

                    return (
                      <div
                        key={ord.id}
                        className="rounded-xl border border-brand-mediumGray/60 bg-brand-bg overflow-hidden text-xs transition-all"
                      >
                        {/* Header do Card de Pedido */}
                        <div
                          onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                          className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-brand-darkGray/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-brand-red text-sm">
                              #{ord.orderNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xxxs font-bold border ${statusBadge}`}
                            >
                              {ord.status}
                            </span>
                            <span className="text-xxxs text-brand-lightGray font-mono">
                              {new Date(ord.createdAt).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-white">
                              {formatCurrency(ord.total)}
                            </span>
                            <span className="text-brand-lightGray text-xs">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>

                        {/* Detalhe Expandido do Pedido */}
                        {isExpanded && (
                          <div className="p-3.5 border-t border-brand-mediumGray/40 bg-brand-darkGray/30 space-y-3 text-xs">
                            {/* Itens */}
                            <div className="space-y-1.5">
                              <span className="text-xxxs font-semibold uppercase text-brand-lightGray block">
                                Itens do Pedido:
                              </span>
                              {ord.items.map((item: any) => (
                                <div
                                  key={item.id}
                                  className="bg-brand-bg p-2 rounded-lg border border-brand-mediumGray/30 text-xxs space-y-1"
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
                                      Sabores: {item.flavors.map((f: any) => f.flavorName).join(" / ")}
                                    </div>
                                  )}

                                  {item.crustType && (
                                    <div className="text-xxxs text-brand-lightGray">
                                      Borda: {item.crustType} (+{formatCurrency(item.crustPrice)})
                                    </div>
                                  )}

                                  {item.toppings?.length > 0 && (
                                    <div className="text-xxxs text-brand-lightGray">
                                      Adicionais: {item.toppings.map((t: any) => t.toppingName).join(", ")}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Informações de Entrega / Notas */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xxs text-brand-lightGray pt-2 border-t border-brand-mediumGray/30">
                              <div>
                                <span className="text-white font-semibold">Tipo:</span> {ord.type}
                                {ord.customerAddress && (
                                  <div className="mt-0.5">
                                    📍 {ord.customerAddress}, {ord.addressNumber}
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="text-white font-semibold">Pagamento:</span> {ord.paymentMethod}
                                {ord.changeFor && (
                                  <span className="block font-mono">Troco para: {formatCurrency(ord.changeFor)}</span>
                                )}
                                {ord.driver && (
                                  <span className="block text-purple-400 mt-0.5">
                                    Entregador: {ord.driver.name}
                                  </span>
                                )}
                              </div>
                            </div>

                            {ord.notes && (
                              <div className="p-2 rounded bg-brand-red/5 border border-brand-red/10 text-xxs italic text-brand-red">
                                Obs: &quot;{ord.notes}&quot;
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
