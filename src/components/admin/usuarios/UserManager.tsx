"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "KITCHEN" | "DRIVER" | "GARCOM";
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function UserManager() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "KITCHEN" as AdminUser["role"],
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Carrega Usuários
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        throw new Error("Falha ao carregar lista de usuários");
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de conexão ao buscar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "KITCHEN",
      active: true,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "", // Vazia = mantém a senha atual
      role: user.role,
      active: user.active !== false,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);
    setSuccessMessage(null);

    try {
      const isEditing = !!editingUser;
      const url = isEditing ? `/api/admin/users/${editingUser.id}` : "/api/admin/users";
      const method = isEditing ? "PATCH" : "POST";

      const payload: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        active: formData.active,
      };

      if (!isEditing || (formData.password && formData.password.trim() !== "")) {
        payload.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || "Erro ao salvar usuário");
      }

      setIsModalOpen(false);
      setSuccessMessage(
        isEditing ? "Usuário atualizado com sucesso!" : "Novo usuário cadastrado com sucesso!"
      );
      loadUsers();

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || "Erro ao processar solicitação");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (session?.user?.id === user.id) {
      alert("Você não pode excluir sua própria conta de administrador!");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o usuário "${user.name}" (${user.email})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        alert(json.error || "Erro ao excluir usuário");
        return;
      }

      setSuccessMessage("Usuário removido com sucesso!");
      loadUsers();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir usuário.");
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    if (session?.user?.id === user.id && user.active) {
      alert("Você não pode desativar sua própria conta!");
      return;
    }

    const nextState = !user.active;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextState }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        alert(json.error || "Erro ao atualizar status");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, active: nextState } : u))
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao alterar status do usuário.");
    }
  };

  // Filtragem de Usuários
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const roleBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
    ADMIN: { label: "Admin Geral", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
    MANAGER: { label: "Gerente", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
    KITCHEN: { label: "Cozinha", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
    DRIVER: { label: "Entregador", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
    GARCOM: { label: "Garçom / Salão", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-red">👤</span> Gestão de Usuários & Equipe
          </h2>
          <p className="text-xs text-brand-lightGray mt-1">
            Cadastre funcionários, defina papéis operacionais e gerencie permissões de acesso.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-red/20 transition-all"
        >
          <span>＋</span> Novo Usuário
        </button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <span>✓</span> {successMessage}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-brand-red/10 border border-brand-red/20 text-brand-red text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-4 rounded-xl">
        {/* Busca */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
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

        {/* Abas por Papel */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { key: "ALL", label: "Todos" },
            { key: "ADMIN", label: "Admin" },
            { key: "MANAGER", label: "Gerentes" },
            { key: "KITCHEN", label: "Cozinha" },
            { key: "DRIVER", label: "Entregadores" },
            { key: "GARCOM", label: "Garçons" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRoleFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                roleFilter === tab.key
                  ? "bg-brand-red text-white"
                  : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray hover:border-brand-lightGray/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela / Lista de Usuários */}
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-white">
            <thead className="bg-brand-bg/80 text-xxs font-semibold uppercase tracking-wider text-brand-lightGray border-b border-brand-mediumGray">
              <tr>
                <th className="px-6 py-3.5">Nome & E-mail</th>
                <th className="px-6 py-3.5">Papel / Função</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Cadastrado em</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-mediumGray/30">
              {filteredUsers.map((user) => {
                const badge = roleBadges[user.role] || roleBadges.KITCHEN;
                const isCurrentUser = session?.user?.id === user.id;

                return (
                  <tr key={user.id} className="hover:bg-brand-bg/40 transition-colors">
                    {/* Nome & Email */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-bg border border-brand-mediumGray flex items-center justify-center font-mono font-bold text-brand-red text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white block">
                            {user.name}{" "}
                            {isCurrentUser && (
                              <span className="text-xxs font-normal text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 ml-1">
                                (Você)
                              </span>
                            )}
                          </span>
                          <span className="text-xxs text-brand-lightGray font-mono">{user.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Papel */}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xxs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Status Ativo / Inativo */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={isCurrentUser}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xxs font-bold border transition-colors ${
                          user.active
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                        } ${isCurrentUser ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
                        title={isCurrentUser ? "Você não pode desativar sua própria conta" : "Clique para alternar status"}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.active ? "bg-emerald-400" : "bg-red-400"}`} />
                        {user.active ? "Ativo" : "Inativo"}
                      </button>
                    </td>

                    {/* Data */}
                    <td className="px-6 py-4 text-xxs text-brand-lightGray font-mono">
                      {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="px-3 py-1 rounded-lg bg-brand-bg border border-brand-mediumGray hover:border-brand-lightGray hover:text-white text-brand-lightGray text-xxs font-bold transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={isCurrentUser}
                        className={`px-3 py-1 rounded-lg border text-xxs font-bold transition-colors ${
                          isCurrentUser
                            ? "bg-brand-bg/50 border-brand-mediumGray/30 text-brand-lightGray/40 cursor-not-allowed"
                            : "bg-brand-bg border-brand-red/50 hover:bg-brand-red hover:text-white text-brand-red cursor-pointer"
                        }`}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-xs text-brand-lightGray/50">
                    Nenhum usuário encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-3">
              <h3 className="font-serif text-lg font-bold text-white">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-brand-lightGray hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-brand-red/10 border border-brand-red/20 text-brand-red text-xs font-semibold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  E-mail de Acesso
                </label>
                <input
                  type="email"
                  required
                  placeholder="Ex: carlos@alldelivery.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Senha {editingUser && <span className="normal-case opacity-60">(deixe em branco para manter)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? "••••••••" : "Mínimo 6 caracteres"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                    Papel / Função
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as AdminUser["role"] })}
                    className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none cursor-pointer"
                  >
                    <option value="ADMIN">Admin Geral</option>
                    <option value="MANAGER">Gerente</option>
                    <option value="KITCHEN">Cozinha / Kanban</option>
                    <option value="DRIVER">Entregador</option>
                    <option value="GARCOM">Garçom / Mesas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                    Status da Conta
                  </label>
                  <select
                    value={formData.active ? "true" : "false"}
                    onChange={(e) => setFormData({ ...formData, active: e.target.value === "true" })}
                    className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none cursor-pointer"
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo (Bloqueado)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-brand-mediumGray/40">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-brand-bg border border-brand-mediumGray hover:text-white font-bold transition-colors cursor-pointer text-brand-lightGray"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Salvando..." : editingUser ? "Salvar Alterações" : "Criar Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
