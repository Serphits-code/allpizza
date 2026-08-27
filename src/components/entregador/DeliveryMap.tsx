"use client";

import React, { useEffect, useRef, useState } from "react";

interface DeliveryMapProps {
  driverLat: number;
  driverLng: number;
  driverSpeed: number | null; // em m/s
  routeGeometry: [number, number][] | null;
  orders: {
    id: string;
    orderNumber?: number;
    customerName: string;
    customerAddress: string | null;
    addressNumber: string | null;
    customerLat: number | null;
    customerLng: number | null;
  }[];
  depotLat: number;
  depotLng: number;
  activeStopIndex?: number;
  isNavigationMode?: boolean;
}

// Helper para validar e extrair coordenadas [lat, lng] válidas e seguras
function parseValidLatLngs(data: any): [number, number][] {
  if (!Array.isArray(data)) return [];
  const valid: [number, number][] = [];
  for (const item of data) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0]);
      const lng = Number(item[1]);
      if (
        !isNaN(lat) &&
        !isNaN(lng) &&
        isFinite(lat) &&
        isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        valid.push([lat, lng]);
      }
    } else if (item && typeof item === "object" && "lat" in item && "lng" in item) {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (
        !isNaN(lat) &&
        !isNaN(lng) &&
        isFinite(lat) &&
        isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        valid.push([lat, lng]);
      }
    }
  }
  return valid;
}

export default function DeliveryMap({
  driverLat,
  driverLng,
  driverSpeed,
  routeGeometry,
  orders,
  depotLat,
  depotLng,
  activeStopIndex = 0,
  isNavigationMode = false,
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const orderMarkersRef = useRef<any[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);

  // Garante coordenadas válidas com fallback
  const safeDriverLat =
    !isNaN(Number(driverLat)) && isFinite(Number(driverLat)) ? Number(driverLat) : -8.05;
  const safeDriverLng =
    !isNaN(Number(driverLng)) && isFinite(Number(driverLng)) ? Number(driverLng) : -34.90;

  const safeDepotLat =
    !isNaN(Number(depotLat)) && isFinite(Number(depotLat)) ? Number(depotLat) : null;
  const safeDepotLng =
    !isNaN(Number(depotLng)) && isFinite(Number(depotLng)) ? Number(depotLng) : null;

  // Carrega CSS/JS do Leaflet no mount
  useEffect(() => {
    if ((window as any).L) {
      setLoaded(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Inicialização e gerenciamento do Leaflet
  useEffect(() => {
    if (!loaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    try {
      if (!mapRef.current) {
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([safeDriverLat, safeDriverLng], isNavigationMode ? 18 : 16);
        mapRef.current = map;

        // Eventos de toque/arrasto do usuário desligam auto-follow
        map.on("dragstart zoomstart", () => {
          setAutoFollow(false);
        });

        // Camadas de Satélite com fallback
        const googleSatellite = L.tileLayer(
          "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
          { maxZoom: 20 }
        );

        const esriSatellite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        );
        const cartodbLabels = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
        );
        const fallbackGroup = L.layerGroup([esriSatellite, cartodbLabels]);

        googleSatellite.addTo(map);
        googleSatellite.on("tileerror", () => {
          map.removeLayer(googleSatellite);
          fallbackGroup.addTo(map);
        });
      }

      const map = mapRef.current;
      if (!map) return;

      // 1. Marcador do Piloto (Seta azul rotacionável)
      const arrowHtml = `
        <div style="transform: rotate(${rotationAngle}deg); transition: transform 0.25s ease;">
          <svg width="36" height="36" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="11" fill="#2563eb" stroke="#ffffff" stroke-width="2.5" />
            <path d="M16 5 L23 21 L16 16.5 L9 21 Z" fill="#ffffff" />
          </svg>
        </div>
      `;

      const pilotIcon = L.divIcon({
        html: arrowHtml,
        className: "pilot-marker",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!markerRef.current) {
        markerRef.current = L.marker([safeDriverLat, safeDriverLng], { icon: pilotIcon }).addTo(map);
      } else {
        markerRef.current.setLatLng([safeDriverLat, safeDriverLng]);
        markerRef.current.setIcon(pilotIcon);
      }

      // Auto-Follow
      if (autoFollow) {
        map.setView([safeDriverLat, safeDriverLng], isNavigationMode ? 18 : map.getZoom());
      }

      // 2. Traçado da Rota OSRM (com validação estrita de coordenadas)
      if (polylineRef.current) {
        try {
          map.removeLayer(polylineRef.current);
        } catch (e) {}
        polylineRef.current = null;
      }

      const validRoute = parseValidLatLngs(routeGeometry);
      if (validRoute.length >= 2) {
        try {
          polylineRef.current = L.polyline(validRoute, {
            color: "#3b82f6",
            weight: 5,
            opacity: 0.85,
            lineJoin: "round",
          }).addTo(map);
        } catch (err) {
          console.warn("Leaflet polyline render warning:", err);
        }
      }

      // 3. Marcadores de Paradas (Bag) e Depot
      orderMarkersRef.current.forEach((m) => {
        try {
          map.removeLayer(m);
        } catch (e) {}
      });
      orderMarkersRef.current = [];

      // Marcador da Base / Sede (Usa a cor da marca)
      if (safeDepotLat !== null && safeDepotLng !== null) {
        try {
          const depotIcon = L.divIcon({
            html: `<div style="background-color: var(--brand-primary, #e31837);" class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs shadow-lg">🍕</div>`,
            className: "depot-marker",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          const depotMarker = L.marker([safeDepotLat, safeDepotLng], { icon: depotIcon })
            .bindPopup("<b>Sede da Pizzaria</b>")
            .addTo(map);
          orderMarkersRef.current.push(depotMarker);
        } catch (err) {
          console.warn("Depot marker error:", err);
        }
      }

      // Marcadores das Paradas da Bag (Usa a cor da marca)
      orders.forEach((o, index) => {
        const lat = Number(o.customerLat);
        const lng = Number(o.customerLng);

        if (
          !isNaN(lat) &&
          !isNaN(lng) &&
          isFinite(lat) &&
          isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180
        ) {
          try {
            const isActive = index === activeStopIndex && isNavigationMode;
            const stopHtml = `
              <div class="relative">
                <div style="background-color: var(--brand-primary, #e31837);" class="w-8 h-8 rounded-full ${
                  isActive ? "ring-4 ring-white animate-bounce" : ""
                } border-2 border-white flex items-center justify-center text-xs font-bold text-white shadow-xl">
                  ${index + 1}
                </div>
              </div>
            `;

            const stopIcon = L.divIcon({
              html: stopHtml,
              className: "stop-marker",
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });

            const stopMarker = L.marker([lat, lng], { icon: stopIcon })
              .bindPopup(`
                <div style="font-family: sans-serif; font-size: 12px; color: #1e293b;">
                  <strong style="color: var(--brand-primary, #e31837);">Parada ${index + 1} ${
                o.orderNumber ? `(#${o.orderNumber})` : ""
              }</strong><br/>
                  <b>${o.customerName}</b><br/>
                  ${o.customerAddress || ""}, ${o.addressNumber || ""}
                </div>
              `)
              .addTo(map);
            orderMarkersRef.current.push(stopMarker);
          } catch (err) {
            console.warn("Stop marker error:", err);
          }
        }
      });
    } catch (err) {
      console.warn("Leaflet rendering general warning:", err);
    }
  }, [
    loaded,
    safeDriverLat,
    safeDriverLng,
    rotationAngle,
    autoFollow,
    routeGeometry,
    orders,
    safeDepotLat,
    safeDepotLng,
    activeStopIndex,
    isNavigationMode,
  ]);

  // Função para centralizar toda a rota na tela
  const handleFitRouteBounds = () => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    try {
      const points: [number, number][] = [[safeDriverLat, safeDriverLng]];
      orders.forEach((o) => {
        const lat = Number(o.customerLat);
        const lng = Number(o.customerLng);
        if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
          points.push([lat, lng]);
        }
      });
      if (safeDepotLat !== null && safeDepotLng !== null) {
        points.push([safeDepotLat, safeDepotLng]);
      }

      if (points.length > 1) {
        const bounds = L.latLngBounds(points);
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        setAutoFollow(false);
      } else {
        mapRef.current.setView([safeDriverLat, safeDriverLng], 17);
        setAutoFollow(true);
      }
    } catch (err) {
      console.warn("Fit bounds error:", err);
    }
  };

  // Controles manuais de rotação
  const rotateMap = (delta: number) => {
    setRotationAngle((prev) => {
      const next = (prev + delta + 360) % 360;
      if (mapContainerRef.current) {
        mapContainerRef.current.style.transform = `rotate(${next}deg)`;
        mapContainerRef.current.style.transition = "transform 0.25s ease-out";
      }
      return next;
    });
  };

  const resetRotation = () => {
    setRotationAngle(0);
    if (mapContainerRef.current) {
      mapContainerRef.current.style.transform = "rotate(0deg)";
    }
  };

  return (
    <div className="relative w-full h-[280px] sm:h-[340px] bg-brand-darkGray rounded-2xl overflow-hidden shadow-2xl border border-brand-mediumGray">
      {/* Container Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Botões de Zoom Top-Left */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col space-y-1.5">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="w-8 h-8 rounded-lg bg-brand-darkGray/90 hover:bg-brand-mediumGray text-white border border-brand-mediumGray flex items-center justify-center font-bold text-base shadow-lg transition-colors cursor-pointer"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="w-8 h-8 rounded-lg bg-brand-darkGray/90 hover:bg-brand-mediumGray text-white border border-brand-mediumGray flex items-center justify-center font-bold text-base shadow-lg transition-colors cursor-pointer"
        >
          －
        </button>
      </div>

      {/* Botão Flutuante Centralizar Rota Top-Right */}
      <button
        type="button"
        onClick={handleFitRouteBounds}
        className="absolute top-3 right-3 z-[1000] px-3.5 py-1.5 rounded-full bg-brand-darkGray/95 hover:bg-brand-mediumGray text-white border border-brand-mediumGray text-xs font-bold shadow-xl transition-all cursor-pointer flex items-center gap-1.5"
      >
        <span className="text-brand-red">✈</span> Centralizar rota
      </button>

      {/* Barra de Controles de Rotação Inferior */}
      <div className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 bg-brand-darkGray/90 backdrop-blur-md p-1 rounded-xl border border-brand-mediumGray shadow-2xl">
        {/* Girar Esquerda */}
        <button
          type="button"
          onClick={() => rotateMap(-15)}
          className="w-7 h-7 rounded-lg hover:bg-brand-bg text-brand-lightGray hover:text-white flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
          title="Girar para a esquerda"
        >
          ↺
        </button>

        {/* Bússola / Reset Norte */}
        <button
          type="button"
          onClick={resetRotation}
          className="px-2 py-1 rounded-lg hover:bg-brand-bg text-brand-lightGray hover:text-white flex items-center gap-1 text-xxs font-mono font-bold transition-colors cursor-pointer"
          title="Resetar orientação para o Norte"
        >
          <span>🧭</span> {Math.round(rotationAngle)}°
        </button>

        {/* Girar Direita */}
        <button
          type="button"
          onClick={() => rotateMap(15)}
          className="w-7 h-7 rounded-lg hover:bg-brand-bg text-brand-lightGray hover:text-white flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
          title="Girar para a direita"
        >
          ↻
        </button>
      </div>

      {/* Indicador de Status do GPS */}
      <div className="absolute bottom-3 left-3 z-[1000] px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-lg text-xxxs font-semibold border border-brand-mediumGray flex items-center gap-1.5 text-brand-lightGray">
        <span
          className={`w-2 h-2 rounded-full ${
            autoFollow ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
          }`}
        />
        <span>{autoFollow ? "GPS Ativo" : "Manual"}</span>
      </div>
    </div>
  );
}
