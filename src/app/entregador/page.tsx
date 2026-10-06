"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DeliveryMap from "@/components/entregador/DeliveryMap";
import { calculateHaversineDistance } from "@/lib/geo";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  flavors?: { flavorName: string }[];
  toppings?: { toppingName: string }[];
}

interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  addressNumber: string | null;
  reference: string | null;
  customerLat: number | null;
  customerLng: number | null;
  paymentMethod: string;
  changeFor: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes: string | null;
  createdAt: string;
  items?: OrderItem[];
}

export default function DriverDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // Coordenadas e velocidade do piloto
  const [driverLat, setDriverLat] = useState<number>(-8.05);
  const [driverLng, setDriverLng] = useState<number>(-34.90);
  const [driverSpeed, setDriverSpeed] = useState<number | null>(null);

  // Identidade da Empresa / Loja
  const [companyName, setCompanyName] = useState("AllDelivery");
  const [companyLogo, setCompanyLogo] = useState("");

  // Filas de Pedidos
  const [publicOrders, setPublicOrders] = useState<Order[]>([]);
  const [bagOrders, setBagOrders] = useState<Order[]>([]);

  // Rota Ativa
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeSummary, setRouteSummary] = useState<{ distance: number; duration: number } | null>(null);

  // Estado da Interface
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Modo Rota / Navegação em Tela Cheia
  const [isRouteMode, setIsRouteMode] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const wakeLockRef = useRef<any>(null);

  // Sede / Depot
  const [depotLat, setDepotLat] = useState(-8.05);
  const [depotLng, setDepotLng] = useState(-34.90);

  // Refs de controle de GPS
  const lastPostPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastPostTime = useRef<number>(0);

  // Redirecionamento se não autenticado
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/admin/login");
    } else if (sessionStatus === "authenticated") {
      const role = session?.user?.role;
      if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
        router.push("/admin/login");
      }
    }
  }, [sessionStatus, session, router]);

  // Carrega configurações da loja (nome, logo, cores, depot)
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const res = await fetch("/api/admin/system-config");
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.companyName) setCompanyName(cfg.companyName);
          if (cfg.companyLogo) setCompanyLogo(cfg.companyLogo);
          if (cfg.depotLat) setDepotLat(parseFloat(cfg.depotLat));
          if (cfg.depotLng) setDepotLng(parseFloat(cfg.depotLng));
        }
      } catch (err) {
        console.error("Error loading store config:", err);
      }
    };
    fetchConfigs();
  }, []);

  // Carrega listagem de pedidos
  const loadOrders = async () => {
    try {
      const res = await fetch("/api/entregador/orders");
      if (!res.ok) throw new Error("Erro ao consultar pedidos do entregador");
      const data = await res.json();

      setBagOrders(data.bag || []);
      setPublicOrders(data.available || []);
      if (data.routeGeometry) setRouteGeometry(data.routeGeometry);
      if (data.summary) setRouteSummary(data.summary);
    } catch (err) {
      console.error("Error loading driver orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      loadOrders();
      const timer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        loadOrders();
      }, 7000);

      const onFocus = () => {
        loadOrders();
      };
      window.addEventListener("focus", onFocus);

      return () => {
        clearInterval(timer);
        window.removeEventListener("focus", onFocus);
      };
    }
  }, [sessionStatus]);

  // --- GPS Geolocation watchPosition + Heartbeat ---
  useEffect(() => {
    if (!navigator.geolocation || sessionStatus !== "authenticated") return;

    const transmitLocation = async (lat: number, lng: number) => {
      const now = Date.now();
      let shouldPost = false;

      if (!lastPostPos.current) {
        shouldPost = true;
      } else {
        const distanceMoved =
          calculateHaversineDistance(
            lastPostPos.current.lat,
            lastPostPos.current.lng,
            lat,
            lng
          ) * 1000;
        const timeElapsed = (now - lastPostTime.current) / 1000;

        if (distanceMoved >= 4 || timeElapsed >= 30) {
          shouldPost = true;
        }
      }

      if (shouldPost) {
        try {
          await fetch("/api/entregador/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          });
          lastPostPos.current = { lat, lng };
          lastPostTime.current = now;
        } catch (err) {
          console.error("Failed to transmit driver location:", err);
        }
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed;

        setDriverLat(lat);
        setDriverLng(lng);
        setDriverSpeed(speed);

        transmitLocation(lat, lng);
      },
      (err) => {
        console.warn("Geolocation watch error:", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [sessionStatus]);

  // --- Otimizar Rota ---
  const handleOptimizeRoute = async () => {
    if (bagOrders.length === 0) {
      alert("Adicione ao menos um pedido à bag para otimizar a rota.");
      return;
    }
    setOptimizing(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/entregador/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverLat,
          driverLng,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.routeGeometry) setRouteGeometry(data.routeGeometry);
        if (data.summary) setRouteSummary(data.summary);
        await loadOrders();
      } else {
        setErrorMsg(data.error || "Erro ao otimizar rota");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexão ao otimizar rota.");
    } finally {
      setOptimizing(false);
    }
  };

  // --- Ações de Pedido (Claim, Release, Deliver) ---
  const handleOrderAction = async (orderId: string, action: "claim" | "release" | "deliver") => {
    setActionLoading(orderId);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/entregador/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Erro ao atualizar pedido");
      } else {
        await loadOrders();
        if (action === "deliver" && bagOrders.length <= 1) {
          setIsRouteMode(false);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro ao processar ação do pedido.");
    } finally {
      setActionLoading(null);
    }
  };

  // --- Wake Lock (Tela Ativa no Modo Rota) ---
  const activateWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
    } catch (err) {
      console.warn("WakeLock error:", err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleRouteMode = () => {
    if (!isRouteMode) {
      if (bagOrders.length === 0) {
        alert("Sua bag está vazia. Adicione pedidos para iniciar o modo rota.");
        return;
      }
      setIsRouteMode(true);
      setCurrentStopIndex(0);
      activateWakeLock();
    } else {
      setIsRouteMode(false);
      releaseWakeLock();
    }
  };

  // Próxima Parada Ativa no Modo Rota
  const activeStopOrder = useMemo(() => {
    if (bagOrders.length === 0) return null;
    return bagOrders[Math.min(currentStopIndex, bagOrders.length - 1)];
  }, [bagOrders, currentStopIndex]);

  // Distância até a próxima parada em metros
  const distanceToNextStop = useMemo(() => {
    if (!activeStopOrder || !activeStopOrder.customerLat || !activeStopOrder.customerLng) {
      return null;
    }
    const km = calculateHaversineDistance(
      driverLat,
      driverLng,
      activeStopOrder.customerLat,
      activeStopOrder.customerLng
    );
    return Math.round(km * 1000);
  }, [activeStopOrder, driverLat, driverLng]);

  // Abre navegação no Google Maps
  const openExternalNavigation = (lat: number | null, lng: number | null, address: string | null) => {
    if (lat && lng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      window.open(url, "_blank");
    } else if (address) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
      window.open(url, "_blank");
    }
  };

  // Abre WhatsApp com mensagem pré-preenchida
  const openWhatsApp = (phone: string, customerName: string, orderNumber: number) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    const text = encodeURIComponent(
      `Olá ${customerName}! Aqui é o entregador da ${companyName}. Estou a caminho com o seu pedido #${orderNumber}.`
    );
    window.open(`https://wa.me/${formattedPhone}?text=${text}`, "_blank");
  };

  const formatCurrency = (val: number) =>
    `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col min-h-screen p-4 sm:p-5 space-y-5 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* HEADER SUPERIOR: Logo, Nome da Empresa & Botão de Saída       */}
      {/* ------------------------------------------------------------- */}
      <header className="flex items-center justify-between border-b border-brand-mediumGray pb-3">
        <div className="flex items-center gap-3">
          {companyLogo ? (
            <div className="w-10 h-10 rounded-xl bg-brand-darkGray border border-brand-mediumGray flex items-center justify-center overflow-hidden p-1 shadow-md">
              <img src={companyLogo} alt={companyName} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-brand-red flex items-center justify-center text-white text-lg shadow-md shadow-brand-red/30">
              🚚
            </div>
          )}
          <div>
            <h1 className="font-bold text-white text-sm tracking-wide leading-tight">
              {companyName}
            </h1>
            <span className="text-xxs text-brand-lightGray block">Painel do Entregador</span>
          </div>
        </div>

        <button
          onClick={async () => {
            await signOut({ redirect: false });
            window.location.href = "/admin/login";
          }}
          className="p-2 rounded-xl bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white hover:bg-brand-bg transition-colors cursor-pointer"
          title="Sair da Conta"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </header>

      {/* Mensagem de Erro */}
      {errorMsg && (
        <div className="p-3.5 bg-brand-red/10 border border-brand-red/20 rounded-xl text-xs text-brand-red text-center font-medium">
          {errorMsg}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TÍTULO DA SEÇÃO & BOTÕES DE AÇÃO                              */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base text-brand-red">📦</span>
            <h2 className="font-bold text-base md:text-lg text-white tracking-tight">
              Bag do Entregador
            </h2>
          </div>
          <span className="text-xs text-brand-lightGray block mt-0.5">
            {bagOrders.length} na bag · {publicOrders.length} disponíveis em rota
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Modo Rota */}
          <button
            onClick={toggleRouteMode}
            disabled={bagOrders.length === 0}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 ${
              isRouteMode
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-brand-darkGray border-brand-mediumGray text-brand-lightGray hover:text-white hover:bg-brand-bg"
            }`}
          >
            <span>☡</span> Modo rota
          </button>

          {/* Botão Otimizar Rota */}
          <button
            onClick={handleOptimizeRoute}
            disabled={optimizing || bagOrders.length === 0}
            className="px-3.5 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-brand-red/20 disabled:opacity-40 flex items-center gap-1.5"
          >
            <span>✈</span> {optimizing ? "Otimizando..." : "Otimizar Rota"}
          </button>

          {/* Botão Atualizar */}
          <button
            onClick={loadOrders}
            className="p-2 rounded-xl bg-brand-darkGray border border-brand-mediumGray text-brand-lightGray hover:text-white hover:bg-brand-bg transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MAPA INTERATIVO SATÉLITE HÍBRIDO                              */}
      {/* ------------------------------------------------------------- */}
      <DeliveryMap
        driverLat={driverLat}
        driverLng={driverLng}
        driverSpeed={driverSpeed}
        routeGeometry={routeGeometry}
        orders={bagOrders}
        depotLat={depotLat}
        depotLng={depotLng}
        activeStopIndex={currentStopIndex}
        isNavigationMode={isRouteMode}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODO ROTA ATIVO: OVERLAY DE NAVEGAÇÃO EM TELA CHEIA            */}
      {/* ------------------------------------------------------------- */}
      {isRouteMode && activeStopOrder && (
        <div className="bg-brand-darkGray border border-brand-red/50 rounded-2xl p-4 shadow-2xl space-y-4 animate-fadeIn">
          {/* Header da Parada */}
          <div className="flex justify-between items-start border-b border-brand-mediumGray pb-3">
            <div>
              <span className="text-xxs font-mono uppercase font-bold text-brand-red block">
                Próxima Parada ({currentStopIndex + 1}/{bagOrders.length})
              </span>
              <h3 className="font-bold text-white text-sm mt-0.5">
                Pedido #{activeStopOrder.orderNumber} — {activeStopOrder.customerName}
              </h3>
              <p className="text-xs text-brand-lightGray mt-1">
                📍 {activeStopOrder.customerAddress}, {activeStopOrder.addressNumber}
              </p>
              {activeStopOrder.reference && (
                <p className="text-xxs text-brand-lightGray/70">Ref: {activeStopOrder.reference}</p>
              )}
            </div>

            {distanceToNextStop !== null && (
              <div className="text-right">
                <span className="text-xxs text-brand-lightGray block">Distância</span>
                <span className="font-mono font-bold text-sm text-emerald-400">
                  {distanceToNextStop > 1000
                    ? `${(distanceToNextStop / 1000).toFixed(1)} km`
                    : `${distanceToNextStop} m`}
                </span>
              </div>
            )}
          </div>

          {/* Botões de Ação do Modo Rota */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() =>
                openExternalNavigation(
                  activeStopOrder.customerLat,
                  activeStopOrder.customerLng,
                  activeStopOrder.customerAddress
                )
              }
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              <span>🧭</span> Abrir no Google Maps
            </button>

            <button
              onClick={() =>
                openWhatsApp(
                  activeStopOrder.customerPhone,
                  activeStopOrder.customerName,
                  activeStopOrder.orderNumber
                )
              }
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <span>💬</span> WhatsApp
            </button>
          </div>

          {/* Botão de Conclusão */}
          <button
            disabled={actionLoading === activeStopOrder.id}
            onClick={() => handleOrderAction(activeStopOrder.id, "deliver")}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all cursor-pointer shadow-lg shadow-emerald-600/30 disabled:opacity-50"
          >
            {actionLoading === activeStopOrder.id
              ? "Confirmando Entrega..."
              : "✓ Concluir e Ir para Próxima Entrega"}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* LISTAGEM DE PEDIDOS (Minha Bag + Disponíveis)                  */}
      {/* ------------------------------------------------------------- */}
      {bagOrders.length === 0 && publicOrders.length === 0 ? (
        /* Estado Vazio */
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-darkGray border border-brand-mediumGray flex items-center justify-center text-3xl opacity-50">
            📦
          </div>
          <p className="text-xs text-brand-lightGray font-medium">
            Nenhuma entrega em rota no momento
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 1. SEÇÃO: MINHA BAG */}
          {bagOrders.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-brand-red flex items-center gap-1.5">
                  <span>💼</span> Minha Bag ({bagOrders.length})
                </h3>
                {routeSummary && (
                  <span className="text-xxs font-mono text-brand-lightGray">
                    Total: {(routeSummary.distance / 1000).toFixed(1)} km
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {bagOrders.map((ord, idx) => {
                  const isExpanded = expandedOrderId === ord.id;

                  return (
                    <div
                      key={ord.id}
                      className="rounded-2xl border border-brand-red/40 bg-brand-darkGray overflow-hidden shadow-lg transition-all"
                    >
                      {/* Header do Card */}
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-brand-red text-white font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <span className="font-mono font-bold text-brand-red text-xs block">
                                #{ord.orderNumber}
                              </span>
                              <span className="font-bold text-white text-xs block">
                                {ord.customerName}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-mono font-bold text-white text-xs block">
                              {formatCurrency(ord.total)}
                            </span>
                            <span className="text-xxxs text-brand-lightGray uppercase font-mono">
                              {ord.paymentMethod}
                            </span>
                          </div>
                        </div>

                        {/* Endereço */}
                        <div className="text-xs text-brand-lightGray leading-snug">
                          📍 {ord.customerAddress}, {ord.addressNumber}
                          {ord.reference && (
                            <span className="block text-xxs text-brand-lightGray/70">Ref: {ord.reference}</span>
                          )}
                        </div>

                        {ord.notes && (
                          <div className="p-2 rounded-lg bg-brand-red/10 border border-brand-red/20 text-xxs italic text-brand-red">
                            Obs: &quot;{ord.notes}&quot;
                          </div>
                        )}

                        {/* Botões Rápidos */}
                        <div className="flex items-center gap-2 pt-2 border-t border-brand-mediumGray/60">
                          <button
                            onClick={() =>
                              openWhatsApp(ord.customerPhone, ord.customerName, ord.orderNumber)
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-800/40 text-emerald-400 hover:bg-emerald-900 text-xxs font-bold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>💬</span> WhatsApp
                          </button>

                          <button
                            onClick={() =>
                              openExternalNavigation(
                                ord.customerLat,
                                ord.customerLng,
                                ord.customerAddress
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-blue-950/70 border border-blue-800/40 text-blue-400 hover:bg-blue-900 text-xxs font-bold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>🧭</span> Rota
                          </button>

                          <button
                            onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                            className="text-xxs text-brand-lightGray hover:text-white ml-auto cursor-pointer"
                          >
                            {isExpanded ? "Ocultar detalhes ▲" : "Ver detalhes ▼"}
                          </button>
                        </div>

                        {/* Ações de Devolução e Entrega */}
                        <div className="flex gap-2 pt-1">
                          <button
                            disabled={actionLoading !== null}
                            onClick={() => handleOrderAction(ord.id, "release")}
                            className="flex-1 py-2 bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray rounded-xl text-xxs font-bold text-brand-lightGray hover:text-white transition-colors cursor-pointer"
                          >
                            Devolver
                          </button>
                          <button
                            disabled={actionLoading !== null}
                            onClick={() => handleOrderAction(ord.id, "deliver")}
                            className="flex-1 py-2 bg-brand-red hover:bg-brand-redHover rounded-xl text-xxs font-bold text-white transition-colors cursor-pointer shadow-md shadow-brand-red/20"
                          >
                            {actionLoading === ord.id ? "Entregando..." : "Confirmar Entrega ➔"}
                          </button>
                        </div>
                      </div>

                      {/* Detalhe Expandido de Itens */}
                      {isExpanded && ord.items && (
                        <div className="p-4 bg-brand-bg/60 border-t border-brand-mediumGray space-y-2 text-xs">
                          <span className="text-xxs font-semibold uppercase text-brand-lightGray block">
                            Itens do Pedido:
                          </span>
                          {ord.items.map((it) => (
                            <div
                              key={it.id}
                              className="flex justify-between items-center text-brand-lightGray text-xxs"
                            >
                              <span>
                                {it.quantity}x {it.name}
                              </span>
                              <span className="font-mono text-white">{formatCurrency(it.totalPrice)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. SEÇÃO: PEDIDOS DISPONÍVEIS NA ROTA */}
          {publicOrders.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-brand-lightGray flex items-center gap-1.5">
                <span>📦</span> Disponíveis em Rota ({publicOrders.length})
              </h3>

              <div className="space-y-3">
                {publicOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 space-y-3 shadow-md"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold text-brand-lightGray text-xs block">
                          #{ord.orderNumber}
                        </span>
                        <span className="font-bold text-white text-xs block">
                          {ord.customerName}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-white text-xs">
                        {formatCurrency(ord.total)}
                      </span>
                    </div>

                    <div className="text-xs text-brand-lightGray">
                      📍 {ord.customerAddress}, {ord.addressNumber}
                    </div>

                    <button
                      disabled={actionLoading !== null}
                      onClick={() => handleOrderAction(ord.id, "claim")}
                      className="w-full py-2.5 bg-brand-red hover:bg-brand-redHover rounded-xl text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-brand-red/20"
                    >
                      <span>＋</span> {actionLoading === ord.id ? "Coletando..." : "Colocar na bag"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* RODAPÉ INSTITUCIONAL                                          */}
      {/* ------------------------------------------------------------- */}
      <footer className="pt-8 pb-4 text-center">
        <span className="text-xxxs text-brand-lightGray/60 tracking-wider">
          Desenvolvido pela Almeida Estúdios
        </span>
      </footer>
    </div>
  );
}
