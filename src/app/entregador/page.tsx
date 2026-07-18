"use client";

import React, { useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DeliveryMap from "@/components/entregador/DeliveryMap";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { calculateHaversineDistance } from "@/lib/geo";

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
  paymentMethod: PaymentMethod;
  total: number;
  notes: string | null;
  createdAt: string;
}

export default function DriverDashboard() {
  const sessionResult = useSession();
  const session = sessionResult?.data;
  const sessionStatus = sessionResult?.status || "loading";
  const router = useRouter();

  // Coordenadas e velocidade do motoboy
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [driverSpeed, setDriverSpeed] = useState<number | null>(null);

  // Filas de Pedidos
  const [publicOrders, setPublicOrders] = useState<Order[]>([]);
  const [bagOrders, setBagOrders] = useState<Order[]>([]);

  // Dados da Rota Ativa
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeSummary, setRouteSummary] = useState<{ distance: number; duration: number } | null>(null);

  // Estado geral
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Depot da loja (sede)
  const [depotLat, setDepotLat] = useState(-8.05);
  const [depotLng, setDepotLng] = useState(-34.90);

  // Refs de controle de tráfego de GPS
  const lastPostPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastPostTime = useRef<number>(0);

  // Redirecionamento se não autenticado ou papel incorreto
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/admin/login");
    } else if (sessionStatus === "authenticated") {
      const role = session?.user?.role;
      if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
        alert("Acesso restrito a entregadores e administradores.");
        signOut({ callbackUrl: "/admin/login" });
      }
    }
  }, [sessionStatus, session, router]);

  // Carrega listagem de pedidos e depot inicial
  const loadOrders = async () => {
    try {
      // 1. Busca status e depot da loja
      const storeRes = await fetch("/api/public/store-status");
      const storeData = await storeRes.json();
      // O depotLat/lng vêm junto com o store-status no nosso endpoint customizado!
      if (storeData.deliveryCities) {
        // busca depot nas configs
        const configsRes = await fetch("/api/admin/system-config");
        const configsData = await configsRes.json();
        // tenta ler do banco ou default para Cachoeirinha
        const baseLat = parseFloat(configsData.depotLat) || -8.0142;
        const baseLng = parseFloat(configsData.depotLng) || -34.95;
        setDepotLat(baseLat);
        setDepotLng(baseLng);
      }

      // 2. Busca lista geral de pedidos do motorista
      // Vamos buscar todos os pedidos ativos "EM_ROTA"
      const res = await fetch("/api/public/orders"); // ou criamos um endpoint próprio, mas o list de ordens públicas ativas serve perfeitamente
      const data = await res.json();
      
      if (Array.isArray(data)) {
        const activeDeliveryOrders = data.filter(
          (o: any) => o.status === OrderStatus.EM_ROTA && o.type === "DELIVERY"
        );

        // Separa Fila Pública (driverId = null) vs Minha Bag (driverId = me)
        const myId = session?.user?.id;
        const pub = activeDeliveryOrders.filter((o: any) => !o.driverId);
        const bag = activeDeliveryOrders.filter((o: any) => o.driverId === myId);

        setPublicOrders(pub);
        setBagOrders(bag);
      }
    } catch (err) {
      console.error("Error loading orders:", err);
      setErrorMsg("Erro ao carregar listagem de entregas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      loadOrders();
      // Polling de pedidos a cada 8 segundos
      const interval = setInterval(loadOrders, 8000);
      return () => clearInterval(interval);
    }
  }, [sessionStatus]);

  // --- Otimização de Rota (Chama backend sempre que a bag ou localização muda significativamente) ---
  const optimizeActiveRoute = async (lat: number, lng: number) => {
    if (bagOrders.length === 0) {
      setRouteGeometry(null);
      setRouteSummary(null);
      return;
    }

    try {
      const res = await fetch("/api/entregador/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverLat: lat,
          driverLng: lng,
        }),
      });
      const data = await res.json();
      if (data && data.routeGeometry) {
        setRouteGeometry(data.routeGeometry);
        setRouteSummary(data.summary);
      }
    } catch (err) {
      console.error("Optimization failed:", err);
    }
  };

  // --- GPS Geolocation watchPosition + Heartbeat Loop ---
  useEffect(() => {
    if (!navigator.geolocation || sessionStatus !== "authenticated") return;

    // Função de verificação e transmissão da localização para o banco
    const transmitLocation = async (lat: number, lng: number) => {
      const now = Date.now();
      let shouldPost = false;

      if (!lastPostPos.current) {
        shouldPost = true;
      } else {
        const distanceMoved = calculateHaversineDistance(
          lastPostPos.current.lat,
          lastPostPos.current.lng,
          lat,
          lng
        ) * 1000; // converte para metros

        const timeElapsed = (now - lastPostTime.current) / 1000; // segundos

        // Filtro de tráfego eficiente: se moveu >= 4 metros OU passou >= 30 segundos (heartbeat)
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
          console.error("Failed to post location:", err);
        }
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const speed = position.coords.speed; // m/s ou null

        setDriverLat(lat);
        setDriverLng(lng);
        setDriverSpeed(speed);

        transmitLocation(lat, lng);
        optimizeActiveRoute(lat, lng);
      },
      (error) => {
        console.error("Geolocation watch error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    // Bypass de Segundo Plano (intervalo auxiliar de segundo plano para mitigar suspensão de aba)
    const backupHeartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          transmitLocation(lat, lng);
        },
        null,
        { enableHighAccuracy: true }
      );
    }, 15000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(backupHeartbeat);
    };
  }, [sessionStatus, bagOrders.length]);

  // --- Ações de Clique (Claim, Release, Deliver) ---
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
        setErrorMsg(data.error || "Ocorreu um erro ao processar a ação.");
      } else {
        await loadOrders(); // Recarrega filas
        if (driverLat && driverLng) {
          optimizeActiveRoute(driverLat, driverLng);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexão ao enviar requisição.");
    } finally {
      setActionLoading(null);
    }
  };

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg">
        <span className="text-sm text-brand-lightGray animate-pulse">Iniciando painel do entregador...</span>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6 font-sans space-y-6">
      
      {/* Header Piloto */}
      <div className="flex items-center justify-between border-b border-brand-mediumGray pb-4">
        <div>
          <span className="text-xxs text-brand-lightGray uppercase font-bold tracking-wider">Entregador Conectado</span>
          <h2 className="text-base font-serif font-bold text-white mt-0.5">👤 {session?.user?.name}</h2>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="rounded-lg bg-brand-darkGray border border-brand-mediumGray px-3 py-1.5 text-xxs font-bold text-brand-lightGray hover:text-white cursor-pointer"
        >
          Sair
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-brand-red/10 border border-brand-red/20 rounded-xl text-xxs text-brand-red text-center font-bold">
          {errorMsg}
        </div>
      )}

      {/* Exibição do Mapa Interativo de Navegação */}
      {driverLat && driverLng ? (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xxs text-brand-lightGray">
            <span>📍 GPS Conectado</span>
            {routeSummary && (
              <span className="font-mono text-brand-red font-bold">
                Distância: {(routeSummary.distance / 1000).toFixed(2)} km
              </span>
            )}
          </div>
          <DeliveryMap
            driverLat={driverLat}
            driverLng={driverLng}
            driverSpeed={driverSpeed}
            routeGeometry={routeGeometry}
            orders={bagOrders}
            depotLat={depotLat}
            depotLng={depotLng}
          />
        </div>
      ) : (
        <div className="h-44 bg-brand-darkGray border border-brand-mediumGray rounded-2xl flex items-center justify-center text-center p-6 text-xxs text-brand-lightGray">
          <span className="animate-pulse">Aguardando coordenadas de satélite do GPS... Permita o acesso à localização.</span>
        </div>
      )}

      {/* FILA 2: MINHA BAG (Fila Privada) */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <span className="text-base">💼</span>
          <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider">
            Minha Bag ({bagOrders.length})
          </h3>
        </div>

        {bagOrders.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-brand-mediumGray bg-brand-darkGray text-center text-xxs text-brand-lightGray">
            Nenhum pedido na bag no momento. Colete um pedido abaixo!
          </div>
        ) : (
          <div className="space-y-3">
            {bagOrders.map((o, idx) => (
              <div key={o.id} className="rounded-xl border border-brand-red/35 bg-brand-darkGray p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-brand-red font-mono font-bold text-xs">#{o.orderNumber}</span>
                    <span className="block text-xxs font-bold text-white capitalize mt-0.5">{o.customerName}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded text-xxxs font-bold font-mono">
                    Parada {idx + 1}
                  </span>
                </div>

                <div className="text-xxs text-brand-lightGray space-y-1 leading-relaxed">
                  <p>📍 {o.customerAddress}, {o.addressNumber}</p>
                  {o.reference && <p className="opacity-75">Ref: {o.reference}</p>}
                  {o.notes && <p className="text-brand-red/80 italic font-medium">Obs: "{o.notes}"</p>}
                </div>

                <div className="flex space-x-2 pt-2 border-t border-brand-mediumGray/40">
                  <button
                    disabled={actionLoading !== null}
                    onClick={() => handleOrderAction(o.id, "release")}
                    className="flex-1 py-2 bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray rounded-lg text-xxs font-bold text-white transition-colors cursor-pointer"
                  >
                    Devolver
                  </button>
                  <button
                    disabled={actionLoading !== null}
                    onClick={() => handleOrderAction(o.id, "deliver")}
                    className="flex-1 py-2 bg-brand-red hover:bg-brand-redHover rounded-lg text-xxs font-bold text-white transition-colors cursor-pointer"
                  >
                    {actionLoading === o.id ? "..." : "Entregar ➔"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FILA 1: PEDIDOS DISPONÍVEIS (Fila Pública) */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <span className="text-base">📦</span>
          <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider">
            Pedidos Disponíveis na Rota ({publicOrders.length})
          </h3>
        </div>

        {publicOrders.length === 0 ? (
          <div className="p-6 rounded-2xl border border-brand-mediumGray bg-brand-darkGray text-center text-xxs text-brand-lightGray">
            Nenhum pedido despachado aguardando coleta.
          </div>
        ) : (
          <div className="space-y-3">
            {publicOrders.map((o) => (
              <div key={o.id} className="rounded-xl border border-brand-mediumGray bg-brand-darkGray p-4 space-y-3 font-sans">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-brand-lightGray font-mono font-bold text-xs">#{o.orderNumber}</span>
                    <span className="block text-xxs font-bold text-white capitalize mt-0.5">{o.customerName}</span>
                  </div>
                  <span className="text-xxs font-mono text-white font-bold">R$ {o.total.toFixed(2)}</span>
                </div>

                <div className="text-xxs text-brand-lightGray leading-relaxed">
                  <p>📍 {o.customerAddress}, {o.addressNumber}</p>
                </div>

                <button
                  disabled={actionLoading !== null}
                  onClick={() => handleOrderAction(o.id, "claim")}
                  className="w-full py-2 bg-brand-red hover:bg-brand-redHover rounded-lg text-xxs font-bold text-white transition-colors cursor-pointer"
                >
                  {actionLoading === o.id ? "Coletando..." : "Coletar para Bag"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </main>
  );
}
