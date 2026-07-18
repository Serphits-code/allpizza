"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Se for a página de login, não exibe o shell com menu lateral
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const navItems = [
    { name: "Painel de Pedidos (Kanban)", href: "/admin/pedidos", roles: ["ADMIN", "MANAGER", "KITCHEN"] },
    { name: "Cadastro de Cardápio", href: "/admin/cardapio", roles: ["ADMIN", "MANAGER"] },
    { name: "Zonas de Entrega", href: "/admin/zonas", roles: ["ADMIN", "MANAGER"] },
    { name: "Histórico de Clientes", href: "/admin/clientes", roles: ["ADMIN", "MANAGER"] },
    { name: "Configurações", href: "/admin/configuracoes", roles: ["ADMIN", "MANAGER"] },
  ];

  const userRole = session?.user?.role || "KITCHEN";

  const handleLogout = async () => {
    try {
      await signOut({ callbackUrl: "/admin/login", redirect: true });
    } catch (err) {
      window.location.href = "/admin/login";
    }
  };

  return (
    <div className="flex min-h-screen bg-brand-bg text-white">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-brand-mediumGray bg-brand-darkGray">
        <div className="flex h-20 items-center px-6 border-b border-brand-mediumGray">
          <span className="font-serif text-xl font-bold tracking-wide text-brand-red">
            AllDelivery Control
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navItems
            .filter((item) => item.roles.includes(userRole))
            .map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-colors ${
                    active
                      ? "bg-brand-red text-white"
                      : "text-brand-lightGray hover:bg-brand-bg hover:text-white"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
        </nav>
        <div className="p-4 border-t border-brand-mediumGray space-y-3">
          <div className="text-xs px-2 text-brand-lightGray">
            Conectado como:
            <span className="block font-bold text-white mt-0.5 truncate">{session?.user?.name || "Funcionário"}</span>
            <span className="block text-xxs opacity-70 mt-0.5 uppercase tracking-wider">{userRole}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg bg-brand-bg border border-brand-mediumGray hover:bg-brand-red hover:border-brand-red py-2.5 text-xs font-bold text-white transition-all cursor-pointer text-center"
          >
            Sair do Painel
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header - Mobile nav toggle + title */}
        <header className="flex h-16 items-center justify-between px-6 border-b border-brand-mediumGray bg-brand-darkGray md:bg-brand-bg">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-brand-mediumGray text-brand-lightGray hover:text-white"
              aria-label="Abrir Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm md:text-base font-serif font-bold text-white tracking-wide uppercase">
              {navItems.find((i) => i.href === pathname)?.name || "Administração"}
            </h1>
          </div>
          <div className="hidden md:block text-xxs font-mono bg-brand-darkGray px-3 py-1 rounded border border-brand-mediumGray text-brand-lightGray">
            AllDelivery v1.0.0 (Localhost)
          </div>
        </header>

        {/* Mobile Sidebar overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
            <div className="w-64 bg-brand-darkGray flex flex-col h-full border-r border-brand-mediumGray" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-16 items-center justify-between px-6 border-b border-brand-mediumGray">
                <span className="font-serif text-lg font-bold text-brand-red">AllDelivery Control</span>
                <button onClick={() => setMobileOpen(false)} className="text-brand-lightGray hover:text-white">✕</button>
              </div>
              <nav className="flex-1 space-y-1 px-4 py-6">
                {navItems
                  .filter((item) => item.roles.includes(userRole))
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-colors ${
                        pathname === item.href
                          ? "bg-brand-red text-white"
                          : "text-brand-lightGray hover:bg-brand-bg hover:text-white"
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
              </nav>
              <div className="p-4 border-t border-brand-mediumGray space-y-3">
                <div className="text-xs px-2 text-brand-lightGray">
                  Conectado: <span className="font-bold text-white block">{session?.user?.name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full rounded-lg bg-brand-bg border border-brand-mediumGray py-2 text-xs font-bold text-white transition-all cursor-pointer"
                >
                  Sair do Painel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Wrapper */}
        <div className="flex-1 overflow-y-auto p-6 bg-brand-bg">
          {children}
        </div>
      </div>
    </div>
  );
}
