"use client";

import React, { useEffect, useRef, useState } from "react";

interface DepotLocationPickerModalProps {
  initialLat: string;
  initialLng: string;
  onConfirm: (lat: string, lng: string) => void;
  onClose: () => void;
}

export default function DepotLocationPickerModal({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}: DepotLocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const initLatNum = !isNaN(parseFloat(initialLat)) ? parseFloat(initialLat) : -8.05;
  const initLngNum = !isNaN(parseFloat(initialLng)) ? parseFloat(initialLng) : -34.90;

  const [currentLat, setCurrentLat] = useState<number>(initLatNum);
  const [currentLng, setCurrentLng] = useState<number>(initLngNum);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Carrega CSS/JS do Leaflet
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

  // Inicializa o Mapa
  useEffect(() => {
    if (!loaded || !mapContainerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView([initLatNum, initLngNum], 15);
    mapRef.current = map;

    // Adiciona zoom control no canto superior direito
    L.control.zoom({ position: "topright" }).addTo(map);

    // Camada de mapa OpenStreetMap / Google híbrido
    const googleTiles = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
    });
    const osmTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    });

    googleTiles.addTo(map);
    googleTiles.on("tileerror", () => {
      map.removeLayer(googleTiles);
      osmTiles.addTo(map);
    });

    // Ícone da Sede (Pizzaria)
    const storeIcon = L.divIcon({
      html: `
        <div style="background-color: var(--brand-primary, #e31837);" class="w-10 h-10 rounded-full border-3 border-white flex items-center justify-center text-lg shadow-2xl cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 animate-bounce">
          🍕
        </div>
      `,
      className: "depot-marker-icon",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    // Marcador arrastável
    const marker = L.marker([initLatNum, initLngNum], {
      icon: storeIcon,
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    marker.bindPopup("<b>Minha Sede (Pizzaria)</b><br/>Arraste para ajustar a posição").openPopup();

    // Evento de arrasto do marcador
    marker.on("dragend", (e: any) => {
      const position = e.target.getLatLng();
      setCurrentLat(position.lat);
      setCurrentLng(position.lng);
    });

    // Evento de clique no mapa (move o marcador)
    map.on("click", (e: any) => {
      const { lat, lng } = e.latlng;
      setCurrentLat(lat);
      setCurrentLng(lng);
      marker.setLatLng([lat, lng]);
      map.panTo([lat, lng]);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [loaded, initLatNum, initLngNum]);

  // Geocodificação de Endereço via Nominatim (OpenStreetMap)
  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=br&limit=1`
      );
      const data = await res.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        setCurrentLat(lat);
        setCurrentLng(lng);

        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.setView([lat, lng], 16);
          markerRef.current.openPopup();
        }
      } else {
        setSearchError("Endereço não localizado. Tente digitar nome da rua, bairro ou cidade.");
      }
    } catch (err) {
      console.error(err);
      setSearchError("Erro de conexão ao buscar endereço.");
    } finally {
      setSearching(false);
    }
  };

  // Obter Localização Atual do Navegador (GPS)
  const handleUseCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta geolocalização.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setCurrentLat(lat);
        setCurrentLng(lng);

        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.setView([lat, lng], 17);
          markerRef.current.openPopup();
        }
      },
      (err) => {
        alert("Não foi possível obter sua localização atual.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleConfirm = () => {
    onConfirm(currentLat.toFixed(6), currentLng.toFixed(6));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-3xl rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-4 font-sans text-white">
        {/* Cabeçalho do Modal */}
        <div className="flex justify-between items-center border-b border-brand-mediumGray/50 pb-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
              <span className="text-brand-red">📍</span> Definir Localização da Minha Sede
            </h3>
            <p className="text-xxs text-brand-lightGray mt-0.5">
              Clique no mapa ou arraste o marcador 🍕 para a localização exata da sua pizzaria/estabelecimento.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white flex items-center justify-center text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Barra de Busca de Endereço & Botão GPS */}
        <div className="space-y-2">
          <form onSubmit={handleSearchAddress} className="flex gap-2">
            <input
              type="text"
              placeholder="Digite endereço, bairro, cidade ou CEP para buscar no mapa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-xl border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2.5 rounded-xl bg-brand-bg hover:bg-brand-mediumGray border border-brand-mediumGray text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>🔍</span> {searching ? "Buscando..." : "Buscar"}
            </button>
            <button
              type="button"
              onClick={handleUseCurrentGPS}
              className="px-4 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              title="Obter coordenadas do GPS atual"
            >
              <span>🎯</span> Meu GPS
            </button>
          </form>

          {searchError && (
            <span className="text-xxs text-brand-red font-medium block">{searchError}</span>
          )}
        </div>

        {/* Container do Mapa */}
        <div
          ref={mapContainerRef}
          className="w-full h-[360px] rounded-xl border border-brand-mediumGray bg-brand-bg overflow-hidden relative shadow-inner"
        />

        {/* Rodapé com Coordenadas e Confirmação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-brand-mediumGray/50">
          <div className="flex items-center gap-2 bg-brand-bg px-3.5 py-2 rounded-xl border border-brand-mediumGray font-mono text-xs text-slate-300">
            <span className="text-brand-red font-bold">Coords:</span>
            <span>Lat: {currentLat.toFixed(6)}</span>
            <span className="text-brand-lightGray/40">|</span>
            <span>Lng: {currentLng.toFixed(6)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-all cursor-pointer shadow-lg shadow-brand-red/20 flex items-center gap-1.5"
            >
              <span>✓</span> Confirmar Localização da Sede
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
