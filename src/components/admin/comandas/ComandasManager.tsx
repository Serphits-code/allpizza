"use client";

import React, { useState, useEffect, useMemo } from "react";
import QuickOrderPanel from "@/components/quick-order/QuickOrderPanel";

interface ComandaItem {
  id: string;
  number: number;
  status: "LIVRE" | "OCUPADA" | "INATIVA";
  responsibleName?: string | null;
  active: boolean;
  activeOrdersCount: number;
  currentConsumption: number;
}

interface OrderDetail {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  createdAt: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    basePrice: number;
    totalPrice: number;
    isPizza: boolean;
    pizzaSize?: string | null;
    crustType?: string | null;
    crustPrice: number;
    flavors: { id: string; flavorName: string; categoryName: string }[];
    toppings: { id: string; toppingName: string; price: number }[];
  }[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryId: string;
}

interface PizzaCategory {
  id: string;
  name: string;
  priceP: number;
  priceM: number;
  priceG: number;
  priceGG: number;
  flavors: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
  }[];
}

interface Crust {
  id: string;
  name: string;
  pricePM: number;
  priceGGG: number;
}

interface CartItem {
  tempId: string;
  name: string;
  quantity: number;
  basePrice: number;
  totalPrice: number;
  isPizza: boolean;
  pizzaSize?: string;
  crustType?: string;
  crustPrice?: number;
  flavors?: { flavorName: string; categoryName: string }[];
  toppings?: { toppingName: string; price: number }[];
  notes?: string;
}

interface ComandaPayment {
  id: string;
  method: "PIX" | "DINHEIRO" | "DEBITO" | "CREDITO";
  amount: number;
  changeFor?: number;
  change?: number;
  createdAt: string;
}

export default function ComandasManager({ isAdminView = true }: { isAdminView?: boolean }) {
  // Etapas de Navegação: "grid" | "detail" | "catalog" | "cart"
  const [step, setStep] = useState<"grid" | "detail" | "catalog" | "cart">("grid");

  // Dados das Comandas
  const [comandas, setComandas] = useState<ComandaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTable, setSearchTable] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Comanda Selecionada
  const [selectedComandaId, setSelectedComandaId] = useState<string | null>(null);
  const [selectedComanda, setSelectedComanda] = useState<ComandaItem | null>(null);
  const [comandaOrders, setComandaOrders] = useState<OrderDetail[]>([]);
  const [comandaResponsible, setComandaResponsible] = useState("");
  const [savingResponsible, setSavingResponsible] = useState(false);
  const [quickOrderComanda, setQuickOrderComanda] = useState<ComandaItem | null>(null);

  // Múltiplas Baixas / Pagamentos na Conta
  const [payments, setPayments] = useState<ComandaPayment[]>([]);
  const [totalPaid, setTotalPaid] = useState<number>(0);
  const [remainingBalance, setRemainingBalance] = useState<number>(0);
  const [isFullyPaid, setIsFullyPaid] = useState<boolean>(false);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);

  // Formulário de Baixa
  const [payMethod, setPayMethod] = useState<"PIX" | "DINHEIRO" | "DEBITO" | "CREDITO">("PIX");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payChangeFor, setPayChangeFor] = useState<string>("");
  const [registeringPayment, setRegisteringPayment] = useState<boolean>(false);

  // Modal de Transferência da Mesa Inteira
  const [isTransferTableModalOpen, setIsTransferTableModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [transferringTable, setTransferringTable] = useState(false);

  // Catálogo de Produtos e Pizzas para Lançamento
  const [pizzaCategories, setPizzaCategories] = useState<PizzaCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [crusts, setCrusts] = useState<Crust[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogTab, setCatalogTab] = useState<string>("pizzas");

  // Modal de Personalização de Pizza
  const [isPizzaModalOpen, setIsPizzaModalOpen] = useState(false);
  const [selectedPizzaSize, setSelectedPizzaSize] = useState<"P" | "M" | "G" | "GG">("G");
  const [selectedFlavors, setSelectedFlavors] = useState<any[]>([]);
  const [selectedCrust, setSelectedCrust] = useState<Crust | null>(null);
  const [pizzaNotes, setPizzaNotes] = useState("");

  // Carrinho de Rascunho da Mesa
  const [draftCart, setDraftCart] = useState<CartItem[]>([]);
  const [sendingOrder, setSendingOrder] = useState(false);

  // Modais de Gestão Admin
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchStart, setBatchStart] = useState("1");
  const [batchQty, setBatchQty] = useState("10");

  // Modal de Migração de Item
  const [migrateItemId, setMigrateItemId] = useState<string | null>(null);
  const [migrateTargetId, setMigrateTargetId] = useState<string>("");

  // Modal de Fechamento de Conta
  const [closeModalData, setCloseModalData] = useState<any | null>(null);

  // 1. Carrega lista de comandas
  const loadComandas = async () => {
    try {
      const res = await fetch("/api/admin/comandas");
      if (!res.ok) throw new Error("Erro ao carregar comandas");
      const data = await res.json();
      setComandas(data.comandas || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComandas();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadComandas();
    }, 8000);

    const onFocus = () => {
      loadComandas();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // 2. Carrega catálogo quando necessário
  const loadCatalog = async () => {
    if (catalogLoaded) return;
    try {
      const [catRes, prodRes, crustRes] = await Promise.all([
        fetch("/api/admin/pizzas"),
        fetch("/api/admin/products"),
        fetch("/api/admin/crusts"),
      ]);

      if (catRes.ok) {
        const catJson = await catRes.json();
        setPizzaCategories(catJson.categories || []);
      }
      if (prodRes.ok) {
        const prodJson = await prodRes.json();
        setProducts(prodJson.products || []);
      }
      if (crustRes.ok) {
        const crustJson = await crustRes.json();
        setCrusts(crustJson.crusts || []);
      }
      setCatalogLoaded(true);
    } catch (err) {
      console.error("Error loading catalog:", err);
    }
  };

  // 3. Carrega pagamentos / baixas da comanda
  const loadComandaPayments = async (comandaId: string) => {
    setLoadingPayments(true);
    try {
      const res = await fetch(`/api/admin/comandas/${comandaId}/payments`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPayments(data.payments || []);
          setTotalPaid(data.totalPaid || 0);
          setRemainingBalance(data.remainingBalance || 0);
          setIsFullyPaid(!!data.isFullyPaid);
          if (data.remainingBalance > 0) {
            setPayAmount(data.remainingBalance.toFixed(2));
          } else {
            setPayAmount("");
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar pagamentos da comanda:", err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // 4. Abre detalhes de uma comanda
  const handleOpenComanda = async (comanda: ComandaItem) => {
    setSelectedComandaId(comanda.id);
    setSelectedComanda(comanda);
    setComandaResponsible(comanda.responsibleName || "");
    setDraftCart([]);
    setStep("detail");
    setPayChangeFor("");

    try {
      const [resOrders, resPayments] = await Promise.all([
        fetch(`/api/admin/comandas/${comanda.id}`),
        fetch(`/api/admin/comandas/${comanda.id}/payments`),
      ]);

      if (resOrders.ok) {
        const data = await resOrders.json();
        setComandaOrders(data.comanda?.orders || []);
      }

      if (resPayments.ok) {
        const payData = await resPayments.json();
        if (payData.success) {
          setPayments(payData.payments || []);
          setTotalPaid(payData.totalPaid || 0);
          setRemainingBalance(payData.remainingBalance || 0);
          setIsFullyPaid(!!payData.isFullyPaid);
          if (payData.remainingBalance > 0) {
            setPayAmount(payData.remainingBalance.toFixed(2));
          } else {
            setPayAmount("");
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes da comanda:", err);
    }
  };

  // 5. Salva responsável da mesa onBlur
  const handleSaveResponsible = async () => {
    if (!selectedComandaId) return;
    setSavingResponsible(true);
    try {
      await fetch(`/api/admin/comandas/${selectedComandaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsibleName: comandaResponsible }),
      });
      loadComandas();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingResponsible(false);
    }
  };

  // 6. Gera comandas em lote
  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/comandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startNumber: parseInt(batchStart, 10),
          quantity: parseInt(batchQty, 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsBatchModalOpen(false);
        loadComandas();
      } else {
        alert(data.error || "Erro ao gerar comandas");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar ao servidor");
    }
  };

  // 7. Registra Baixa / Pagamento na Conta
  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComandaId) return;

    const amt = parseFloat(payAmount.replace(",", "."));
    if (isNaN(amt) || amt <= 0) {
      alert("Informe um valor válido maior que zero para a baixa.");
      return;
    }

    let chgFor: number | undefined = undefined;
    if (payMethod === "DINHEIRO") {
      if (payChangeFor) {
        chgFor = parseFloat(payChangeFor.replace(",", "."));
        if (isNaN(chgFor) || chgFor < amt) {
          alert(`O valor entregue em dinheiro (R$ ${chgFor?.toFixed(2) || "0,00"}) não pode ser menor que o valor a abater (R$ ${amt.toFixed(2)}).`);
          return;
        }
      }
    }

    setRegisteringPayment(true);
    try {
      const res = await fetch(`/api/admin/comandas/${selectedComandaId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: payMethod,
          amount: amt,
          changeFor: chgFor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPayChangeFor("");
        await loadComandaPayments(selectedComandaId);
        await loadComandas();
      } else {
        alert(data.error || "Erro ao registrar baixa na conta.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao registrar pagamento.");
    } finally {
      setRegisteringPayment(false);
    }
  };

  // 8. Estorna Pagamento
  const handleDeletePayment = async (paymentId: string) => {
    if (!selectedComandaId) return;
    if (!confirm("Deseja realmente estornar esta baixa de pagamento?")) return;

    try {
      const res = await fetch(`/api/admin/comandas/${selectedComandaId}/payments?paymentId=${paymentId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await loadComandaPayments(selectedComandaId);
      } else {
        alert(data.error || "Erro ao estornar pagamento.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao estornar pagamento.");
    }
  };

  // 9. Imprime Pré-Conta / Conferência de Mesa
  const handlePrintConferenceReceipt = () => {
    if (!selectedComanda) return;
    const printWindow = window.open("", "_blank", "width=380,height=620");
    if (!printWindow) {
      alert("Por favor, permita popups neste navegador para imprimir a conferência da mesa.");
      return;
    }

    const itemsHtml = comandaOrders
      .flatMap((ord) => ord.items)
      .map(
        (it) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
          <span style="max-width:210px; line-height: 1.2;">
            <strong>${it.quantity}x</strong> ${it.name}
            ${it.flavors?.length ? `<br><small style="color:#555;">Sabores: ${it.flavors.map((f) => f.flavorName).join(" / ")}</small>` : ""}
            ${it.crustType ? `<br><small style="color:#555;">Borda: ${it.crustType}</small>` : ""}
          </span>
          <span style="font-weight:bold; font-family: monospace;">R$ ${it.totalPrice.toFixed(2)}</span>
        </div>`
      )
      .join("");

    const paymentsHtml = payments.length
      ? payments
          .map(
            (p) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:11px; color:#222;">
          <span>• ${p.method}${p.change && p.change > 0 ? ` (Entregue R$ ${p.changeFor?.toFixed(2)} | Troco R$ ${p.change.toFixed(2)})` : ""}</span>
          <span style="font-weight:bold; color:#15803d; font-family: monospace;">- R$ ${p.amount.toFixed(2)}</span>
        </div>`
          )
          .join("")
      : `<div style="font-size:11px; color:#777; font-style:italic;">Nenhum pagamento registrado ainda.</div>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Pré-Conta Mesa #${selectedComanda.number}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace, sans-serif; margin: 0; padding: 14px; color: #000; font-size: 12px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #444; margin: 8px 0; }
          .flex { display: flex; justify-content: space-between; }
          @media print {
            body { padding: 0; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 16px;">🍕 ALLDELIVERY</div>
        <div class="center bold" style="font-size: 12px; margin-top: 2px;">CONFERÊNCIA DE MESA / PRÉ-CONTA</div>
        <div class="divider"></div>
        <div class="flex" style="font-size: 13px;">
          <span class="bold">Mesa #${String(selectedComanda.number).padStart(2, "0")}</span>
          <span>${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - ${new Date().toLocaleDateString("pt-BR")}</span>
        </div>
        <div style="font-size: 12px; margin-top: 3px;">
          Titular: <strong>${comandaResponsible || "Não identificado"}</strong>
        </div>
        <div class="divider"></div>
        <div class="bold" style="font-size: 11px; margin-bottom: 6px;">ITENS DO CONSUMO:</div>
        ${itemsHtml || '<div style="font-size:11px; color:#666;">Nenhum item consumido.</div>'}
        <div class="divider"></div>
        <div class="flex bold" style="font-size: 14px;">
          <span>TOTAL DO CONSUMO:</span>
          <span>R$ ${totalComandaConsumption.toFixed(2)}</span>
        </div>
        <div class="divider"></div>
        <div class="bold" style="font-size: 11px; margin-bottom: 4px;">BAIXAS / PAGAMENTOS:</div>
        ${paymentsHtml}
        <div class="divider"></div>
        <div class="flex bold" style="font-size: 12px; color: #15803d;">
          <span>TOTAL PAGO:</span>
          <span>R$ ${totalPaid.toFixed(2)}</span>
        </div>
        <div class="flex bold" style="font-size: 15px; margin-top: 4px; ${remainingBalance <= 0 ? "color: #15803d;" : "color: #b91c1c;"}">
          <span>SALDO A PAGAR:</span>
          <span>R$ ${Math.max(0, remainingBalance).toFixed(2)}</span>
        </div>
        <div class="divider"></div>
        <div class="center" style="font-size: 10px; margin-top: 10px; color: #555;">
          * CONFERÊNCIA DE MESA - NÃO É DOCUMENTO FISCAL *<br>
          Agradecemos a preferência!
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // 10. Libera Comanda para Novo Consumo
  const handleReleaseComanda = async () => {
    if (!selectedComandaId || !selectedComanda) return;

    if (remainingBalance > 0.05) {
      const confirmWithDebt = confirm(
        `⚠️ ATENÇÃO: A Mesa #${selectedComanda.number} ainda possui um saldo em aberto de R$ ${remainingBalance.toFixed(2)}!\n\nDeseja realmente liberar a mesa mesmo restando valor a pagar?`
      );
      if (!confirmWithDebt) return;
    } else {
      if (!confirm(`Deseja realmente liberar a Mesa #${selectedComanda.number}? Todos os subpedidos e baixas serão finalizados para permitir um novo consumo.`)) {
        return;
      }
    }

    try {
      const res = await fetch(`/api/admin/comandas/${selectedComandaId}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setStep("grid");
        setSelectedComandaId(null);
        setSelectedComanda(null);
        loadComandas();
      } else {
        alert(data.error || "Erro ao liberar mesa");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao liberar mesa");
    }
  };

  // 11. Consulta Fechamento de Conta
  const handleCloseConference = async () => {
    if (!selectedComandaId) return;
    try {
      const res = await fetch(`/api/admin/comandas/${selectedComandaId}/close`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setCloseModalData(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 12. Exclui Item de Pedido
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Deseja realmente excluir este item lançado?")) return;
    try {
      const res = await fetch("/api/admin/comandas/delete-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (data.success && selectedComanda) {
        handleOpenComanda(selectedComanda);
        loadComandas();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 13. Migra Item Individual para outra Comanda
  const handleMigrateItem = async () => {
    if (!migrateItemId || !migrateTargetId) return;
    try {
      const res = await fetch("/api/admin/comandas/migrate-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: migrateItemId,
          targetComandaId: migrateTargetId,
        }),
      });
      const data = await res.json();
      if (data.success && selectedComanda) {
        setMigrateItemId(null);
        setMigrateTargetId("");
        handleOpenComanda(selectedComanda);
        loadComandas();
      } else {
        alert(data.error || "Erro ao migrar item");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao migrar item");
    }
  };

  // 14. Transfere Mesa Inteira (Todos os pedidos e histórico de pagamentos)
  const handleTransferTable = async () => {
    if (!selectedComandaId || !transferTargetId) return;
    const targetComanda = comandas.find((c) => c.id === transferTargetId);
    if (!confirm(`Deseja transferir TODOS os pedidos e pagamentos da Mesa #${selectedComanda?.number} para a Mesa #${targetComanda?.number || transferTargetId}?`)) {
      return;
    }

    setTransferringTable(true);
    try {
      const res = await fetch("/api/admin/comandas/migrate-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceComandaId: selectedComandaId,
          targetComandaId: transferTargetId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsTransferTableModalOpen(false);
        setTransferTargetId("");
        setStep("grid");
        setSelectedComandaId(null);
        setSelectedComanda(null);
        await loadComandas();
        alert(data.message || "Mesa transferida com sucesso!");
      } else {
        alert(data.error || "Erro ao transferir mesa.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao transferir mesa.");
    } finally {
      setTransferringTable(false);
    }
  };

  // 10. Adiciona Produto Simples (Bebidas) ao Carrinho de Rascunho
  const handleAddSimpleProduct = (product: Product) => {
    setDraftCart((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(),
        name: product.name,
        quantity: 1,
        basePrice: product.price,
        totalPrice: product.price,
        isPizza: false,
      },
    ]);
  };

  // 11. Abre Personalização de Pizza
  const handleOpenPizzaCustomizer = () => {
    setSelectedPizzaSize("G");
    setSelectedFlavors([]);
    setSelectedCrust(null);
    setPizzaNotes("");
    setIsPizzaModalOpen(true);
  };

  // Máximo de Sabores por Tamanho
  const maxFlavorsForSize = {
    P: 1,
    M: 2,
    G: 3,
    GG: 4,
  }[selectedPizzaSize];

  // Alterna seleção de sabor
  const handleToggleFlavor = (flavor: any, category: PizzaCategory) => {
    const isSelected = selectedFlavors.some((f) => f.id === flavor.id);
    if (isSelected) {
      setSelectedFlavors((prev) => prev.filter((f) => f.id !== flavor.id));
    } else {
      if (selectedFlavors.length >= maxFlavorsForSize) {
        alert(`O tamanho ${selectedPizzaSize} permite no máximo ${maxFlavorsForSize} sabores.`);
        return;
      }
      setSelectedFlavors((prev) => [
        ...prev,
        {
          id: flavor.id,
          name: flavor.name,
          categoryName: category.name,
          priceP: category.priceP,
          priceM: category.priceM,
          priceG: category.priceG,
          priceGG: category.priceGG,
        },
      ]);
    }
  };

  // Calcula Preço da Pizza Configurada (Maior Preço dos Sabores + Borda)
  const configuredPizzaPrice = useMemo(() => {
    if (selectedFlavors.length === 0) return 0;
    const priceKey = `price${selectedPizzaSize}` as "priceP" | "priceM" | "priceG" | "priceGG";
    const maxBasePrice = Math.max(...selectedFlavors.map((f) => f[priceKey] || 0));
    const crustPrice = selectedCrust
      ? selectedPizzaSize === "P" || selectedPizzaSize === "M"
        ? selectedCrust.pricePM
        : selectedCrust.priceGGG
      : 0;
    return maxBasePrice + crustPrice;
  }, [selectedPizzaSize, selectedFlavors, selectedCrust]);

  // Salva Pizza Configurada no Carrinho
  const handleAddConfiguredPizza = () => {
    if (selectedFlavors.length === 0) {
      alert("Selecione ao menos um sabor de pizza.");
      return;
    }

    const priceKey = `price${selectedPizzaSize}` as "priceP" | "priceM" | "priceG" | "priceGG";
    const basePrice = Math.max(...selectedFlavors.map((f) => f[priceKey] || 0));
    const crustPrice = selectedCrust
      ? selectedPizzaSize === "P" || selectedPizzaSize === "M"
        ? selectedCrust.pricePM
        : selectedCrust.priceGGG
      : 0;

    const flavorNames = selectedFlavors.map((f) => f.name).join(" / ");
    const pizzaName = `Pizza ${selectedPizzaSize} (${flavorNames})`;

    setDraftCart((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(),
        name: pizzaName,
        quantity: 1,
        basePrice,
        totalPrice: basePrice + crustPrice,
        isPizza: true,
        pizzaSize: selectedPizzaSize,
        crustType: selectedCrust?.name,
        crustPrice,
        flavors: selectedFlavors.map((f) => ({ flavorName: f.name, categoryName: f.categoryName })),
        notes: pizzaNotes,
      },
    ]);

    setIsPizzaModalOpen(false);
  };

  // 12. Envia Carrinho para a Cozinha
  const handleSendOrderToKitchen = async () => {
    if (!selectedComandaId || draftCart.length === 0) return;
    setSendingOrder(true);

    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COMANDA",
          comandaId: selectedComandaId,
          customerName: comandaResponsible || `Mesa #${selectedComanda?.number}`,
          items: draftCart,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setDraftCart([]);
        if (selectedComanda) {
          handleOpenComanda(selectedComanda);
        }
        loadComandas();
      } else {
        alert(data.error || "Erro ao enviar pedido para a cozinha");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar pedido");
    } finally {
      setSendingOrder(false);
    }
  };

  // Filtro de Comandas no Grid
  const filteredComandas = useMemo(() => {
    return comandas.filter((c) => {
      if (!isAdminView && !c.active) return false;
      const matchesSearch =
        c.number.toString().includes(searchTable) ||
        (c.responsibleName || "").toLowerCase().includes(searchTable.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [comandas, searchTable, statusFilter, isAdminView]);

  const totalComandaConsumption = useMemo(() => {
    return comandaOrders.reduce((sum, o) => sum + o.total, 0);
  }, [comandaOrders]);

  const totalDraftCart = useMemo(() => {
    return draftCart.reduce((sum, item) => sum + item.totalPrice * item.quantity, 0);
  }, [draftCart]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-12">
      {/* ------------------------------------------------------------- */}
      {/* ETAPA 1: GRADE DE COMANDAS & MESAS                            */}
      {/* ------------------------------------------------------------- */}
      {step === "grid" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
            <div>
              <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-brand-red">🍽️</span> Comandas & Salão de Mesas
              </h2>
              <p className="text-xs text-brand-lightGray mt-1">
                Acompanhe o consumo em tempo real, lance pedidos para a cozinha e libere mesas.
              </p>
            </div>

            {isAdminView && (
              <button
                onClick={() => setIsBatchModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-xs text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-brand-red/20"
              >
                <span>＋</span> Gerar Comandas em Lote
              </button>
            )}
          </div>

          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-4 rounded-xl">
            <input
              type="text"
              placeholder="Buscar mesa por número ou responsável..."
              value={searchTable}
              onChange={(e) => setSearchTable(e.target.value)}
              className="rounded-lg border border-brand-mediumGray bg-brand-bg px-3.5 py-2 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none w-full sm:max-w-xs"
            />

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: "ALL", label: "Todas" },
                { key: "LIVRE", label: "🟢 Livres" },
                { key: "OCUPADA", label: "🔴 Ocupadas" },
                { key: "INATIVA", label: "⚪ Inativas" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === tab.key
                      ? "bg-brand-red text-white"
                      : "bg-brand-bg text-brand-lightGray hover:text-white border border-brand-mediumGray"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grade de Cards de Mesas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredComandas.map((c) => {
              const isOccupied = c.status === "OCUPADA";
              const isInactive = c.status === "INATIVA";

              return (
                <div
                  key={c.id}
                  onClick={() => handleOpenComanda(c)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between text-center space-y-3 group hover:scale-[1.02] shadow-lg ${
                    isOccupied
                      ? "bg-brand-red/10 border-brand-red/60 hover:border-brand-red"
                      : isInactive
                      ? "bg-brand-bg/40 border-brand-mediumGray/30 opacity-60 hover:opacity-100"
                      : "bg-brand-darkGray border-brand-mediumGray/60 hover:border-emerald-500/60"
                  }`}
                >
                  <div>
                    <span className="text-xxs uppercase tracking-wider font-semibold block text-brand-lightGray">
                      Mesa
                    </span>
                    <span
                      className={`text-3xl font-serif font-black block mt-0.5 ${
                        isOccupied ? "text-brand-red" : isInactive ? "text-brand-lightGray" : "text-emerald-400"
                      }`}
                    >
                      #{String(c.number).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {c.responsibleName ? (
                      <span className="text-xxs font-bold text-white block truncate">
                        👤 {c.responsibleName}
                      </span>
                    ) : (
                      <span className="text-xxxs text-brand-lightGray/60 block">Sem responsável</span>
                    )}

                    {isOccupied && (
                      <span className="text-xs font-mono font-bold text-amber-400 block">
                        R$ {c.currentConsumption.toFixed(2)}
                      </span>
                    )}

                    <span
                      className={`inline-block text-xxxs font-bold uppercase px-2 py-0.5 rounded-full border ${
                        isOccupied
                          ? "bg-brand-red/20 text-brand-red border-brand-red/30"
                          : isInactive
                          ? "bg-gray-500/10 text-gray-400 border-gray-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  {/* Atalho de Lançamento Rápido (Quick Order) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickOrderComanda(c);
                    }}
                    className="w-full py-1.5 rounded-xl bg-brand-red/15 hover:bg-brand-red text-brand-red hover:text-white border border-brand-red/30 font-bold text-xxs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1 mt-1"
                  >
                    <span>＋</span> Lançar Pedido
                  </button>
                </div>
              );
            })}

            {filteredComandas.length === 0 && !loading && (
              <div className="col-span-full py-16 text-center text-xs text-brand-lightGray/50">
                Nenhuma comanda encontrada.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ETAPA 2: DETALHES DA COMANDA SELECIONADA                      */}
      {/* ------------------------------------------------------------- */}
      {step === "detail" && selectedComanda && (
        <div className="space-y-6">
          {/* Breadcrumb & Ações Rápidas */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-brand-darkGray border border-brand-mediumGray p-5 rounded-2xl shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setStep("grid");
                  setSelectedComandaId(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white text-brand-lightGray text-xs font-bold transition-colors cursor-pointer"
              >
                ◀ Voltar às Mesas
              </button>
              <div>
                <h3 className="font-serif text-xl font-bold text-white flex items-center gap-2">
                  <span>Mesa #{String(selectedComanda.number).padStart(2, "0")}</span>
                  <span
                    className={`text-xxxs font-bold uppercase px-2 py-0.5 rounded-full border ${
                      selectedComanda.status === "OCUPADA"
                        ? "bg-brand-red/20 text-brand-red border-brand-red/30"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}
                  >
                    {selectedComanda.status}
                  </span>
                </h3>
                <span className="text-xxs text-brand-lightGray">
                  Gerencie itens, lance pedidos na cozinha, controle múltiplas baixas e libere a mesa.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setQuickOrderComanda(selectedComanda)}
                className="px-3.5 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-brand-red/20 flex items-center gap-1.5"
              >
                <span>＋</span> Lançar Pedido (Cozinha)
              </button>
              <button
                onClick={handlePrintConferenceReceipt}
                className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-mediumGray hover:border-amber-400 text-amber-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>🖨️</span> Imprimir Conferência
              </button>
              <button
                onClick={() => {
                  setTransferTargetId("");
                  setIsTransferTableModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-mediumGray hover:border-purple-400 text-purple-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>🔄</span> Transferir Mesa
              </button>
              <button
                onClick={handleReleaseComanda}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-lg ${
                  remainingBalance <= 0 && totalComandaConsumption > 0
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 animate-pulse"
                    : "bg-brand-bg border border-brand-mediumGray hover:border-emerald-400 text-emerald-400"
                }`}
              >
                <span>🏁</span> Liberar Mesa
              </button>
            </div>
          </div>

          {/* Cards de Resumo e Responsável */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Responsável da Mesa */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 shadow-xl space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xxs font-semibold uppercase text-brand-lightGray">
                  👤 Titular / Responsável
                </label>
                {savingResponsible && (
                  <span className="text-xxxs text-amber-400 font-mono animate-pulse">
                    Salvando...
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="Ex: Família Silva"
                value={comandaResponsible}
                onChange={(e) => setComandaResponsible(e.target.value)}
                onBlur={handleSaveResponsible}
                className="w-full rounded-xl border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white focus:border-brand-red focus:outline-none"
              />
              <span className="text-xxxs text-brand-lightGray/60 block truncate">
                Salvo automaticamente ao sair do campo.
              </span>
            </div>

            {/* Consumo Total */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 shadow-xl flex flex-col justify-between">
              <span className="text-xxs font-semibold uppercase text-brand-lightGray">
                🧾 Consumo Total
              </span>
              <span className="text-2xl font-serif font-bold text-amber-400 font-mono my-1">
                R$ {totalComandaConsumption.toFixed(2)}
              </span>
              <span className="text-xxxs text-brand-lightGray">
                {comandaOrders.length} subpedidos enviados
              </span>
            </div>

            {/* Total Pago em Baixas */}
            <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-4 shadow-xl flex flex-col justify-between">
              <span className="text-xxs font-semibold uppercase text-brand-lightGray">
                💰 Total Pago (Baixas)
              </span>
              <span className="text-2xl font-serif font-bold text-emerald-400 font-mono my-1">
                R$ {totalPaid.toFixed(2)}
              </span>
              <span className="text-xxxs text-brand-lightGray">
                {payments.length} baixa(s) efetuada(s)
              </span>
            </div>

            {/* Saldo Restante */}
            <div
              className={`rounded-2xl border p-4 shadow-xl flex flex-col justify-between ${
                remainingBalance <= 0 && totalComandaConsumption > 0
                  ? "bg-emerald-950/20 border-emerald-500/50"
                  : remainingBalance > 0
                  ? "bg-brand-red/10 border-brand-red/40"
                  : "bg-brand-darkGray border-brand-mediumGray"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xxs font-semibold uppercase text-brand-lightGray">
                  Saldo Restante
                </span>
                {remainingBalance <= 0 && totalComandaConsumption > 0 && (
                  <span className="text-xxxs bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    QUITADO
                  </span>
                )}
              </div>
              <span
                className={`text-2xl font-serif font-bold font-mono my-1 ${
                  remainingBalance <= 0 ? "text-emerald-400" : "text-brand-red"
                }`}
              >
                R$ {Math.max(0, remainingBalance).toFixed(2)}
              </span>
              <span className="text-xxxs text-brand-lightGray">
                {remainingBalance <= 0
                  ? "Mesa 100% quitada para liberação"
                  : "Dê baixa nos pagamentos abaixo"}
              </span>
            </div>
          </div>

          {/* PAINEL DE MÚLTIPLAS BAIXAS NA CONTA */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-mediumGray/40 pb-3">
              <div>
                <h4 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <span>💳</span> Múltiplas Baixas na Conta (PIX, Dinheiro, Débito, Crédito)
                </h4>
                <p className="text-xxs text-brand-lightGray">
                  Registre pagamentos parciais até zerar o valor total da mesa.
                </p>
              </div>

              {remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setPayAmount(remainingBalance.toFixed(2))}
                  className="px-3 py-1 rounded-lg bg-brand-bg border border-brand-mediumGray hover:border-amber-400 text-amber-300 text-xxs font-bold transition-all cursor-pointer w-fit"
                >
                  ⚡ Baixar Valor Total Restante (R$ {remainingBalance.toFixed(2)})
                </button>
              )}
            </div>

            {/* Formulário de Baixa */}
            <form onSubmit={handleRegisterPayment} className="space-y-4 bg-brand-bg p-4 rounded-xl border border-brand-mediumGray/60">
              <div className="space-y-2">
                <label className="text-xxs font-semibold uppercase text-brand-lightGray block">
                  1. Forma de Pagamento
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: "PIX", label: "⚡ PIX", color: "hover:border-emerald-400" },
                    { key: "DINHEIRO", label: "💵 Dinheiro", color: "hover:border-yellow-400" },
                    { key: "DEBITO", label: "💳 Cartão Débito", color: "hover:border-blue-400" },
                    { key: "CREDITO", label: "💳 Cartão Crédito", color: "hover:border-purple-400" },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPayMethod(m.key as any)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        payMethod === m.key
                          ? "bg-brand-red text-white border-brand-red shadow-md shadow-brand-red/20"
                          : `bg-brand-darkGray border-brand-mediumGray text-brand-lightGray hover:text-white ${m.color}`
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div>
                  <label className="text-xxs font-semibold uppercase text-brand-lightGray block mb-1">
                    2. Valor a Abater / Dar Baixa (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full rounded-xl border border-brand-mediumGray bg-brand-darkGray px-3.5 py-2 text-sm text-white font-mono font-bold focus:border-brand-red focus:outline-none"
                  />
                </div>

                {payMethod === "DINHEIRO" && (
                  <div>
                    <label className="text-xxs font-semibold uppercase text-brand-lightGray block mb-1">
                      3. Valor Entregue pelo Cliente (para Troco)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 50.00"
                      value={payChangeFor}
                      onChange={(e) => setPayChangeFor(e.target.value)}
                      className="w-full rounded-xl border border-brand-mediumGray bg-brand-darkGray px-3.5 py-2 text-sm text-white font-mono font-bold focus:border-yellow-400 focus:outline-none"
                    />
                    {payChangeFor && !isNaN(parseFloat(payChangeFor)) && (
                      <div className="mt-1.5">
                        {parseFloat(payChangeFor) >= (parseFloat(payAmount) || 0) ? (
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg inline-block">
                            💵 Troco a Devolver: R$ {(parseFloat(payChangeFor) - (parseFloat(payAmount) || 0)).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xxs text-amber-400">
                            ⚠️ Valor entregue menor que o valor a abater.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={registeringPayment || !payAmount || parseFloat(payAmount) <= 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {registeringPayment ? "⏳ Registrando Baixa..." : "✔ Confirmar Baixa na Conta"}
                </button>
              </div>
            </form>

            {/* Histórico de Baixas Já Realizadas */}
            <div className="space-y-2">
              <span className="text-xxs font-semibold uppercase text-brand-lightGray block">
                Histórico de Baixas Desta Mesa ({payments.length})
              </span>

              {payments.length === 0 ? (
                <div className="text-center py-4 text-xs text-brand-lightGray/50 bg-brand-bg/50 rounded-xl border border-brand-mediumGray/30">
                  Nenhuma baixa realizada ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-brand-bg border border-brand-mediumGray/40 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xxs font-bold uppercase ${
                            p.method === "PIX"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : p.method === "DINHEIRO"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : p.method === "DEBITO"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-purple-500/20 text-purple-400"
                          }`}
                        >
                          {p.method}
                        </span>
                        <span className="text-brand-lightGray text-xxs font-mono">
                          {new Date(p.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {p.change && p.change > 0 && (
                          <span className="text-xxs text-amber-300">
                            (Recebeu R$ {p.changeFor?.toFixed(2)} • Troco: R$ {p.change.toFixed(2)})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          R$ {p.amount.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          className="px-2 py-1 rounded bg-brand-darkGray hover:bg-brand-red hover:text-white text-brand-lightGray border border-brand-mediumGray text-xxs font-bold transition-colors cursor-pointer"
                          title="Estornar esta baixa"
                        >
                          ✕ Estornar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Histórico de Subpedidos Lançados */}
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4">
            <h4 className="font-serif text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Subpedidos Lançados na Cozinha
            </h4>

            <div className="space-y-4">
              {comandaOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="rounded-xl border border-brand-mediumGray/60 bg-brand-bg p-4 space-y-3 text-xs"
                >
                  <div className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-brand-red">
                        Subpedido #{ord.orderNumber}
                      </span>
                      <span className="text-xxxs text-brand-lightGray font-mono">
                        ({new Date(ord.createdAt).toLocaleTimeString("pt-BR")})
                      </span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      R$ {ord.total.toFixed(2)}
                    </span>
                  </div>

                  {/* Itens do Subpedido */}
                  <div className="space-y-2">
                    {ord.items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-brand-darkGray/50 p-2.5 rounded-lg border border-brand-mediumGray/30 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">
                            {item.quantity}x {item.name}
                          </span>
                          {item.isPizza && item.flavors?.length > 0 && (
                            <span className="block text-xxxs text-amber-300">
                              Sabores: {item.flavors.map((f) => f.flavorName).join(" / ")}
                            </span>
                          )}
                          {item.crustType && (
                            <span className="block text-xxxs text-brand-lightGray">
                              Borda: {item.crustType} (+R$ {item.crustPrice.toFixed(2)})
                            </span>
                          )}
                          <span className="text-xxxs font-mono text-brand-lightGray">
                            Valor: R$ {item.totalPrice.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setMigrateItemId(item.id);
                              setMigrateTargetId("");
                            }}
                            className="px-2.5 py-1 rounded bg-brand-bg border border-brand-mediumGray hover:border-purple-400 text-purple-300 text-xxs font-bold transition-colors cursor-pointer"
                          >
                            Migrar
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="px-2.5 py-1 rounded bg-brand-bg border border-brand-red/50 hover:bg-brand-red hover:text-white text-brand-red text-xxs font-bold transition-colors cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {comandaOrders.length === 0 && (
                <div className="py-12 text-center text-xs text-brand-lightGray/50">
                  Nenhum item lançado para esta mesa ainda.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ETAPA 3: CARDÁPIO INTEGRADO PARA LANÇAMENTO                   */}
      {/* ------------------------------------------------------------- */}
      {step === "catalog" && selectedComanda && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-brand-darkGray border border-brand-mediumGray p-4 rounded-2xl shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("detail")}
                className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white text-brand-lightGray text-xs font-bold transition-colors cursor-pointer"
              >
                ◀ Voltar à Mesa #{selectedComanda.number}
              </button>
              <h3 className="font-serif text-lg font-bold text-white">
                Cardápio — Mesa #{selectedComanda.number}
              </h3>
            </div>

            {draftCart.length > 0 && (
              <button
                onClick={() => setStep("cart")}
                className="px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-xs text-white transition-colors cursor-pointer flex items-center gap-2 shadow-lg shadow-brand-red/20"
              >
                🛒 Ver Rascunho ({draftCart.length}) • R$ {totalDraftCart.toFixed(2)}
              </button>
            )}
          </div>

          {/* Abas do Cardápio */}
          <div className="flex items-center gap-2 border-b border-brand-mediumGray/40 pb-2 text-xs">
            <button
              onClick={() => setCatalogTab("pizzas")}
              className={`px-4 py-2 rounded-xl font-bold transition-colors cursor-pointer ${
                catalogTab === "pizzas"
                  ? "bg-brand-red text-white"
                  : "bg-brand-darkGray text-brand-lightGray hover:text-white"
              }`}
            >
              🍕 Pizzas Artesanais
            </button>
            <button
              onClick={() => setCatalogTab("products")}
              className={`px-4 py-2 rounded-xl font-bold transition-colors cursor-pointer ${
                catalogTab === "products"
                  ? "bg-brand-red text-white"
                  : "bg-brand-darkGray text-brand-lightGray hover:text-white"
              }`}
            >
              🥤 Bebidas & Produtos
            </button>
          </div>

          {/* Seção de Pizzas */}
          {catalogTab === "pizzas" && (
            <div className="space-y-6">
              <div className="bg-brand-darkGray border border-brand-mediumGray p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block">
                    Montar Pizza Fracionada
                  </span>
                  <span className="text-xxs text-brand-lightGray">
                    Escolha o tamanho, sabores (até 4) e borda recheada.
                  </span>
                </div>
                <button
                  onClick={handleOpenPizzaCustomizer}
                  className="px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  ＋ Configurar Pizza
                </button>
              </div>

              {/* Categorias e Sabores */}
              {pizzaCategories.map((cat) => (
                <div key={cat.id} className="space-y-3">
                  <div className="flex justify-between items-center border-b border-brand-mediumGray/30 pb-1.5">
                    <h4 className="font-serif text-sm font-bold text-white">{cat.name}</h4>
                    <span className="text-xxs font-mono text-brand-lightGray">
                      P: R${cat.priceP} | M: R${cat.priceM} | G: R${cat.priceG} | GG: R${cat.priceGG}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cat.flavors.map((flavor) => (
                      <div
                        key={flavor.id}
                        className="p-3 rounded-xl bg-brand-darkGray border border-brand-mediumGray/50 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">{flavor.name}</span>
                          <span className="text-xxxs text-brand-lightGray line-clamp-1">
                            {flavor.description}
                          </span>
                        </div>
                        <button
                          onClick={handleOpenPizzaCustomizer}
                          className="px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-mediumGray hover:border-brand-red text-xxs font-bold text-white transition-colors cursor-pointer"
                        >
                          Montar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Seção de Bebidas & Outros Produtos */}
          {catalogTab === "products" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="p-4 rounded-xl bg-brand-darkGray border border-brand-mediumGray/50 flex justify-between items-center text-xs shadow-md"
                >
                  <div>
                    <span className="font-bold text-white block">{prod.name}</span>
                    <span className="text-xxs font-mono text-amber-400 mt-0.5 block">
                      R$ {prod.price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddSimpleProduct(prod)}
                    className="px-3 py-1.5 rounded-lg bg-brand-red hover:bg-brand-redHover font-bold text-xxs text-white transition-colors cursor-pointer"
                  >
                    ＋ Adicionar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ETAPA 4: CARRINHO E ENVIO PARA A COZINHA                      */}
      {/* ------------------------------------------------------------- */}
      {step === "cart" && selectedComanda && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between bg-brand-darkGray border border-brand-mediumGray p-4 rounded-2xl shadow-lg">
            <button
              onClick={() => setStep("catalog")}
              className="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-mediumGray hover:text-white text-brand-lightGray text-xs font-bold transition-colors cursor-pointer"
            >
              ◀ Continuar Escolhendo
            </button>
            <h3 className="font-serif text-lg font-bold text-white">
              Rascunho de Pedido — Mesa #{selectedComanda.number}
            </h3>
          </div>

          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-xl space-y-4">
            <h4 className="font-serif text-sm font-bold text-white border-b border-brand-mediumGray/30 pb-2">
              Itens a Serem Enviados ({draftCart.length})
            </h4>

            <div className="space-y-3">
              {draftCart.map((item, idx) => (
                <div
                  key={item.tempId || idx}
                  className="bg-brand-bg p-3.5 rounded-xl border border-brand-mediumGray/40 flex justify-between items-center text-xs"
                >
                  <div>
                    <span className="font-bold text-white block">{item.name}</span>
                    {item.notes && (
                      <span className="text-xxxs text-brand-red italic block">
                        Obs: {item.notes}
                      </span>
                    )}
                    <span className="text-xxs font-mono text-brand-lightGray">
                      R$ {item.totalPrice.toFixed(2)} cada
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white text-sm">
                      R$ {(item.totalPrice * item.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() =>
                        setDraftCart((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-brand-red text-xs hover:underline cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}

              {draftCart.length === 0 && (
                <div className="py-8 text-center text-xs text-brand-lightGray/50">
                  O rascunho está vazio.
                </div>
              )}
            </div>

            {/* Total e Envio */}
            <div className="pt-4 border-t border-brand-mediumGray/40 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-sm">Total do Subpedido:</span>
                <span className="font-serif text-xl font-bold text-amber-400 font-mono">
                  R$ {totalDraftCart.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleSendOrderToKitchen}
                disabled={draftCart.length === 0 || sendingOrder}
                className="w-full py-3.5 rounded-xl bg-brand-red hover:bg-brand-redHover font-bold text-white text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-brand-red/20"
              >
                {sendingOrder ? "Enviando à Cozinha..." : "🚀 Enviar Pedido para a Cozinha"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: PERSONALIZAÇÃO DE PIZZA                                */}
      {/* ------------------------------------------------------------- */}
      {isPizzaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-3">
              <h3 className="font-serif text-lg font-bold text-white">
                Montar Pizza Fracionada
              </h3>
              <button
                onClick={() => setIsPizzaModalOpen(false)}
                className="text-brand-lightGray hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* 1. Escolha do Tamanho */}
            <div className="space-y-2">
              <label className="text-xxs font-semibold uppercase text-brand-lightGray">
                1. Escolha o Tamanho
              </label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {(["P", "M", "G", "GG"] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      setSelectedPizzaSize(sz);
                      setSelectedFlavors([]);
                    }}
                    className={`py-2.5 rounded-xl font-bold border transition-colors cursor-pointer ${
                      selectedPizzaSize === sz
                        ? "bg-brand-red text-white border-brand-red"
                        : "bg-brand-bg text-brand-lightGray border-brand-mediumGray hover:text-white"
                    }`}
                  >
                    {sz} (até {sz === "P" ? 1 : sz === "M" ? 2 : sz === "G" ? 3 : 4} sab.)
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Escolha dos Sabores */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xxs font-semibold uppercase text-brand-lightGray">
                  2. Selecione os Sabores ({selectedFlavors.length}/{maxFlavorsForSize})
                </label>
                <span className="text-xxxs text-amber-400 font-mono">
                  Cobrado pelo maior valor
                </span>
              </div>

              <div className="space-y-4 max-h-48 overflow-y-auto pr-1">
                {pizzaCategories.map((cat) => (
                  <div key={cat.id} className="space-y-1.5">
                    <span className="text-xxxs font-bold uppercase text-brand-lightGray block">
                      {cat.name} (R$ {cat[`price${selectedPizzaSize}`]})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cat.flavors.map((flavor) => {
                        const isSelected = selectedFlavors.some((f) => f.id === flavor.id);
                        return (
                          <button
                            key={flavor.id}
                            type="button"
                            onClick={() => handleToggleFlavor(flavor, cat)}
                            className={`p-2 rounded-lg text-xxs font-semibold text-left border transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-brand-red/20 border-brand-red text-white font-bold"
                                : "bg-brand-bg border-brand-mediumGray/50 text-brand-lightGray hover:text-white"
                            }`}
                          >
                            {isSelected ? "✓ " : "+ "}
                            {flavor.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Borda Recheada */}
            {crusts.length > 0 && (
              <div className="space-y-2">
                <label className="text-xxs font-semibold uppercase text-brand-lightGray">
                  3. Borda Recheada (Opcional)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCrust(null)}
                    className={`p-2 rounded-lg text-xxs font-semibold border transition-colors cursor-pointer ${
                      !selectedCrust
                        ? "bg-brand-red/20 border-brand-red text-white"
                        : "bg-brand-bg border-brand-mediumGray/50 text-brand-lightGray"
                    }`}
                  >
                    Sem Borda
                  </button>
                  {crusts.map((crust) => {
                    const price =
                      selectedPizzaSize === "P" || selectedPizzaSize === "M"
                        ? crust.pricePM
                        : crust.priceGGG;
                    const isSelected = selectedCrust?.id === crust.id;
                    return (
                      <button
                        key={crust.id}
                        type="button"
                        onClick={() => setSelectedCrust(crust)}
                        className={`p-2 rounded-lg text-xxs font-semibold border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-brand-red/20 border-brand-red text-white font-bold"
                            : "bg-brand-bg border-brand-mediumGray/50 text-brand-lightGray hover:text-white"
                        }`}
                      >
                        {crust.name} (+R$ {price.toFixed(2)})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Observações */}
            <div>
              <label className="text-xxs font-semibold uppercase text-brand-lightGray block mb-1">
                4. Observações da Cozinha
              </label>
              <input
                type="text"
                placeholder="Ex: Sem cebola, massa bem assada"
                value={pizzaNotes}
                onChange={(e) => setPizzaNotes(e.target.value)}
                className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white focus:border-brand-red focus:outline-none"
              />
            </div>

            {/* Footer do Modal */}
            <div className="flex justify-between items-center pt-4 border-t border-brand-mediumGray/40">
              <div>
                <span className="text-xxs text-brand-lightGray block">Preço Calculado</span>
                <span className="text-xl font-bold font-mono text-amber-400">
                  R$ {configuredPizzaPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPizzaModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-brand-bg border border-brand-mediumGray hover:text-white text-xs font-bold transition-colors cursor-pointer text-brand-lightGray"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddConfiguredPizza}
                  className="px-5 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Adicionar à Mesa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: FECHAMENTO DE CONTA / CONFERÊNCIA                      */}
      {/* ------------------------------------------------------------- */}
      {closeModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-3">
              <h3 className="font-serif text-lg font-bold text-white">
                Pré-Conta — Mesa #{closeModalData.comandaNumber}
              </h3>
              <button
                onClick={() => setCloseModalData(null)}
                className="text-brand-lightGray hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-brand-lightGray">Titular da Mesa:</span>
                <span className="font-bold text-white">{closeModalData.responsibleName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-lightGray">Subpedidos Lançados:</span>
                <span className="font-bold text-white">{closeModalData.orderCount}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-bg border border-brand-mediumGray/40 text-center space-y-1">
              <span className="text-xxs font-semibold uppercase text-brand-lightGray">
                Total a Pagar
              </span>
              <div className="text-3xl font-serif font-bold text-amber-400 font-mono">
                R$ {closeModalData.total.toFixed(2)}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setCloseModalData(null)}
                className="flex-1 py-2.5 rounded-xl bg-brand-bg border border-brand-mediumGray hover:text-white font-bold text-xs text-brand-lightGray cursor-pointer"
              >
                Fechar Janela
              </button>
              <button
                onClick={() => {
                  setCloseModalData(null);
                  handleReleaseComanda();
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white cursor-pointer"
              >
                Receber & Liberar Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: MIGRAR ITEM                                            */}
      {/* ------------------------------------------------------------- */}
      {migrateItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-4">
            <h3 className="font-serif text-base font-bold text-white">
              Migrar Item para Outra Mesa
            </h3>
            <p className="text-xxs text-brand-lightGray">
              Selecione a mesa de destino para transferir o consumo deste item.
            </p>

            <select
              value={migrateTargetId}
              onChange={(e) => setMigrateTargetId(e.target.value)}
              className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
            >
              <option value="">Selecione a Mesa de Destino...</option>
              {comandas
                .filter((c) => c.id !== selectedComandaId && c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    Mesa #{c.number} {c.responsibleName ? `(${c.responsibleName})` : `(${c.status})`}
                  </option>
                ))}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMigrateItemId(null)}
                className="flex-1 py-2 rounded-lg bg-brand-bg border border-brand-mediumGray text-xs font-bold text-brand-lightGray hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleMigrateItem}
                disabled={!migrateTargetId}
                className="flex-1 py-2 rounded-lg bg-brand-red hover:bg-brand-redHover text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Confirmar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: TRANSFERIR MESA INTEIRA                                */}
      {/* ------------------------------------------------------------- */}
      {isTransferTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-2">
              <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                <span>🔄</span> Transferir Mesa Inteira
              </h3>
              <button
                onClick={() => setIsTransferTableModalOpen(false)}
                className="text-brand-lightGray hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xxs text-brand-lightGray">
              Selecione a mesa de destino. <strong>Todos os pedidos, itens e pagamentos/baixas</strong> da Mesa #{selectedComanda?.number} serão migrados para a mesa selecionada.
            </p>

            <select
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
              className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-xs text-white focus:border-brand-red focus:outline-none cursor-pointer"
            >
              <option value="">Selecione a Mesa de Destino...</option>
              {comandas
                .filter((c) => c.id !== selectedComandaId && c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    Mesa #{c.number} {c.responsibleName ? `(${c.responsibleName})` : `(${c.status})`}
                  </option>
                ))}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsTransferTableModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-brand-bg border border-brand-mediumGray text-xs font-bold text-brand-lightGray hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTransferTable}
                disabled={!transferTargetId || transferringTable}
                className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {transferringTable ? "Transferindo..." : "Transferir Tudo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: GERAR COMANDAS EM LOTE (ADMIN)                         */}
      {/* ------------------------------------------------------------- */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-brand-mediumGray/40 pb-2">
              <h3 className="font-serif text-base font-bold text-white">
                Gerar Comandas em Lote
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-brand-lightGray hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-3 text-xs">
              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Número Inicial
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={batchStart}
                  onChange={(e) => setBatchStart(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase text-brand-lightGray mb-1">
                  Quantidade a Gerar
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={batchQty}
                  onChange={(e) => setBatchQty(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-3 py-2 text-white focus:border-brand-red focus:outline-none font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="flex-1 py-2 rounded-lg bg-brand-bg border border-brand-mediumGray text-brand-lightGray hover:text-white font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-brand-red hover:bg-brand-redHover text-white font-bold transition-colors cursor-pointer"
                >
                  Gerar Mesas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ORDER PANEL PADRONIZADO (Lançamento Rápido na Cozinha) */}
      {quickOrderComanda && (
        <QuickOrderPanel
          comanda={quickOrderComanda}
          onClose={() => setQuickOrderComanda(null)}
          onOrderCreated={async (order) => {
            await loadComandas();
            if (selectedComandaId && selectedComandaId === quickOrderComanda.id) {
              handleOpenComanda(quickOrderComanda);
            }
          }}
        />
      )}
    </div>
  );
}
