"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { OrderStatus, PaymentMethod } from "@prisma/client";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  flavors: {
    id: string;
    flavorName: string;
  }[];
}

interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  addressNumber: string | null;
  reference: string | null;
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes: string | null;
  createdAt: string;
}

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const { id: orderId } = params;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados do Rastreamento do Motoboy
  const [driverActive, setDriverActive] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [staleGPS, setStaleGPS] = useState(false);

  // Referências para o mapa
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const clientMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Carrega CSS/JS do Leaflet no mount
  useEffect(() => {
    if ((window as any).L) {
      setMapLoaded(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setMapLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Polling de Detalhes do Pedido (Novo, Preparando, Em Rota, Entregue)
  const fetchOrderDetails = async () => {
    try {
      const res = await fetch(`/api/public/orders/${orderId}`);
      const data = await res.json();

      if (data.success && data.order) {
        setOrder(data.order);
        setItems(data.order.items || []);
      } else {
        setErrorMsg(data.error || "Pedido não localizado.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro ao carregar status do pedido.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();

    // Se o pedido já foi finalizado (ENTREGUE ou CANCELADO), não há necessidade de polling contínuo
    if (order?.status === OrderStatus.ENTREGUE || order?.status === OrderStatus.CANCELADO) {
      return;
    }

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchOrderDetails();
    }, 6000);

    const onFocus = () => {
      fetchOrderDetails();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [orderId, order?.status]);

  // Polling de Geolocalização do Entregador (a cada 4 segundos, somente se status for EM_ROTA e aba visível)
  useEffect(() => {
    if (!order || order.status !== OrderStatus.EM_ROTA) {
      setDriverActive(false);
      setDriverLat(null);
      setDriverLng(null);
      setRouteGeometry(null);
      return;
    }

    const fetchDriverLocation = async () => {
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch(`/api/public/driver-location?orderId=${orderId}`);
        const data = await res.json();

        if (data.active) {
          setDriverActive(true);
          setDriverName(data.driverName || "Motoboy");
          setDriverLat(data.lat);
          setDriverLng(data.lng);
          setRouteGeometry(data.routeGeometry || null);
          setStaleGPS(false);
        } else {
          setDriverActive(false);
          if (data.stale) {
            setStaleGPS(true);
          }
        }
      } catch (err) {
        console.error("Error polling driver location:", err);
      }
    };

    fetchDriverLocation();
    const locationInterval = setInterval(fetchDriverLocation, 4000);
    return () => clearInterval(locationInterval);
  }, [order?.status, orderId]);

  // Renderização do Mapa do Cliente
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !order || order.status !== OrderStatus.EM_ROTA) return;

    const L = (window as any).L;
    if (!L) return;

    // Inicia Mapa
    if (!mapRef.current) {
      // Inicia centrado na casa do cliente se houver lat/lng, senão em Recife
      const clientLat = (order as any).customerLat || -8.05;
      const clientLng = (order as any).customerLng || -34.90;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([clientLat, clientLng], 16);
      mapRef.current = map;

      // Google Satellite Hybrid como primário
      const googleTiles = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
        maxZoom: 20,
      });

      // Esri fallback
      const esriTiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
      const labelTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png");
      const fallbackGroup = L.layerGroup([esriTiles, labelTiles]);

      googleTiles.addTo(map);
      googleTiles.on("tileerror", () => {
        map.removeLayer(googleTiles);
        fallbackGroup.addTo(map);
      });

      // Plot do pin do Cliente
      const clientIcon = L.divIcon({
        html: `<div class="w-8 h-8 rounded-full bg-brand-red border-2 border-white flex items-center justify-center shadow-lg">🏠</div>`,
        className: "client-home-pin",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      clientMarkerRef.current = L.marker([clientLat, clientLng], { icon: clientIcon })
        .bindPopup("Sua Casa")
        .addTo(map);
    }

    const map = mapRef.current;

    // Desenha traçado da rota OSRM
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (routeGeometry && routeGeometry.length > 0) {
      polylineRef.current = L.polyline(routeGeometry, {
        color: "#3b82f6",
        weight: 5,
        opacity: 0.8,
        lineJoin: "round",
      }).addTo(map);
    }

    // Marcador de movimento do Motoboy
    if (driverLat !== null && driverLng !== null && driverActive) {
      const motoboyIcon = L.divIcon({
        html: `<div class="w-9 h-9 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-xl animate-bounce">🛵</div>`,
        className: "driver-moto-pin",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: motoboyIcon })
          .bindPopup(`<b>${driverName}</b> está levando seu pedido!`)
          .addTo(map);
      } else {
        driverMarkerRef.current.setLatLng([driverLat, driverLng]);
      }
      
      // Auto-centra entre motorista e cliente
      const clientLat = (order as any).customerLat || -8.05;
      const clientLng = (order as any).customerLng || -34.90;
      const bounds = L.latLngBounds([
        [clientLat, clientLng],
        [driverLat, driverLng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      // Se motoboy inativar ou sinal de GPS sumir, limpa o pin
      if (driverMarkerRef.current) {
        map.removeLayer(driverMarkerRef.current);
        driverMarkerRef.current = null;
      }
    }

  }, [mapLoaded, order, driverLat, driverLng, driverActive, routeGeometry]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg">
        <span className="text-sm text-brand-lightGray animate-pulse font-sans">Carregando status de entrega...</span>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center space-y-4 bg-brand-bg min-h-screen flex flex-col justify-center">
        <span className="text-3xl">⚠️</span>
        <h2 className="font-serif text-xl font-bold text-white">Oops!</h2>
        <p className="text-xs text-brand-lightGray">{errorMsg || "Pedido não encontrado."}</p>
        <Link href="/" className="inline-block px-5 py-2.5 bg-brand-red rounded-lg text-xs font-bold text-white">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  // Mapeamento visual das etapas de progresso
  const statusSteps = [
    { key: OrderStatus.NOVO, label: "Novo", icon: "📝" },
    { key: OrderStatus.EM_PREPARO, label: "Na Cozinha", icon: "🍕" },
    { key: OrderStatus.EM_ROTA, label: "Em Rota", icon: "🛵" },
    { key: OrderStatus.ENTREGUE, label: "Entregue", icon: "✓" },
  ];

  const getStepIndex = (s: OrderStatus) => {
    return statusSteps.findIndex((item) => item.key === s);
  };

  const currentStepIdx = getStepIndex(order.status);

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-xl text-center space-y-3">
        <span className="text-xxs text-brand-lightGray uppercase font-bold tracking-wider">Acompanhamento do Pedido</span>
        <h2 className="text-xl font-serif font-bold text-white">Pedido #{order.orderNumber}</h2>
        <p className="text-xxs text-brand-lightGray">
          Criado em: {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Barra de Progresso Visual das Etapas */}
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-6">
        <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider text-center">Status do Pedido</h3>
        
        <div className="flex items-center justify-between text-xs font-semibold">
          {statusSteps.map((stepItem, idx) => {
            const isActive = idx === currentStepIdx;
            const isCompleted = idx < currentStepIdx;

            return (
              <React.Fragment key={stepItem.key}>
                <div className="flex flex-col items-center space-y-2 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all border ${
                      isActive
                        ? "bg-brand-red border-brand-red text-white scale-110 shadow-lg"
                        : isCompleted
                        ? "bg-brand-red/20 border-brand-red/35 text-brand-red"
                        : "bg-brand-bg border-brand-mediumGray text-brand-lightGray"
                    }`}
                  >
                    {stepItem.icon}
                  </div>
                  <span className={isActive ? "text-brand-red font-bold" : "text-brand-lightGray text-xxs"}>
                    {stepItem.label}
                  </span>
                </div>
                {idx < statusSteps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1.5 transition-colors ${
                      isCompleted ? "bg-brand-red" : "bg-brand-mediumGray"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Rastreamento geográfico ativo se EM_ROTA */}
      {order.status === OrderStatus.EM_ROTA && (
        <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-xl space-y-4">
          <div className="flex justify-between items-center text-xxs text-brand-lightGray font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              Rastreamento em tempo real
            </span>
            {driverActive && (
              <span className="font-bold text-brand-red">Entregador: {driverName}</span>
            )}
          </div>

          {/* Leaflet Map */}
          <div className="relative overflow-hidden rounded-xl border border-brand-mediumGray">
            <div ref={mapContainerRef} className="w-full h-64 bg-brand-mediumGray" />
          </div>

          {/* Fallback de GPS Stale ou Motorista inativo */}
          {!driverActive && (
            <div className="p-3 bg-brand-bg rounded-lg border border-brand-mediumGray text-xxs text-brand-lightGray text-center italic">
              {staleGPS
                ? "📍 O entregador está a caminho. (Aguardando sinal de satélite/GPS)"
                : "🛵 Aguardando o entregador iniciar a navegação na rota..."}
            </div>
          )}
        </div>
      )}

      {/* Resumo do Pedido */}
      <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4 font-sans text-xs">
        <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider border-b border-brand-mediumGray pb-2">
          Resumo do Envio
        </h3>

        <div className="space-y-2 leading-relaxed">
          <div className="flex justify-between">
            <span className="text-brand-lightGray font-semibold">Cliente:</span>
            <span className="text-white capitalize">{order.customerName}</span>
          </div>

          {order.customerAddress && (
            <div className="flex justify-between">
              <span className="text-brand-lightGray font-semibold">Endereço:</span>
              <span className="text-white text-right leading-tight max-w-[200px]">
                {order.customerAddress}, {order.addressNumber}
                {order.reference && <span className="block text-xxs opacity-75">({order.reference})</span>}
              </span>
            </div>
          )}

          <div className="flex justify-between border-t border-brand-mediumGray/35 pt-2">
            <span className="text-brand-lightGray font-semibold">Forma de Pagamento:</span>
            <span className="text-white">
              {{
                [PaymentMethod.PIX]: "PIX",
                [PaymentMethod.DINHEIRO]: "Dinheiro",
                [PaymentMethod.CREDITO]: "Cartão de Crédito",
                [PaymentMethod.DEBITO]: "Cartão de Débito",
              }[order.paymentMethod]}
            </span>
          </div>

          {order.notes && (
            <div className="p-3 bg-brand-bg rounded-lg border border-brand-mediumGray text-xxs italic text-brand-lightGray">
              Obs: "{order.notes}"
            </div>
          )}

          <div className="space-y-1.5 border-t border-brand-mediumGray/35 pt-2 text-xxs text-brand-lightGray">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono text-white">R$ {order.subtotal.toFixed(2)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Taxa de entrega</span>
                <span className="font-mono text-white">R$ {order.deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-brand-mediumGray/20 pt-1.5 text-xs font-bold">
              <span className="text-white">Total Geral</span>
              <span className="font-mono text-brand-red text-sm">R$ {order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <Link
          href="/"
          className="block w-full py-3 bg-brand-bg hover:bg-brand-mediumGray text-center rounded-xl text-xs font-bold text-white border border-brand-mediumGray transition-colors cursor-pointer"
        >
          Voltar ao Cardápio
        </Link>
      </div>

    </main>
  );
}
