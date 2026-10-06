"use client";

import React, { useState, useEffect } from "react";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Limpa parâmetros sensíveis da URL caso tenham sido enviados anteriormente
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const urlEmail = params.get("email");
      const urlPass = params.get("password");
      if (urlEmail) setEmail(urlEmail);
      if (urlPass) setPassword(urlPass);

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!email.trim() || !password) {
      setError("Por favor, preencha o e-mail e a senha.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1. Valida credenciais e obtém o papel do usuário diretamente
      const checkRes = await fetch("/api/admin/auth/login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const checkData = await checkRes.json().catch(() => ({}));

      if (!checkRes.ok || checkData.error) {
        setError(checkData.error || "E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      // 2. Estabelece a sessão oficial do NextAuth
      const authRes = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
      });

      if (!authRes || authRes.error) {
        setError(authRes?.error || "Falha ao iniciar sessão de autenticação. Tente novamente.");
        setLoading(false);
        return;
      }

      // 3. Redireciona imediatamente para a rota correspondente ao papel
      const role = checkData.user?.role;

      if (role === "DRIVER") {
        window.location.href = "/entregador";
      } else if (role === "GARCOM") {
        window.location.href = "/garcom";
      } else if (role === "ADMIN" || role === "MANAGER") {
        window.location.href = "/admin";
      } else {
        window.location.href = "/admin/pedidos";
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "Ocorreu um erro de conexão ao fazer login. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-12 selection:bg-brand-red selection:text-white">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-brand-red">
            AllDelivery Admin
          </h1>
          <p className="mt-2 text-sm text-brand-lightGray">
            AllDelivery — Portal de Controle
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6"
          noValidate
        >
          {error && (
            <div className="rounded-xl bg-red-950/60 border border-red-800/80 p-3.5 text-xs font-semibold text-red-300 text-center flex items-center justify-center gap-2 shadow-lg animate-fadeIn">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4 rounded-md">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray mb-1"
              >
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none transition-colors"
                placeholder="nome@pizzaria.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-brand-lightGray"
                >
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xxs text-brand-lightGray hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg bg-brand-red px-4 py-3.5 text-xs font-bold text-white hover:bg-brand-redHover focus:outline-none disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-brand-red/20"
            >
              {loading ? "Autenticando..." : "Entrar no Sistema"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
