"use client";

import React, { useEffect, useRef, useState } from "react";

interface DeliveryMapProps {
  initialLat: number;
  initialLng: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export default function DeliveryMap({ initialLat, initialLng, onPositionChange }: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Carrega Leaflet de CDN dinamicamente se não estiver carregado
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

  useEffect(() => {
    if (!loaded || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Se o mapa já existe, atualiza a posição e o marcador
    if (mapRef.current) {
      mapRef.current.setView([initialLat, initialLng], 15);
      if (markerRef.current) {
        markerRef.current.setLatLng([initialLat, initialLng]);
      }
      return;
    }

    // Inicializa o mapa
    const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 15);
    mapRef.current = map;

    // Camada de tiles do Google Maps via URL com fallback para OpenStreetMap
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
      console.warn("[Leaflet Map] Falha ao carregar tiles do Google Maps, ativando fallback OpenStreetMap.");
      map.removeLayer(googleTiles);
      osmTiles.addTo(map);
    });

    // Marcador arrastável
    const marker = L.marker([initialLat, initialLng], {
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // Evento de arrasto do pino
    marker.on("dragend", () => {
      const position = marker.getLatLng();
      onPositionChange(position.lat, position.lng);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [loaded, initialLat, initialLng, onPositionChange]);

  return (
    <div className="w-full space-y-2">
      <div 
        ref={mapContainerRef} 
        className="w-full h-64 rounded-xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden z-10" 
        style={{ minHeight: "250px" }}
      />
      <span className="text-xxs text-brand-lightGray italic block text-center">
        Arraste o marcador (pino) para o local exato da entrega.
      </span>
    </div>
  );
}
