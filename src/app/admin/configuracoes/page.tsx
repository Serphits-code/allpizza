"use client";

import React, { useState, useEffect } from "react";
import DepotLocationPickerModal from "@/components/admin/configuracoes/DepotLocationPickerModal";

export default function ConfigPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [deliveryCities, setDeliveryCities] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#e31837");
  const [depotLat, setDepotLat] = useState("-8.05");
  const [depotLng, setDepotLng] = useState("-34.90");
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  // Integração Desktop / API Key
  const [desktopApiKey, setDesktopApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [localIps, setLocalIps] = useState<{ name: string; address: string }[]>([]);
  const [selectedServerUrl, setSelectedServerUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Carrega configurações atuais
  useEffect(() => {
    fetch("/api/admin/system-config")
      .then((res) => res.json())
      .then((data) => {
        setCompanyName(data.companyName || "");
        setCompanyLogo(data.companyLogo || "");
        setDeliveryCities(data.deliveryCities || "");
        setPrimaryColor(data.primaryColor || "#e31837");
        setDepotLat(data.depotLat || "-8.05");
        setDepotLng(data.depotLng || "-34.90");
        setDesktopApiKey(data.desktopApiKey || "alldelivery_internal_print_secret");
        if (data.localIps && Array.isArray(data.localIps)) {
          setLocalIps(data.localIps);
        }

        // Define a URL padrão (origem atual do navegador ou IP local)
        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        setSelectedServerUrl(origin);
      })
      .catch((err) => {
        console.error("Erro ao carregar configurações:", err);
        setMessage({ type: "error", text: "Não foi possível carregar as configurações." });
      })
      .finally(() => setLoading(false));
  }, []);

  // Upload da Logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.url) {
        setCompanyLogo(data.url);
        setMessage({ type: "success", text: "Logo enviada com sucesso! Lembre-se de salvar as alterações." });
      } else {
        setMessage({ type: "error", text: data.error || "Erro ao enviar arquivo." });
      }
    } catch (err) {
      console.error("Upload error:", err);
      setMessage({ type: "error", text: "Erro na conexão ao enviar a logo." });
    } finally {
      setUploading(false);
    }
  };

  // Gerar Nova Chave de Acesso Segura
  const handleGenerateApiKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "alldelivery_";
    for (let i = 0; i < 28; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setDesktopApiKey(token);
    setMessage({
      type: "success",
      text: "Nova chave de acesso gerada! Clique em 'Salvar Configurações' abaixo para ativá-la no servidor.",
    });
  };

  // Copiar Link da API
  const handleCopyLink = () => {
    if (!selectedServerUrl) return;
    navigator.clipboard.writeText(selectedServerUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Copiar Chave de Acesso
  const handleCopyKey = () => {
    if (!desktopApiKey) return;
    navigator.clipboard.writeText(desktopApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  // Salvar Configurações
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyLogo,
          deliveryCities,
          primaryColor,
          depotLat,
          depotLng,
          desktopApiKey,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: "Configurações e Chave de Acesso salvas com sucesso! O aplicativo Electron já pode se comunicar com esta chave.",
        });
      } else {
        setMessage({ type: "error", text: data.error || "Erro ao salvar configurações." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Erro ao conectar ao servidor." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-sm text-brand-lightGray animate-pulse">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      <div>
        <h2 className="text-2xl font-extrabold text-white mb-1 tracking-tight">Configurações Gerais</h2>
        <p className="text-xs text-brand-lightGray">Ajuste a identidade visual, logo e as restrições regionais do seu delivery.</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold ${
            message.type === "success"
              ? "bg-green-600/10 border border-green-500/20 text-green-400"
              : "bg-brand-red/10 border border-brand-red/20 text-brand-red"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-xl font-sans">
        
        {/* Nome da Empresa */}
        <div>
          <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
            Nome da Empresa (exibido na barra de navegação)
          </label>
          <input
            type="text"
            required
            placeholder="Ex: Artisanal"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
          />
        </div>

        {/* Logo da Empresa */}
        <div>
          <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
            Logo da Empresa
          </label>
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-lg bg-brand-bg border border-brand-mediumGray flex items-center justify-center overflow-hidden">
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xxs text-brand-lightGray/40">Sem Logo</span>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
                id="logo-upload-input"
              />
              <label
                htmlFor="logo-upload-input"
                className="inline-block rounded-lg border border-brand-mediumGray hover:border-brand-lightGray bg-brand-bg px-3.5 py-2 text-xxs font-bold text-white cursor-pointer transition-colors"
              >
                {uploading ? "Carregando..." : "Enviar Nova Imagem"}
              </label>
              {companyLogo && (
                <button
                  type="button"
                  onClick={() => setCompanyLogo("")}
                  className="block text-xxs text-brand-red hover:underline text-left cursor-pointer"
                >
                  Remover Logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cidades de Entrega */}
        <div>
          <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
            Cidades de Entrega (para geolocalização do checkout)
          </label>
          <input
            type="text"
            placeholder="Ex: Cachoeirinha, Recife"
            value={deliveryCities}
            onChange={(e) => setDeliveryCities(e.target.value)}
            className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
          />
          <span className="text-xxxs text-brand-lightGray block mt-1">
            * Insira as cidades separadas por vírgula. A primeira cidade será usada como a localização padrão do mapa no checkout.
          </span>
        </div>

        {/* Coordenadas Sede (Depot) */}
        <div className="space-y-2 bg-brand-bg/50 p-4 rounded-xl border border-brand-mediumGray/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                Localização da Sede (Depot Central da Pizzaria)
              </label>
              <span className="text-xxxs text-brand-lightGray/70 block">
                Define o centro dos mapas operacionais e o ponto de partida/retorno da rota dos entregadores.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsMapModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-brand-red/15 hover:bg-brand-red/25 border border-brand-red/40 text-brand-red text-xxs font-bold transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
            >
              <span>📍</span> Selecionar Minha Sede no Mapa
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xxxs font-semibold uppercase text-brand-lightGray/80 mb-1">
                Latitude
              </label>
              <input
                type="text"
                required
                placeholder="Ex: -8.05"
                value={depotLat}
                onChange={(e) => setDepotLat(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white font-mono focus:border-brand-red focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xxxs font-semibold uppercase text-brand-lightGray/80 mb-1">
                Longitude
              </label>
              <input
                type="text"
                required
                placeholder="Ex: -34.90"
                value={depotLng}
                onChange={(e) => setDepotLng(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white font-mono focus:border-brand-red focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Cor Principal do Site */}
        <div>
          <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1.5">
            Cor Principal do Site (botões, seleções, realces)
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded border border-brand-mediumGray bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={primaryColor.toUpperCase()}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-28 rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white font-mono text-center focus:outline-none"
            />
          </div>
        </div>

        {/* SEÇÃO: INTEGRAÇÃO COM APP DESKTOP (ELECTRON / IMPRESSORAS) */}
        <div className="space-y-4 bg-brand-bg/70 p-5 rounded-2xl border-2 border-red-500/30 shadow-inner">
          <div className="border-b border-brand-mediumGray/40 pb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🖥️</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Integração Aplicativo Desktop (Electron / Impressão Térmica)
                </h3>
              </div>
              <p className="text-xxs text-brand-lightGray/80 mt-1 leading-relaxed">
                Utilize o <strong>Link da API</strong> e a <strong>Chave de Acesso</strong> abaixo para autenticar o programa Electron na rede local ou internet.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
              Ativo
            </span>
          </div>

          {/* 1. Link da API */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                Link da API do Servidor (Copiar para o Electron)
              </label>
              {localIps.length > 0 && (
                <span className="text-xxxs text-brand-lightGray/60 font-mono">
                  IP Wi-Fi: {localIps[0].address}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={selectedServerUrl}
                className="flex-1 rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  copiedLink
                    ? "bg-green-600 text-white"
                    : "bg-brand-mediumGray/70 hover:bg-brand-mediumGray text-white border border-brand-mediumGray"
                }`}
              >
                <span>{copiedLink ? "✓" : "📋"}</span>
                <span>{copiedLink ? "Copiado!" : "Copiar Link"}</span>
              </button>
            </div>

            {/* Alternativas de IP detectadas na máquina */}
            {localIps.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xxxs text-brand-lightGray">Opções de Link:</span>
                <button
                  type="button"
                  onClick={() => setSelectedServerUrl(typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")}
                  className="text-xxxs px-2 py-0.5 rounded bg-brand-darkGray border border-brand-mediumGray hover:border-gray-500 text-gray-300 font-mono"
                >
                  Origem Web
                </button>
                {localIps.map((ip) => (
                  <button
                    key={ip.address}
                    type="button"
                    onClick={() => setSelectedServerUrl(`http://${ip.address}:3000`)}
                    className="text-xxxs px-2 py-0.5 rounded bg-brand-darkGray border border-brand-mediumGray hover:border-red-400 text-amber-300 font-mono"
                    title={`Usar IP de rede ${ip.name}`}
                  >
                    Rede ({ip.address})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Chave de Acesso (API Key / Senha) */}
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between items-center">
              <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                Chave de Acesso / Senha da API (API Key)
              </label>
              <button
                type="button"
                onClick={handleGenerateApiKey}
                className="text-xxxs font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>🎲</span> Gerar Nova Chave
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? "text" : "password"}
                  required
                  value={desktopApiKey}
                  onChange={(e) => setDesktopApiKey(e.target.value)}
                  placeholder="alldelivery_internal_print_secret"
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg pl-3.5 pr-10 py-2.5 text-xs text-white font-mono focus:border-brand-red focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer p-1"
                  title={showApiKey ? "Ocultar Chave" : "Mostrar Chave"}
                >
                  {showApiKey ? "🙈" : "👁️"}
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyKey}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  copiedKey
                    ? "bg-green-600 text-white"
                    : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40"
                }`}
              >
                <span>{copiedKey ? "✓" : "📋"}</span>
                <span>{copiedKey ? "Copiada!" : "Copiar Chave"}</span>
              </button>
            </div>

            <span className="text-xxxs text-brand-lightGray/70 block pt-1 leading-relaxed">
              * Cole esta chave no aplicativo Electron ao entrar pela primeira vez ou nas configurações. Se gerar uma nova chave, clique em <strong>Salvar Configurações</strong> abaixo para ativá-la.
            </span>
          </div>
        </div>

        {/* Salvar */}
        <div className="pt-4 border-t border-brand-mediumGray/35">
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-red-900/30"
          >
            {saving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>

      </form>

      {/* Modal de Seleção de Sede no Mapa */}
      {isMapModalOpen && (
        <DepotLocationPickerModal
          initialLat={depotLat}
          initialLng={depotLng}
          onClose={() => setIsMapModalOpen(false)}
          onConfirm={(lat, lng) => {
            setDepotLat(lat);
            setDepotLng(lng);
            setIsMapModalOpen(false);
            setMessage({
              type: "success",
              text: `Localização da sede selecionada no mapa (${lat}, ${lng}). Lembre-se de clicar em "Salvar Configurações" para gravar.`,
            });
          }}
        />
      )}
    </div>
  );
}
