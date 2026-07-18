"use client";

import React, { useState, useEffect } from "react";

export default function ConfigPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [deliveryCities, setDeliveryCities] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#e31837");
  const [depotLat, setDepotLat] = useState("-8.05");
  const [depotLng, setDepotLng] = useState("-34.90");

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
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Configurações salvas com sucesso! Atualize a página do cliente para visualizar as novas cores." });
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
        <h2 className="font-serif text-2xl font-bold text-white mb-1">Configurações Gerais</h2>
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

      <form onSubmit={handleSave} className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-5 shadow-xl font-sans">
        
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
              Latitude da Sede (Depot)
            </label>
            <input
              type="text"
              required
              placeholder="Ex: -8.05"
              value={depotLat}
              onChange={(e) => setDepotLat(e.target.value)}
              className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
              Longitude da Sede (Depot)
            </label>
            <input
              type="text"
              required
              placeholder="Ex: -34.90"
              value={depotLng}
              onChange={(e) => setDepotLng(e.target.value)}
              className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none"
            />
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

        {/* Salvar */}
        <div className="pt-4 border-t border-brand-mediumGray/35">
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>

      </form>
    </div>
  );
}
