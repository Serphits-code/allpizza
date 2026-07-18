"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (res?.error) {
        setError(res.error || "Usuário ou senha incorretos.");
      } else {
        router.push("/admin/pedidos");
        router.refresh();
      }
    } catch (err) {
      setError("Ocorreu um erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-brand-red">
            AllDelivery Admin
          </h1>
          <p className="mt-2 text-sm text-brand-lightGray">
            AllDelivery — Portal de Controle
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg bg-brand-red/10 border border-brand-red/20 p-3 text-sm text-brand-red text-center">
              {error}
            </div>
          )}

          <div className="space-y-4 rounded-md">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none transition-colors"
                placeholder="nome@pizzaria.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-white placeholder-brand-lightGray/50 focus:border-brand-red focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg bg-brand-red px-4 py-3 text-sm font-semibold text-white hover:bg-brand-redHover focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? "Entrando..." : "Entrar no Sistema"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
