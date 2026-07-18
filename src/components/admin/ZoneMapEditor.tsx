"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";

interface DeliveryZone {
  id: string;
  title: string;
  geometry: any; // GeoJSON
  deliveryFee: number;
  isActive: boolean;
}

interface ZoneMapEditorProps {
  initialZones: any[];
}

export default function ZoneMapEditor({ initialZones }: ZoneMapEditorProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawingLayerRef = useRef<any>(null);
  const zonesGroupRef = useRef<any>(null);

  const [zones, setZones] = useState<DeliveryZone[]>(initialZones);
  const [loaded, setLoaded] = useState(false);

  // Estados de Criação de Zona
  const [isDrawing, setIsDrawing] = useState(false);
  const [newZoneTitle, setNewZoneTitle] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("");
  const [vertices, setVertices] = useState<[number, number][]>([]); // [lat, lng]

  // Carrega Leaflet
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
    if (!loaded || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Inicializa o mapa centralizado em Recife (-8.05, -34.90)
    const map = L.map(mapContainerRef.current).setView([-8.05, -34.90], 13);
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

    // Grupo de camadas para exibir zonas salvas
    zonesGroupRef.current = L.featureGroup().addTo(map);

    // Camada para desenhar polígono em andamento
    drawingLayerRef.current = L.polygon([], { color: "#e31837", weight: 3, fillOpacity: 0.2 }).addTo(map);

    // Captura cliques no mapa se estiver desenhando
    map.on("click", (e: any) => {
      // Se não estiver em modo de desenho, ignora
      if (!mapRef.current || !isDrawing) return;

      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;

      setVertices((prev) => {
        const next = [...prev, [clickLat, clickLng] as [number, number]];
        
        // Atualiza visualmente o polígono desenhado
        if (drawingLayerRef.current) {
          drawingLayerRef.current.setLatLngs(next);
        }
        return next;
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        drawingLayerRef.current = null;
        zonesGroupRef.current = null;
      }
    };
  }, [loaded, isDrawing]);

  // Plota as Zonas Salvas no Mapa
  useEffect(() => {
    if (!loaded || !mapRef.current || !zonesGroupRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Limpa zonas plotadas anteriormente
    zonesGroupRef.current.clearLayers();

    // Plota cada zona
    for (const zone of zones) {
      if (!zone.geometry || zone.geometry.type !== "Polygon") continue;

      // GeoJSON coordinates são [lng, lat], mas Leaflet espera [lat, lng]
      const geoCoords = zone.geometry.coordinates[0];
      const leafletCoords = geoCoords.map((coord: any) => [coord[1], coord[0]]);

      const polygon = L.polygon(leafletCoords, {
        color: zone.isActive ? "#10b981" : "#a0a0a0", // Verde se ativa, Cinza se inativa
        weight: 2,
        fillOpacity: 0.15,
      }).addTo(zonesGroupRef.current);

      polygon.bindPopup(`
        <div style="font-family: sans-serif; font-size: 11px; color: #131313;">
          <strong>${zone.title}</strong><br/>
          Taxa: R$ ${zone.deliveryFee.toFixed(2)}<br/>
          Status: ${zone.isActive ? "Ativa" : "Inativa"}
        </div>
      `);
    }
  }, [loaded, zones]);

  // Alterna o modo de desenho
  const handleToggleDrawing = () => {
    setIsDrawing(!isDrawing);
    setVertices([]);
    if (drawingLayerRef.current) {
      drawingLayerRef.current.setLatLngs([]);
    }
  };

  // Limpa pontos em andamento
  const handleClearPoints = () => {
    setVertices([]);
    if (drawingLayerRef.current) {
      drawingLayerRef.current.setLatLngs([]);
    }
  };

  // Salvar Nova Zona
  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();

    if (vertices.length < 3) {
      alert("A zona deve ter no mínimo 3 pontos para formar um polígono.");
      return;
    }

    if (!newZoneTitle.trim() || !newZoneFee.trim()) {
      alert("Título e taxa são obrigatórios.");
      return;
    }

    // Estrutura do GeoJSON Polygon (coordenadas como [longitude, latitude], fechando o anel!)
    const geoJsonCoords = vertices.map((v) => [v[1], v[0]]); // [lng, lat]
    geoJsonCoords.push(geoJsonCoords[0]); // Fecha o anel duplicando o primeiro ponto

    const geometry = {
      type: "Polygon",
      coordinates: [geoJsonCoords],
    };

    try {
      const res = await fetch("/api/admin/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newZoneTitle,
          deliveryFee: parseFloat(newZoneFee),
          geometry,
          isActive: true,
        }),
      });

      const data = await res.json();
      if (data.id) {
        setZones((prev) => [data, ...prev]);
        
        // Limpa formulário
        setNewZoneTitle("");
        setNewZoneFee("");
        setVertices([]);
        setIsDrawing(false);
        if (drawingLayerRef.current) {
          drawingLayerRef.current.setLatLngs([]);
        }
      } else {
        alert(data.error || "Erro ao salvar zona");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao salvar zona");
    }
  };

  // Excluir Zona
  const handleDeleteZone = async (id: string) => {
    if (!confirm("Deseja realmente deletar esta zona de entrega?")) return;

    try {
      const res = await fetch(`/api/admin/zones?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setZones((prev) => prev.filter((z) => z.id !== id));
      } else {
        alert("Erro ao excluir zona");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* Coluna Esquerda: Mapa Poligonal */}
      <div className="lg:col-span-8 space-y-4">
        <div className="flex justify-between items-center bg-brand-darkGray border border-brand-mediumGray p-4 rounded-xl">
          <div className="space-y-1">
            <span className="text-xs font-bold text-white block">
              {isDrawing ? "Modo Desenho Ativo" : "Visualização das Zonas"}
            </span>
            <span className="text-xxs text-brand-lightGray block">
              {isDrawing 
                ? "Clique no mapa para marcar os pontos do polígono." 
                : "Selecione ou desenhe novos polígonos no painel lateral."
              }
            </span>
          </div>
          <button
            onClick={handleToggleDrawing}
            className={`px-4 py-2 rounded-lg text-xs font-bold text-white cursor-pointer transition-colors ${
              isDrawing ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-red hover:bg-brand-redHover"
            }`}
          >
            {isDrawing ? "Cancelar Desenho" : "Desenhar Nova Zona"}
          </button>
        </div>

        {/* Div do Container do Mapa */}
        <div 
          ref={mapContainerRef} 
          className="w-full rounded-2xl border border-brand-mediumGray bg-brand-darkGray overflow-hidden z-10" 
          style={{ height: "450px" }}
        />
      </div>

      {/* Coluna Direita: Cadastro e Gerenciador */}
      <div className="lg:col-span-4 space-y-6">
        
        {/* Formulário do Desenho Ativo */}
        {isDrawing && (
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 space-y-4">
            <h3 className="font-serif text-sm font-bold text-brand-red">Detalhes da Nova Zona</h3>
            
            <form onSubmit={handleSaveZone} className="space-y-3 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Nome da Zona</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Zona Norte"
                  value={newZoneTitle}
                  onChange={(e) => setNewZoneTitle(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Taxa de Entrega (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 5.50"
                  value={newZoneFee}
                  onChange={(e) => setNewZoneFee(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-between items-center text-xxs bg-brand-bg p-2 rounded border border-brand-mediumGray/50">
                <span className="text-brand-lightGray">Pontos demarcados:</span>
                <span className="font-bold text-white font-mono">{vertices.length}</span>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={handleClearPoints}
                  className="flex-1 py-2 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white transition-colors cursor-pointer font-bold"
                >
                  Limpar Pontos
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-brand-red hover:bg-brand-redHover transition-colors cursor-pointer text-white font-bold"
                >
                  Salvar Zona
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Listagem de Zonas Cadastradas */}
        <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 space-y-4">
          <h3 className="font-serif text-sm font-bold text-white">Zonas Ativas</h3>
          
          <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
            {zones.map((zone) => (
              <div key={zone.id} className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-2.5 text-xs">
                <div>
                  <span className="font-bold text-white block">{zone.title}</span>
                  <span className="text-xxs text-brand-lightGray font-mono">Taxa: R$ {zone.deliveryFee.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => handleDeleteZone(zone.id)}
                  className="px-2.5 py-1 rounded bg-brand-bg border border-brand-red text-xxs hover:bg-brand-red hover:text-white transition-colors cursor-pointer text-brand-red"
                >
                  Excluir
                </button>
              </div>
            ))}

            {zones.length === 0 && (
              <div className="text-center text-xxs text-brand-lightGray/50 py-12">Nenhuma zona de entrega cadastrada.</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
