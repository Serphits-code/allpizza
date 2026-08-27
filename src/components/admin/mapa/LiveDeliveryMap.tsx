"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";

interface Driver {
  id: string;
  name: string;
  email: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverUpdatedAt?: string | null;
  driverActiveRoute?: any | null;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface MapOrder {
  id: string;
  orderNumber: number;
  status: "NOVO" | "EM_PREPARO" | "EM_ROTA";
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  addressNumber?: string | null;
  reference?: string | null;
  customerLat: number;
  customerLng: number;
  total: number;
  createdAt: string;
  driverId?: string | null;
  driver?: {
    id: string;
    name: string;
  } | null;
  items: OrderItem[];
}

interface DeliveryZone {
  id: string;
  title: string;
  geometry: any;
  deliveryFee: number;
  isActive: boolean;
}

interface ActiveRoute {
  driverId: string;
  orderedIds: string[];
  routeGeometry: [number, number][];
  summary: { distance: number; duration: number };
  driver: {
    id: string;
    name: string;
  };
}

interface MapData {
  orders: MapOrder[];
  drivers: Driver[];
  zones: DeliveryZone[];
  activeRoutes: ActiveRoute[];
  mapCenter: [number, number];
  generatedAt: string;
}

interface LiveDeliveryMapProps {
  initialDepotLat?: number;
  initialDepotLng?: number;
}

export default function LiveDeliveryMap({
  initialDepotLat = -8.05,
  initialDepotLng = -34.90,
}: LiveDeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const ordersLayerRef = useRef<any>(null);
  const driversLayerRef = useRef<any>(null);
  const zonesLayerRef = useRef<any>(null);
  const routesLayerRef = useRef<any>(null);
  const depotMarkerRef = useRef<any>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [driverFilter, setDriverFilter] = useState<string>("ALL");
  const [showZones, setShowZones] = useState(true);

  // Carrega Leaflet no navegador
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

  // Busca dados do backend
  const fetchMapData = async () => {
    try {
      const res = await fetch("/api/admin/mapa");
      if (!res.ok) throw new Error("Erro ao buscar dados do mapa");
      const json: MapData = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString("pt-BR"));
    } catch (err) {
      console.error("Map fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Polling automático a cada 5 segundos
  useEffect(() => {
    fetchMapData();
    const interval = setInterval(fetchMapData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Inicializa o Mapa Leaflet centralizado na sede
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || mapRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const depotCoords: [number, number] = [initialDepotLat, initialDepotLng];
    const map = L.map(mapContainerRef.current, {
      center: depotCoords,
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;

    // Camada de Tiles com fallback
    const googleTiles = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
      maxZoom: 20,
    });

    const osmTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });

    googleTiles.addTo(map);
    googleTiles.on("tileerror", () => {
      map.removeLayer(googleTiles);
      osmTiles.addTo(map);
    });

    // Marcador permanente da Sede
    const storeIcon = L.divIcon({
      html: `
        <div style="background-color: var(--brand-primary, #e31837);" class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs shadow-lg">
          🍕
        </div>
      `,
      className: "depot-marker-icon",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    depotMarkerRef.current = L.marker(depotCoords, { icon: storeIcon })
      .bindPopup("<b>Sede da Pizzaria</b><br/>Ponto central da operação")
      .addTo(map);

    // Grupos de Camadas
    zonesLayerRef.current = L.featureGroup().addTo(map);
    routesLayerRef.current = L.featureGroup().addTo(map);
    ordersLayerRef.current = L.featureGroup().addTo(map);
    driversLayerRef.current = L.featureGroup().addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapLoaded, initialDepotLat, initialDepotLng]);

  // Atualiza as Camadas no Mapa conforme dados e filtros
  useEffect(() => {
    if (!mapRef.current || !data) return;
    const L = (window as any).L;
    if (!L) return;

    // 1. Zonas de Entrega
    if (zonesLayerRef.current) {
      zonesLayerRef.current.clearLayers();
      if (showZones && data.zones) {
        for (const zone of data.zones) {
          if (!zone.geometry || zone.geometry.type !== "Polygon") continue;
          const coords = zone.geometry.coordinates[0].map((c: any) => [c[1], c[0]]);
          const poly = L.polygon(coords, {
            color: "#10b981",
            weight: 2,
            fillOpacity: 0.1,
          }).addTo(zonesLayerRef.current);

          poly.bindPopup(`
            <div style="font-family: sans-serif; font-size: 11px;">
              <strong>${zone.title}</strong><br/>
              Taxa: R$ ${zone.deliveryFee.toFixed(2)}
            </div>
          `);
        }
      }
    }

    // 2. Rotas Ativas
    if (routesLayerRef.current) {
      routesLayerRef.current.clearLayers();
      if (data.activeRoutes) {
        for (const route of data.activeRoutes) {
          if (!route.routeGeometry || route.routeGeometry.length === 0) continue;
          L.polyline(route.routeGeometry, {
            color: "#8b5cf6",
            weight: 4,
            opacity: 0.8,
            dashArray: "6, 8",
          }).addTo(routesLayerRef.current);
        }
      }
    }

    // 3. Marcadores de Pedidos
    if (ordersLayerRef.current) {
      ordersLayerRef.current.clearLayers();

      const filteredOrders = data.orders.filter((o) => {
        const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
        const matchesDriver =
          driverFilter === "ALL" ||
          (driverFilter === "NONE" && !o.driverId) ||
          o.driverId === driverFilter;
        return matchesStatus && matchesDriver;
      });

      for (const order of filteredOrders) {
        if (!order.customerLat || !order.customerLng) continue;

        const colorClass =
          order.status === "NOVO"
            ? "#3b82f6"
            : order.status === "EM_PREPARO"
            ? "#f59e0b"
            : "#a855f7";

        const orderIcon = L.divIcon({
          className: "custom-order-marker",
          html: `
            <div style="
              background-color: ${colorClass};
              color: white;
              font-family: monospace;
              font-weight: bold;
              font-size: 11px;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              border: 2px solid white;
            ">
              #${order.orderNumber}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([order.customerLat, order.customerLng], { icon: orderIcon }).addTo(
          ordersLayerRef.current
        );

        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 11px; color: #131313; min-width: 160px;">
            <strong style="color: #e31837; font-size: 13px;">Pedido #${order.orderNumber}</strong><br/>
            <strong>Cliente:</strong> ${order.customerName}<br/>
            <strong>Endereço:</strong> ${order.customerAddress || ""}, ${order.addressNumber || ""}<br/>
            <strong>Total:</strong> R$ ${order.total.toFixed(2)}<br/>
            <strong>Status:</strong> <span style="text-transform: uppercase;">${order.status}</span><br/>
            ${order.driver ? `<strong>Entregador:</strong> ${order.driver.name}` : "<span style='color: #888;'>Sem entregador</span>"}
          </div>
        `);
      }
    }

    // 4. Marcadores de Entregadores (GPS)
    if (driversLayerRef.current) {
      driversLayerRef.current.clearLayers();

      const filteredDrivers = data.drivers.filter(
        (d) => driverFilter === "ALL" || driverFilter === d.id
      );

      for (const driver of filteredDrivers) {
        if (!driver.driverLat || !driver.driverLng) continue;

        // Extrai as iniciais do nome do entregador (ex: Carlos Silva -> CS, Gustavo -> GU)
        const nameParts = driver.name.trim().split(/\s+/).filter(Boolean);
        const initials =
          nameParts.length > 1
            ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
            : (driver.name.substring(0, 2) || "E").toUpperCase();

        const driverIcon = L.divIcon({
          className: "custom-driver-marker",
          html: `
            <div style="position: relative; width: 36px; height: 36px;">
              <div style="
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
                color: #c084fc;
                font-family: sans-serif;
                font-weight: 800;
                font-size: 13px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 14px rgba(0,0,0,0.7), 0 0 0 2.5px #8b5cf6;
                letter-spacing: 0.5px;
                user-select: none;
              ">
                ${initials}
              </div>
              <div style="
                position: absolute;
                bottom: -2px;
                right: -4px;
                width: 16px;
                height: 16px;
                background-color: #8b5cf6;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                border: 1.5px solid #131313;
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
              ">
                🛵
              </div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([driver.driverLat, driver.driverLng], { icon: driverIcon }).addTo(
          driversLayerRef.current
        );

        const lastUp = driver.driverUpdatedAt
          ? new Date(driver.driverUpdatedAt).toLocaleTimeString("pt-BR")
          : "Nunca";

        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 11px; color: #131313;">
            <strong style="font-size: 12px;">🛵 Entregador: ${driver.name}</strong><br/>
            <strong>E-mail:</strong> ${driver.email}<br/>
            <strong>Último GPS:</strong> ${lastUp}
          </div>
        `);
      }
    }
  }, [data, statusFilter, driverFilter, showZones]);

  // Função para focar o mapa em uma coordenada
  const focusOnCoordinate = (lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 16, { duration: 1 });
    }
  };

  // Status de Frescor do GPS
  const getGpsStatus = (updatedAt?: string | null) => {
    if (!updatedAt) return { label: "Sem GPS", color: "text-red-400 bg-red-500/10 border-red-500/20" };
    const diffMin = (new Date().getTime() - new Date(updatedAt).getTime()) / (1000 * 60);
    if (diffMin < 2) {
      return { label: "Tempo Real", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
    if (diffMin < 60) {
      return { label: `${Math.round(diffMin)}m atrás`, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    }
    return { label: "Sem Sinal", color: "text-red-400 bg-red-500/10 border-red-500/20" };
  };

  // Contagens dos Pedidos
  const counts = useMemo(() => {
    if (!data) return { total: 0, novos: 0, preparo: 0, rota: 0 };
    return {
      total: data.orders.length,
      novos: data.orders.filter((o) => o.status === "NOVO").length,
      preparo: data.orders.filter((o) => o.status === "EM_PREPARO").length,
      rota: data.orders.filter((o) => o.status === "EM_ROTA").length,
    };
  }, [data]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-12">
      {/* Header & Barra de KPIs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-red">🗺️</span> Mapa de Entregas em Tempo Real
          </h2>
          <p className="text-xs text-brand-lightGray mt-1">
            Acompanhe pedidos despachados, localização GPS dos motoboys, zonas e rotas ativas.
          </p>
        </div>

        {/* KPIs Rápidos & Atualização */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xxs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
              Novos: {counts.novos}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
              Preparo: {counts.preparo}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
              Em Rota: {counts.rota}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchMapData}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:border-brand-lightGray text-xxs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>🔄</span> {loading ? "Sincronizando..." : "Atualizar"}
            </button>
            <span className="text-xxxs font-mono text-brand-lightGray/70">
              Sync: {lastUpdated || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Mapa e Painel Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Mapa Leaflet (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          {/* Controles do Mapa */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-darkGray border border-brand-mediumGray p-3 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <span className="text-xxs font-semibold uppercase text-brand-lightGray">Filtro:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-brand-mediumGray bg-brand-bg px-2.5 py-1 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos os Status</option>
                <option value="NOVO">Apenas Novos</option>
                <option value="EM_PREPARO">Apenas em Preparo</option>
                <option value="EM_ROTA">Apenas em Rota</option>
              </select>

              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="rounded-lg border border-brand-mediumGray bg-brand-bg px-2.5 py-1 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos os Entregadores</option>
                <option value="NONE">Sem Entregador</option>
                {data?.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (mapRef.current) {
                    const center = data?.mapCenter || [initialDepotLat, initialDepotLng];
                    mapRef.current.setView(center, 14);
                  }
                }}
                className="px-3 py-1 rounded-lg bg-brand-bg hover:bg-brand-mediumGray text-brand-lightGray hover:text-white border border-brand-mediumGray text-xxs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Centralizar o mapa na sede cadastrada"
              >
                <span>🍕</span> Centralizar na Sede
              </button>

              <button
                onClick={() => setShowZones(!showZones)}
                className={`px-3 py-1 rounded-lg text-xxs font-bold transition-colors cursor-pointer border ${
                  showZones
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-brand-bg text-brand-lightGray border-brand-mediumGray"
                }`}
              >
                {showZones ? "✓ Zonas Visíveis" : "✕ Zonas Ocultas"}
              </button>
            </div>
          </div>

          {/* Container do Mapa */}
          <div
            ref={mapContainerRef}
            className="w-full rounded-2xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden shadow-2xl z-10"
            style={{ height: "560px" }}
          />
        </div>

        {/* Coluna Direita: Painel Lateral (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Entregadores Conectados */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-xl space-y-3">
            <h3 className="font-serif text-sm font-bold text-white flex items-center justify-between">
              <span>🛵 Entregadores ({data?.drivers.length || 0})</span>
            </h3>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {data?.drivers.map((driver) => {
                const gps = getGpsStatus(driver.driverUpdatedAt);
                const assignedOrdersCount =
                  data.orders.filter((o) => o.driverId === driver.id).length;

                return (
                  <div
                    key={driver.id}
                    onClick={() => {
                      if (driver.driverLat && driver.driverLng) {
                        focusOnCoordinate(driver.driverLat, driver.driverLng);
                      }
                    }}
                    className={`p-2.5 rounded-xl bg-brand-bg border border-brand-mediumGray/50 flex justify-between items-center text-xs transition-colors ${
                      driver.driverLat ? "cursor-pointer hover:border-purple-400" : "opacity-60"
                    }`}
                  >
                    <div>
                      <span className="font-bold text-white block">{driver.name}</span>
                      <span className="text-xxxs text-brand-lightGray">
                        {assignedOrdersCount} {assignedOrdersCount === 1 ? "pedido" : "pedidos"} na bag
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xxxs font-bold border font-mono ${gps.color}`}
                    >
                      {gps.label}
                    </span>
                  </div>
                );
              })}

              {(!data?.drivers || data.drivers.length === 0) && (
                <div className="text-center py-6 text-xxs text-brand-lightGray/50">
                  Nenhum entregador cadastrado.
                </div>
              )}
            </div>
          </div>

          {/* Pedidos em Aberto */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-xl space-y-3">
            <h3 className="font-serif text-sm font-bold text-white flex items-center justify-between">
              <span>📦 Pedidos Ativos ({data?.orders.length || 0})</span>
            </h3>

            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {data?.orders.map((order) => {
                const statusBadge =
                  order.status === "NOVO"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : order.status === "EM_PREPARO"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/20";

                return (
                  <div
                    key={order.id}
                    onClick={() => focusOnCoordinate(order.customerLat, order.customerLng)}
                    className="p-3 rounded-xl bg-brand-bg border border-brand-mediumGray/50 hover:border-brand-red text-xs space-y-1.5 cursor-pointer transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-brand-red">
                          #{order.orderNumber}
                        </span>
                        <span className="font-semibold text-white truncate max-w-[120px]">
                          {order.customerName}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-white">
                        R$ {order.total.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-xxxs text-brand-lightGray truncate">
                      📍 {order.customerAddress}, {order.addressNumber}
                    </div>

                    <div className="flex justify-between items-center text-xxxs pt-1 border-t border-brand-mediumGray/20">
                      <span className={`px-2 py-0.5 rounded-full font-bold border ${statusBadge}`}>
                        {order.status}
                      </span>
                      <span className="text-purple-300 font-medium">
                        {order.driver ? `🛵 ${order.driver.name}` : "Sem piloto"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {(!data?.orders || data.orders.length === 0) && (
                <div className="text-center py-8 text-xxs text-brand-lightGray/50">
                  Nenhum pedido delivery ativo no momento.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
