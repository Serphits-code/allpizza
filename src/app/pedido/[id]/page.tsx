"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { useCartStore } from "@/stores/cartStore";

interface OrderFlavor {
  id: string;
  flavorName: string;
  categoryName?: string;
}

interface OrderTopping {
  id?: string;
  toppingName: string;
  targetType: string;
  flavorName?: string | null;
  slicesCount: number;
  totalSlices: number;
  price: number;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string | null;
  crustType?: string | null;
  crustPrice?: number;
  caracolRequested?: boolean;
  flavors?: OrderFlavor[];
  toppings?: OrderTopping[];
}

interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  type: string;
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
  items?: OrderItem[];
}

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const { id: orderId } = params;
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Estados do Rastreamento do Motoboy no Mapa
  const [driverActive, setDriverActive] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [staleGPS, setStaleGPS] = useState(false);

  // Referências para o Leaflet Map
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

  // Busca inicial e atualização dos detalhes do pedido
  const fetchOrderDetails = async () => {
    try {
      const res = await fetch(`/api/public/orders/${orderId}`);
      const data = await res.json();

      if (data.success && data.order) {
        setOrder(data.order);
        setItems(data.order.items || []);

        // Salva dados no localStorage para facilitar acesso em "Meus Pedidos"
        try {
          if (typeof window !== "undefined" && data.order.customerPhone) {
            const cleanPhone = data.order.customerPhone.replace(/\D/g, "");
            localStorage.setItem("alldelivery_customer_phone", cleanPhone);
            if (data.order.customerName) {
              localStorage.setItem("alldelivery_customer_name", data.order.customerName);
            }
            const savedOrders = JSON.parse(localStorage.getItem("alldelivery_customer_orders") || "[]");
            if (!savedOrders.includes(data.order.id)) {
              savedOrders.unshift(data.order.id);
              localStorage.setItem("alldelivery_customer_orders", JSON.stringify(savedOrders.slice(0, 30)));
            }
          }
        } catch (e) {
          console.warn("Storage error:", e);
        }
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
  }, [orderId]);

  // Barramento SSE em Tempo Real (Zero Reload quando o status muda no Kanban)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/print/events");
      es.addEventListener("order_updated", (event: any) => {
        try {
          const updated = JSON.parse(event.data);
          if (updated && updated.id === orderId) {
            setOrder((prev) => (prev ? { ...prev, ...updated } : updated));
            if (updated.items) {
              setItems(updated.items);
            }
          }
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      });
    } catch (err) {
      console.warn("SSE connection error:", err);
    }

    // Polling inteligente como fallback de contingência
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (order?.status === OrderStatus.ENTREGUE || order?.status === OrderStatus.CANCELADO) return;
      fetchOrderDetails();
    }, 5000);

    const onFocus = () => fetchOrderDetails();
    window.addEventListener("focus", onFocus);

    return () => {
      if (es) es.close();
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [orderId, order?.status]);

  // Polling de Geolocalização do Motoboy se EM_ROTA
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
          if (data.stale) setStaleGPS(true);
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

    if (!mapRef.current) {
      const clientLat = (order as any).customerLat || -8.05;
      const clientLng = (order as any).customerLng || -34.90;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([clientLat, clientLng], 16);
      mapRef.current = map;

      const googleTiles = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
        maxZoom: 20,
      });

      const esriTiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
      const labelTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png");
      const fallbackGroup = L.layerGroup([esriTiles, labelTiles]);

      googleTiles.addTo(map);
      googleTiles.on("tileerror", () => {
        map.removeLayer(googleTiles);
        fallbackGroup.addTo(map);
      });

      const clientIcon = L.divIcon({
        html: `<div class="w-8 h-8 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center shadow-lg">🏠</div>`,
        className: "client-home-pin",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      clientMarkerRef.current = L.marker([clientLat, clientLng], { icon: clientIcon })
        .bindPopup("Endereço de Entrega")
        .addTo(map);
    }

    const map = mapRef.current;

    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (routeGeometry && routeGeometry.length > 0) {
      polylineRef.current = L.polyline(routeGeometry, {
        color: "#fbbf24",
        weight: 5,
        opacity: 0.9,
        lineJoin: "round",
      }).addTo(map);
    }

    if (driverLat !== null && driverLng !== null && driverActive) {
      const motoboyIcon = L.divIcon({
        html: `<div class="w-9 h-9 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-xl animate-bounce">🛵</div>`,
        className: "driver-moto-pin",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: motoboyIcon })
          .bindPopup(`<b>${driverName}</b> a caminho!`)
          .addTo(map);
      } else {
        driverMarkerRef.current.setLatLng([driverLat, driverLng]);
      }

      const clientLat = (order as any).customerLat || -8.05;
      const clientLng = (order as any).customerLng || -34.90;
      const bounds = L.latLngBounds([
        [clientLat, clientLng],
        [driverLat, driverLng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      if (driverMarkerRef.current) {
        map.removeLayer(driverMarkerRef.current);
        driverMarkerRef.current = null;
      }
    }
  }, [mapLoaded, order, driverLat, driverLng, driverActive, routeGeometry]);

  // Ação de "Pedir Novamente" (Clone de itens para o carrinho)
  const handleReorder = () => {
    if (!items || items.length === 0) return;
    setReordering(true);

    try {
      items.forEach((it) => {
        addItem({
          name: it.name,
          isPizza: Boolean(it.isPizza),
          quantity: it.quantity || 1,
          price: (it.totalPrice || 0) / (it.quantity || 1),
          pizzaSize: it.pizzaSize || undefined,
          crustType: it.crustType || undefined,
          crustPrice: it.crustPrice || undefined,
          caracolRequested: it.caracolRequested || undefined,
          flavors: (it.flavors || []).map((f) => ({
            name: f.flavorName,
            categoryName: f.categoryName || "Pizza",
          })),
          toppings: (it.toppings || []).map((t) => ({
            toppingName: t.toppingName,
            targetType: t.targetType,
            flavorName: t.flavorName || null,
            slicesCount: t.slicesCount || 1,
            totalSlices: t.totalSlices || 1,
            price: t.price || 0,
          })),
        });
      });

      router.push("/carrinho");
    } catch (err) {
      console.error("Reorder error:", err);
      alert("Erro ao adicionar itens ao carrinho.");
      setReordering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090c13]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-neutral-400 font-sans tracking-wide">Carregando status do pedido...</span>
        </div>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-5 bg-[#090c13] min-h-screen flex flex-col justify-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="text-xl font-bold text-white">Pedido não encontrado</h2>
        <p className="text-xs text-neutral-400">{errorMsg || "Não localizamos os dados deste pedido."}</p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/meus-pedidos" className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold text-white border border-neutral-700 transition">
            Meus Pedidos
          </Link>
          <Link href="/" className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 rounded-xl text-xs font-bold text-black transition">
            Voltar ao Cardápio
          </Link>
        </div>
      </div>
    );
  }

  // Definição das 4 etapas visuais conforme o Print 2
  const isRetirada = order.type === "RETIRADA";
  const steps = [
    {
      key: "RECEBIDO",
      label: "Recebido",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      key: "PREPARO",
      label: "Preparo",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      key: "ROTA",
      label: isRetirada ? "Pronto" : "Em Rota",
      icon: isRetirada ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      ),
    },
    {
      key: "ENTREGUE",
      label: isRetirada ? "Retirado" : "Entregue",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  // Identifica o índice atual do progresso
  const getActiveIndex = (status: OrderStatus) => {
    switch (status) {
      case "NOVO":
        return 0;
      case "EM_PREPARO":
        return 1;
      case "EM_ROTA":
      case "PRONTO_RETIRADA":
        return 2;
      case "ENTREGUE":
        return 3;
      case "CANCELADO":
        return -1;
      default:
        return 0;
    }
  };

  const activeIndex = getActiveIndex(order.status);

  // Formatação amigável de status
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "ENTREGUE":
        return { label: isRetirada ? "Retirado" : "Entregue", style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
      case "EM_ROTA":
        return { label: "Em Rota de Entrega", style: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
      case "PRONTO_RETIRADA":
        return { label: "Pronto para Retirada", style: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
      case "EM_PREPARO":
        return { label: "Em Preparo", style: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
      case "NOVO":
        return { label: "Recebido", style: "bg-neutral-800 text-neutral-300 border-neutral-700" };
      case "CANCELADO":
        return { label: "Cancelado", style: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
      default:
        return { label: status, style: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    }
  };

  const statusBadge = getStatusBadge(order.status);
  const formattedDate = new Date(order.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-[#090c13] text-neutral-100 py-8 px-4 sm:px-6 flex flex-col items-center selection:bg-amber-400 selection:text-black">
      <div className="w-full max-w-xl space-y-6">

        {/* 1. CARD SUPERIOR DE STATUS E STEPPER (IDÊNTICO AO PRINT 2) */}
        <div className="bg-[#111622] border border-neutral-800/80 rounded-2xl p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          {/* Header com Pedido # e Badge */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Pedido #{order.orderNumber}
              </h1>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                {formattedDate}
              </p>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${statusBadge.style}`}>
              {statusBadge.label}
            </span>
          </div>

          {/* Stepper Horizontal com Linhas e Ícones Amarelos */}
          {order.status !== "CANCELADO" ? (
            <div className="relative px-2 sm:px-4">
              {/* Linha conectora de fundo cinza */}
              <div className="absolute top-5 left-8 right-8 h-[2px] bg-neutral-800 -z-0" />

              {/* Linha conectora ativa amarela */}
              <div
                className="absolute top-5 left-8 h-[2px] bg-amber-400 transition-all duration-700 -z-0"
                style={{
                  width: `${Math.min(100, Math.max(0, (activeIndex / (steps.length - 1)) * 100))}%`,
                  maxWidth: "calc(100% - 4rem)",
                }}
              />

              <div className="flex items-center justify-between relative z-10">
                {steps.map((step, idx) => {
                  const isDone = idx <= activeIndex;
                  const isCurrent = idx === activeIndex;

                  return (
                    <div key={step.key} className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                          isDone
                            ? "bg-amber-400 text-black shadow-lg shadow-amber-400/20"
                            : "bg-[#161c2b] text-neutral-500 border border-neutral-700/60"
                        } ${isCurrent ? "ring-4 ring-amber-400/20 scale-105" : ""}`}
                      >
                        {step.icon}
                      </div>

                      <span
                        className={`text-xs mt-2.5 font-medium transition-colors ${
                          isDone ? "text-amber-400 font-bold" : "text-neutral-500"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center text-xs font-semibold">
              Este pedido foi cancelado pelo estabelecimento.
            </div>
          )}
        </div>

        {/* 2. CARD DO MAPA DE ENTREGA (ATIVO APENAS SE EM ROTA) */}
        {order.status === OrderStatus.EM_ROTA && (
          <div className="bg-[#111622] border border-neutral-800/80 rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-bold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Entrega em tempo real
              </span>
              {driverActive && (
                <span className="text-neutral-300 font-medium">Entregador: <strong>{driverName}</strong></span>
              )}
            </div>

            <div className="relative overflow-hidden rounded-xl border border-neutral-800">
              <div ref={mapContainerRef} className="w-full h-56 bg-neutral-900" />
            </div>

            {!driverActive && (
              <div className="p-2.5 bg-neutral-900/80 rounded-lg text-xxs text-neutral-400 text-center italic">
                {staleGPS
                  ? "📍 Entregador em trânsito. (Sincronizando sinal de GPS...)"
                  : "🛵 O entregador iniciará o trajeto até o seu endereço em instantes."}
              </div>
            )}
          </div>
        )}

        {/* 3. CARD DE ITENS DO PEDIDO (IDÊNTICO AO PRINT 2) */}
        <div className="bg-[#111622] border border-neutral-800/80 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
          <h2 className="text-sm font-bold text-white tracking-wide">
            Itens do Pedido
          </h2>

          <div className="divide-y divide-neutral-800/60">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="font-medium text-white pr-4">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-mono text-neutral-200 font-semibold whitespace-nowrap">
                    R$ {Number(item.totalPrice || 0).toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {/* Discriminação de Borda Recheada */}
                {item.crustType && item.crustType !== "Tradicional" && (
                  <p className="text-xs text-neutral-400 pl-4">
                    + Borda: {item.crustType} {item.caracolRequested ? "(Caracol)" : ""}
                  </p>
                )}

                {/* Discriminação de Adicionais */}
                {item.toppings && item.toppings.length > 0 && (
                  <div className="pl-4 space-y-0.5 pt-0.5">
                    {item.toppings.map((top, tIdx) => (
                      <p key={tIdx} className="text-xs text-neutral-400">
                        + {top.slicesCount > 1 ? `${top.slicesCount}x ` : "1x "}{top.toppingName}
                        {top.targetType === "FLAVOR" && top.flavorName ? ` (${top.flavorName})` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Resumo Financeiro */}
          <div className="border-t border-neutral-800/80 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-neutral-400">
              <span>Subtotal</span>
              <span className="font-mono text-neutral-200">
                R$ {Number(order.subtotal || 0).toFixed(2).replace(".", ",")}
              </span>
            </div>

            {Number(order.deliveryFee || 0) > 0 && (
              <div className="flex justify-between text-neutral-400">
                <span>Taxa de entrega</span>
                <span className="font-mono text-neutral-200">
                  R$ {Number(order.deliveryFee || 0).toFixed(2).replace(".", ",")}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-2 border-t border-neutral-800 text-base font-bold">
              <span className="text-white">Total</span>
              <span className="font-mono text-lg font-extrabold text-amber-400">
                R$ {Number(order.total || 0).toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </div>

        {/* 4. BOTÕES DE AÇÃO INFERIORES (IDÊNTICO AO PRINT 2) */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          {/* Botão Amarelo de Pedir Novamente */}
          <button
            onClick={handleReorder}
            disabled={reordering}
            className="flex-1 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{reordering ? "Adicionando..." : "Pedir Novamente"}</span>
          </button>

          {/* Botão Meus Pedidos */}
          <Link
            href="/meus-pedidos"
            className="py-3.5 px-5 rounded-xl bg-[#141925] hover:bg-[#1a2133] text-white font-semibold text-sm border border-neutral-800 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span>Meus Pedidos</span>
          </Link>

          {/* Botão Cardápio */}
          <Link
            href="/"
            className="py-3.5 px-5 rounded-xl bg-[#141925] hover:bg-[#1a2133] text-white font-semibold text-sm border border-neutral-800 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span>Cardápio</span>
          </Link>
        </div>

      </div>
    </div>
  );
}
