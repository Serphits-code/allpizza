"use client";

import React, { useEffect, useRef, useState } from "react";

interface DeliveryMapProps {
  driverLat: number;
  driverLng: number;
  driverSpeed: number | null; // em m/s
  routeGeometry: [number, number][] | null;
  orders: {
    id: string;
    customerName: string;
    customerAddress: string | null;
    addressNumber: string | null;
    customerLat: Float32Array | number | null;
    customerLng: Float32Array | number | null;
  }[];
  depotLat: number;
  depotLng: number;
}

export default function DeliveryMap({
  driverLat,
  driverLng,
  driverSpeed,
  routeGeometry,
  orders,
  depotLat,
  depotLng,
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const orderMarkersRef = useRef<any[]>([]);
  const wakeLockRef = useRef<any>(null);

  const [loaded, setLoaded] = useState(false);
  const [heading, setHeading] = useState(0); // Rotação do ícone/mapa
  const [autoFollow, setAutoFollow] = useState(true);

  // --- 1. Wake Lock API (Evitar suspensão de tela) ---
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("[WakeLock] Luz de tela travada ativa.");
      }
    } catch (err) {
      console.warn("[WakeLock] Falha ao solicitar travamento de tela:", err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("[WakeLock] Luz de tela liberada.");
      }
    } catch (err) {
      console.error(err);
    }
  };

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

    // Ativa Wake Lock inicial
    requestWakeLock();

    // Re-adquire Wake Lock quando a aba volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- 2. Giroscópio e Bússola (Piloto Parado - Speed <= 0.8m/s) ---
  useEffect(() => {
    const isMoving = driverSpeed !== null && driverSpeed > 0.8;
    if (isMoving) return; // Se em movimento, usa orientação por vetor de GPS

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // Tenta webkitCompassHeading (Safari/iOS) ou alpha absoluto (Android Chrome)
      const compass =
        (event as any).webkitCompassHeading ||
        (event.absolute ? event.alpha : null);

      if (compass !== null && compass !== undefined) {
        // Normaliza orientação
        const angle = 360 - compass;
        setHeading(angle);
        
        // Rotaciona visualmente a tela do mapa se auto-follow ativo
        if (autoFollow && mapRef.current) {
          const mapContainer = mapContainerRef.current;
          if (mapContainer) {
            mapContainer.style.transform = `rotate(${compass}deg)`;
            mapContainer.style.transition = "transform 0.25s ease-out";
          }
        }
      }
    };

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    // Fallback standard
    window.addEventListener("deviceorientation", handleOrientation, true);

    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
      window.removeEventListener("deviceorientation", handleOrientation);
      
      // Reseta rotação do container
      if (mapContainerRef.current) {
        mapContainerRef.current.style.transform = "rotate(0deg)";
      }
    };
  }, [driverSpeed, autoFollow]);

  // --- 3. Orientação por Vetor Linear (Piloto em Movimento - Speed > 0.8m/s) ---
  const lastPosRef = useRef({ lat: driverLat, lng: driverLng });
  useEffect(() => {
    const isMoving = driverSpeed !== null && driverSpeed > 0.8;
    if (!isMoving) {
      lastPosRef.current = { lat: driverLat, lng: driverLng };
      return;
    }

    const dLat = driverLat - lastPosRef.current.lat;
    const dLng = driverLng - lastPosRef.current.lng;

    // Calcula ângulo do vetor de movimento em radianos
    if (Math.abs(dLat) > 0.00001 || Math.abs(dLng) > 0.00001) {
      const angleRad = Math.atan2(dLng, dLat); // X é lng, Y é lat
      const angleDeg = (angleRad * 180) / Math.PI;
      const normalizedHeading = (angleDeg + 360) % 360;

      setHeading(normalizedHeading);

      if (autoFollow && mapRef.current) {
        const mapContainer = mapContainerRef.current;
        if (mapContainer) {
          mapContainer.style.transform = `rotate(${360 - normalizedHeading}deg)`;
          mapContainer.style.transition = "transform 0.4s ease-out";
        }
      }
      lastPosRef.current = { lat: driverLat, lng: driverLng };
    }
  }, [driverLat, driverLng, driverSpeed, autoFollow]);

  // --- 4. Renderização e Atualização do Mapa ---
  useEffect(() => {
    if (!loaded || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // 4.1 Inicialização
    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false, // removemos botões default para simplificar no mobile
        attributionControl: false,
      }).setView([driverLat, driverLng], 17);
      mapRef.current = map;

      // Evento de interação manual do usuário: suspende auto-follow temporariamente
      map.on("dragstart zoomstart pinchstart", () => {
        setAutoFollow(false);
        // Reseta rotação física do container para facilitar navegação manual
        if (mapContainerRef.current) {
          mapContainerRef.current.style.transform = "rotate(0deg)";
        }
      });

      // Camadas de Tiles com Fallback
      // Primária: Google Satellite Hybrid
      const googleSatellite = L.tileLayer(
        "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        { maxZoom: 20 }
      );

      // Fallback: Esri World Imagery + CartoDB Labels
      const esriSatellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      );
      const cartodbLabels = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
      );

      const satelliteGroup = L.layerGroup([esriSatellite, cartodbLabels]);

      // Tenta carregar Google. Se falhar, o Leaflet reverterá
      googleSatellite.addTo(map);

      // Listener de falha no Google reverte para Esri
      googleSatellite.on("tileerror", () => {
        map.removeLayer(googleSatellite);
        satelliteGroup.addTo(map);
      });
    }

    const map = mapRef.current;

    // 4.2 Marcador do Piloto (Seta Azul Rotacionável)
    const arrowHtml = `
      <div style="transform: rotate(${heading}deg); transition: transform 0.2s ease;">
        <svg width="34" height="34" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="11" fill="#2563eb" stroke="#ffffff" stroke-width="2.5" />
          <path d="M16 5 L23 21 L16 16.5 L9 21 Z" fill="#ffffff" />
        </svg>
      </div>
    `;

    const pilotIcon = L.divIcon({
      html: arrowHtml,
      className: "pilot-nav-arrow",
      iconSize: [34, 34],
      iconAnchor: [16, 16],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([driverLat, driverLng], { icon: pilotIcon }).addTo(map);
    } else {
      markerRef.current.setLatLng([driverLat, driverLng]);
      markerRef.current.setIcon(pilotIcon);
    }

    // 4.3 Centralização Automática (Auto-Follow)
    if (autoFollow) {
      map.setView([driverLat, driverLng], map.getZoom());
    }

    // 4.4 Polilinha de Rota OSRM
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (routeGeometry && routeGeometry.length > 0) {
      polylineRef.current = L.polyline(routeGeometry, {
        color: "#3b82f6",
        weight: 5.5,
        opacity: 0.85,
        lineJoin: "round",
      }).addTo(map);
    }

    // 4.5 Marcadores dos Clientes / Depot
    // Limpa marcadores anteriores
    orderMarkersRef.current.forEach((m) => map.removeLayer(m));
    orderMarkersRef.current = [];

    // Adiciona Depot (Sede)
    const depotIcon = L.divIcon({
      html: `<div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-xs shadow-lg">🍕</div>`,
      className: "depot-marker",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const depotMarker = L.marker([depotLat, depotLng], { icon: depotIcon })
      .bindPopup("<b>Sede da Pizzaria</b><br>Retorno das rotas")
      .addTo(map);
    orderMarkersRef.current.push(depotMarker);

    // Adiciona Clientes
    orders.forEach((o, index) => {
      if (o.customerLat && o.customerLng) {
        const clientIcon = L.divIcon({
          html: `<div class="w-7 h-7 rounded-full bg-orange-600 border-2 border-white flex items-center justify-center text-xxs font-bold text-white shadow-md">${index + 1}</div>`,
          className: "client-marker",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const clientMarker = L.marker([Number(o.customerLat), Number(o.customerLng)], { icon: clientIcon })
          .bindPopup(`<b>${index + 1}. ${o.customerName}</b><br>${o.customerAddress}, ${o.addressNumber}`)
          .addTo(map);
        orderMarkersRef.current.push(clientMarker);
      }
    });

  }, [loaded, driverLat, driverLng, heading, autoFollow, routeGeometry, orders, depotLat, depotLng]);

  return (
    <div className="relative w-full h-[50vh] sm:h-[60vh] bg-brand-mediumGray rounded-2xl overflow-hidden shadow-2xl border border-brand-mediumGray">
      
      {/* Container Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Botão de Auto-Follow e Re-centralização */}
      <button
        type="button"
        onClick={() => {
          setAutoFollow(true);
          if (mapRef.current) {
            mapRef.current.setView([driverLat, driverLng], 17);
          }
        }}
        className={`absolute bottom-5 right-5 z-[1000] p-3 rounded-full shadow-lg border transition-all cursor-pointer ${
          autoFollow
            ? "bg-brand-red border-brand-red text-white"
            : "bg-brand-darkGray border-brand-mediumGray text-brand-lightGray hover:text-white"
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Indicador visual de modo de navegação */}
      <div className="absolute top-4 left-4 z-[1000] px-3 py-1 bg-black/60 backdrop-blur rounded-lg text-xxs font-semibold border border-brand-mediumGray/50 flex items-center space-x-1.5 text-brand-lightGray">
        <span className={`w-1.5 h-1.5 rounded-full ${autoFollow ? "bg-green-400 animate-pulse" : "bg-orange-500"}`} />
        <span>{autoFollow ? "Seguindo Piloto" : "Exploração Manual"}</span>
      </div>

    </div>
  );
}
