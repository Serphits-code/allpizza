"use client";

import React, { useState } from "react";

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryId: string;
  category: Category;
}

interface PizzaCategory {
  id: string;
  name: string;
  priceP: number;
  priceM: number;
  priceG: number;
  priceGG: number;
}

interface PizzaFlavor {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  pizzaCategoryId: string;
  category: PizzaCategory;
}

interface CrustType {
  id: string;
  name: string;
  pricePM: number;
  priceGGG: number;
  caracol: boolean;
}

interface CardapioManagerProps {
  initialCategories: Category[];
  initialProducts: Product[];
  initialPizzaCategories: PizzaCategory[];
  initialPizzaFlavors: PizzaFlavor[];
  initialCrusts: CrustType[];
}

export default function CardapioManager({
  initialCategories,
  initialProducts,
  initialPizzaCategories,
  initialPizzaFlavors,
  initialCrusts,
}: CardapioManagerProps) {
  const [activeTab, setActiveTab] = useState<string>("produtos"); // "produtos" | "sabores" | "precos-pizzas" | "bordas"

  // Catálogos e listagens locais do estado
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [pizzaFlavors, setPizzaFlavors] = useState<PizzaFlavor[]>(initialPizzaFlavors);
  const [crusts, setCrusts] = useState<CrustType[]>(initialCrusts);

  // Estados dos Formulários
  const [productForm, setProductForm] = useState({ id: "", name: "", description: "", price: "", imageUrl: "", categoryId: initialCategories[0]?.id || "" });
  const [flavorForm, setFlavorForm] = useState({ id: "", name: "", description: "", imageUrl: "", pizzaCategoryId: initialPizzaCategories[0]?.id || "" });
  const [crustForm, setCrustForm] = useState({ id: "", name: "", pricePM: "", priceGGG: "", caracol: false });

  // Controles de Upload de Arquivos
  const [uploading, setUploading] = useState(false);

  // Handler para Upload de Imagem
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "product" | "flavor") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.url) {
        if (type === "product") {
          setProductForm((prev) => ({ ...prev, imageUrl: data.url }));
        } else {
          setFlavorForm((prev) => ({ ...prev, imageUrl: data.url }));
        }
      } else {
        alert(data.error || "Erro ao fazer upload");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao fazer upload da imagem");
    } finally {
      setUploading(false);
    }
  };

  // CRUD Produto Comum
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!productForm.id;
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch("/api/admin/products", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productForm),
      });
      const saved = await res.json();

      if (saved.id) {
        if (isEdit) {
          setProducts((prev) => prev.map((p) => (p.id === saved.id ? { ...saved, category: initialCategories.find(c => c.id === saved.categoryId) } : p)));
        } else {
          setProducts((prev) => [...prev, { ...saved, category: initialCategories.find(c => c.id === saved.categoryId) }]);
        }
        // Reseta form
        setProductForm({ id: "", name: "", description: "", price: "", imageUrl: "", categoryId: initialCategories[0]?.id || "" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Deseja realmente deletar este produto?")) return;
    try {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // CRUD Sabores de Pizza
  const handleSaveFlavor = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!flavorForm.id;
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch("/api/admin/flavors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flavorForm),
      });
      const saved = await res.json();

      if (saved.id) {
        if (isEdit) {
          setPizzaFlavors((prev) => prev.map((f) => (f.id === saved.id ? { ...saved, category: initialPizzaCategories.find(c => c.id === saved.pizzaCategoryId) } : f)));
        } else {
          setPizzaFlavors((prev) => [...prev, { ...saved, category: initialPizzaCategories.find(c => c.id === saved.pizzaCategoryId) }]);
        }
        // Reseta form
        setFlavorForm({ id: "", name: "", description: "", imageUrl: "", pizzaCategoryId: initialPizzaCategories[0]?.id || "" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFlavor = async (id: string) => {
    if (!confirm("Deseja realmente deletar este sabor de pizza?")) return;
    try {
      const res = await fetch(`/api/admin/flavors?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPizzaFlavors((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // CRUD Bordas
  const handleSaveCrust = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!crustForm.id;
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch("/api/admin/crusts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(crustForm),
      });
      const saved = await res.json();

      if (saved.id) {
        if (isEdit) {
          setCrusts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        } else {
          setCrusts((prev) => [...prev, saved]);
        }
        setCrustForm({ id: "", name: "", pricePM: "", priceGGG: "", caracol: false });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCrust = async (id: string) => {
    if (!confirm("Deseja realmente deletar esta borda recheada?")) return;
    try {
      const res = await fetch(`/api/admin/crusts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setCrusts((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Abas */}
      <div className="flex space-x-3 border-b border-brand-mediumGray pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: "produtos", name: "Bebidas e Outros" },
          { id: "sabores", name: "Sabores de Pizza" },
          { id: "bordas", name: "Bordas Recheadas" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === tab.id
                ? "bg-brand-red text-white"
                : "bg-brand-darkGray text-brand-lightGray hover:text-white"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab: Produtos */}
      {activeTab === "produtos" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">
              {productForm.id ? "Editar Produto" : "Novo Produto"}
            </h3>
            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Descrição</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Preço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={productForm.price}
                  onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Categoria</label>
                <select
                  value={productForm.categoryId}
                  onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                >
                  {initialCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Imagem do Produto</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, "product")}
                  className="w-full block text-xxs text-brand-lightGray/80"
                />
                {uploading && <span className="text-xxs text-brand-red animate-pulse mt-1 block">Carregando imagem...</span>}
                {productForm.imageUrl && (
                  <span className="text-xxs text-green-400 block mt-1 truncate">Salvo: {productForm.imageUrl}</span>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer"
              >
                Salvar Produto
              </button>
            </form>
          </div>

          {/* Listagem */}
          <div className="lg:col-span-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">Produtos Cadastrados</h3>
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {products.map((p) => (
                <div key={p.id} className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-3 text-xs">
                  <div>
                    <span className="font-bold text-white block">{p.name}</span>
                    <span className="text-xxs text-brand-lightGray block italic">{p.category?.name} — R$ {p.price.toFixed(2)}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setProductForm({ id: p.id, name: p.name, description: p.description, price: p.price.toString(), imageUrl: p.imageUrl, categoryId: p.categoryId })}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:text-brand-red transition-colors text-xxs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(p.id)}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-red hover:bg-brand-red text-white transition-colors text-xxs cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Sabores de Pizza */}
      {activeTab === "sabores" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">
              {flavorForm.id ? "Editar Sabor" : "Novo Sabor de Pizza"}
            </h3>
            <form onSubmit={handleSaveFlavor} className="space-y-4 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Nome do Sabor</label>
                <input
                  type="text"
                  required
                  value={flavorForm.name}
                  onChange={(e) => setFlavorForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Ingredientes / Descrição</label>
                <textarea
                  required
                  value={flavorForm.description}
                  onChange={(e) => setFlavorForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Categoria de Preço</label>
                <select
                  value={flavorForm.pizzaCategoryId}
                  onChange={(e) => setFlavorForm((f) => ({ ...f, pizzaCategoryId: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                >
                  {initialPizzaCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Imagem do Sabor</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, "flavor")}
                  className="w-full block text-xxs text-brand-lightGray/80"
                />
                {uploading && <span className="text-xxs text-brand-red animate-pulse mt-1 block">Carregando imagem...</span>}
                {flavorForm.imageUrl && (
                  <span className="text-xxs text-green-400 block mt-1 truncate">Salvo: {flavorForm.imageUrl}</span>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer"
              >
                Salvar Sabor
              </button>
            </form>
          </div>

          {/* Listagem */}
          <div className="lg:col-span-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">Sabores Cadastrados</h3>
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {pizzaFlavors.map((f) => (
                <div key={f.id} className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-3 text-xs">
                  <div>
                    <span className="font-bold text-white block">{f.name}</span>
                    <span className="text-xxs text-brand-lightGray block italic">{f.category?.name} — {f.description}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setFlavorForm({ id: f.id, name: f.name, description: f.description, imageUrl: f.imageUrl, pizzaCategoryId: f.pizzaCategoryId })}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:text-brand-red transition-colors text-xxs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteFlavor(f.id)}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-red hover:bg-brand-red text-white transition-colors text-xxs cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Bordas Recheadas */}
      {activeTab === "bordas" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form */}
          <div className="lg:col-span-4 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">
              {crustForm.id ? "Editar Borda" : "Nova Borda Recheada"}
            </h3>
            <form onSubmit={handleSaveCrust} className="space-y-4 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={crustForm.name}
                  onChange={(e) => setCrustForm((c) => ({ ...c, name: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Preço Pequena / Média (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={crustForm.pricePM}
                  onChange={(e) => setCrustForm((c) => ({ ...c, pricePM: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">Preço Grande / GG (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={crustForm.priceGGG}
                  onChange={(e) => setCrustForm((c) => ({ ...c, priceGGG: e.target.value }))}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={crustForm.caracol}
                  onChange={(e) => setCrustForm((c) => ({ ...c, caracol: e.target.checked }))}
                  className="rounded bg-brand-bg border-brand-mediumGray text-brand-red focus:ring-brand-red w-4 h-4"
                />
                <label className="text-xxs font-semibold uppercase text-brand-lightGray">Suporta Adicional Caracol?</label>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-brand-red hover:bg-brand-redHover font-bold text-white transition-colors cursor-pointer"
              >
                Salvar Borda
              </button>
            </form>
          </div>

          {/* Listagem */}
          <div className="lg:col-span-8 rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6">
            <h3 className="font-serif text-base font-bold text-white mb-4">Bordas Cadastradas</h3>
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {crusts.map((c) => (
                <div key={c.id} className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-3 text-xs">
                  <div>
                    <span className="font-bold text-white block">{c.name} {c.caracol && <span className="text-xxs text-brand-red">(Suporta Caracol)</span>}</span>
                    <span className="text-xxs text-brand-lightGray block font-mono">P/M: R$ {c.pricePM.toFixed(2)} | G/GG: R$ {c.priceGGG.toFixed(2)}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCrustForm({ id: c.id, name: c.name, pricePM: c.pricePM.toString(), priceGGG: c.priceGGG.toString(), caracol: c.caracol })}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:text-brand-red transition-colors text-xxs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteCrust(c.id)}
                      className="px-3 py-1 rounded bg-brand-bg border border-brand-red hover:bg-brand-red text-white transition-colors text-xxs cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
