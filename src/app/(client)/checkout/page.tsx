"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";
import DeliveryMap from "@/components/client/DeliveryMap";
import { OrderType, PaymentMethod } from "@prisma/client";

interface AddressHistory {
  address: string;
  number: string;
  reference: string;
  lat: number;
  lng: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getCartSubtotal, clearCart } = useCartStore();
  const [mounted, setMounted] = useState(false);

  // --- Estados de Passos ---
  const [step, setStep] = useState(1);
  const [storeOpen, setStoreOpen] = useState(true);

  // --- Passo 1: Tipo ---
  const [type, setType] = useState<OrderType>(OrderType.DELIVERY);

  // --- Passo 2: Identificação ---
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(false);

  // --- Passo 3: Endereço ---
  const [addressMode, setAddressMode] = useState<"list" | "edit" | "map">("list");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [reference, setReference] = useState("");
  
  // Default coordinates (inicia em Recife, mas atualiza para a cidade cadastrada no banco)
  const [lat, setLat] = useState(-8.05);
  const [lng, setLng] = useState(-34.90);
  const [addressesHistory, setAddressesHistory] = useState<AddressHistory[]>([]);
  const [deliveryCities, setDeliveryCities] = useState<string[]>(["Cachoeirinha"]);

  // Geolocalização
  const [geoLoading, setGeoLoading] = useState(false);
  const [gpsTriggered, setGpsTriggered] = useState(false); // indica se veio por GPS para exibir campos abaixo do mapa

  // Zonas e Cobertura
  const [inCoverage, setInCoverage] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [matchedZoneTitle, setMatchedZoneTitle] = useState("");

  // --- Passo 4: Pagamento ---
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.PIX);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");

  // Finalização
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Evita erros de hidratação e busca o status da loja
  useEffect(() => {
    setMounted(true);
    
    // Busca status inicial do delivery e configurações do banco
    fetch("/api/public/store-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.open !== undefined) {
          setStoreOpen(data.open);
        }
        if (data.deliveryCities && data.deliveryCities.length > 0) {
          setDeliveryCities(data.deliveryCities);
          
          // Geocodifica a primeira cidade configurada para centrar o mapa nela por padrão ao invés de Recife!
          const defaultCity = data.deliveryCities[0];
          fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(defaultCity + ", Pernambuco, Brasil")}&format=json&limit=1`)
            .then((r) => r.json())
            .then((res) => {
              if (res && res.length > 0) {
                setLat(parseFloat(res[0].lat));
                setLng(parseFloat(res[0].lon));
              }
            })
            .catch((err) => console.error("Erro ao centrar na cidade padrão:", err));
        }
      })
      .catch((err) => console.error("Erro ao carregar status da loja:", err));

    // Conecta via SSE
    const eventSource = new EventSource("/api/print/events");
    eventSource.addEventListener("store_status_changed", (event: any) => {
      const data = JSON.parse(event.data);
      setStoreOpen(data.open);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const subtotal = getCartSubtotal();

  // Verifica o carrinho vazio
  useEffect(() => {
    if (mounted && items.length === 0) {
      router.push("/");
    }
  }, [mounted, items, router]);

  // Lookup automático ao atingir 11 dígitos do telefone
  useEffect(() => {
    const cleanedPhone = customerPhone.replace(/\D/g, "");
    if (cleanedPhone.length === 11 || cleanedPhone.length === 10) {
      triggerCustomerLookup(cleanedPhone);
    }
  }, [customerPhone]);

  // Checagem de cobertura do mapa ao mover o pino
  useEffect(() => {
    if (type === OrderType.DELIVERY) {
      checkDeliveryCoverage(lat, lng);
    } else {
      setInCoverage(true);
      setDeliveryFee(0);
      setCoverageError(null);
    }
  }, [lat, lng, type]);

  const triggerCustomerLookup = async (phone: string) => {
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/public/customer-lookup?phone=${phone}`);
      const data = await res.json();

      if (data.found) {
        setCustomerName(data.name);
        setAddressesHistory(data.addresses);
        setIsNewCustomer(false);
      } else {
        setIsNewCustomer(true);
        setAddressesHistory([]);
      }
    } catch (err) {
      console.error("Lookup error:", err);
    } finally {
      setLookupLoading(false);
    }
  };

  const checkDeliveryCoverage = async (latitude: number, longitude: number) => {
    setCheckingCoverage(true);
    setCoverageError(null);
    try {
      const res = await fetch("/api/public/delivery-zone-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latitude, lng: longitude }),
      });
      const data = await res.json();

      if (data.inCoverage) {
        setInCoverage(true);
        setDeliveryFee(data.deliveryFee);
        setMatchedZoneTitle(data.zoneTitle || "Delivery");
      } else {
        setInCoverage(false);
        setDeliveryFee(0);
        setCoverageError(data.error || "Endereço fora da área de entrega.");
      }
    } catch (err) {
      console.error("Coverage check error:", err);
      setCoverageError("Erro ao calcular taxa de entrega.");
    } finally {
      setCheckingCoverage(false);
    }
  };

  // reverse geocoding ao mover o pino (somente se veio via GPS)
  const triggerReverseGeocoding = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
      const data = await res.json();
      if (data && data.address) {
        const road = data.address.road || data.address.suburb || data.address.city || "Localização marcada no mapa";
        setAddress(road);
      }
    } catch (err) {
      console.error("Reverse geocoding error:", err);
    }
  };

  const handlePositionChange = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    if (gpsTriggered) {
      triggerReverseGeocoding(newLat, newLng);
    }
  };

  // Geolocalização via GPS do celular
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocalização não suportada no seu navegador.");
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLat(latitude);
        setLng(longitude);
        
        // Reverse Geocoding inicial
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          if (data && data.address) {
            const road = data.address.road || data.address.suburb || data.address.city || "";
            setAddress(road);
          } else {
            setAddress("Minha Localização");
          }
        } catch (err) {
          setAddress("Minha Localização");
        }

        setAddressNumber("");
        setReference("");
        setGpsTriggered(true); // Ativa layout com campos abaixo do mapa
        setAddressMode("map");
        setGeoLoading(false);
      },
      (error) => {
        console.error(error);
        alert("Não foi possível obter sua localização atual.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Geocodificação do Endereço Digitado Manualmente (Nominatim)
  const geocodeTypedAddress = async () => {
    setCheckingCoverage(true);
    
    // Constrói query adicionando a cidade configurada no banco para maior precisão
    const cityContext = deliveryCities.length > 0 ? deliveryCities[0] : "Cachoeirinha";
    const searchQuery = `${address}, ${addressNumber}, ${cityContext}, Pernambuco, Brasil`;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
      const data = await res.json();

      if (data && data.length > 0) {
        const foundLat = parseFloat(data[0].lat);
        const foundLng = parseFloat(data[0].lon);
        setLat(foundLat);
        setLng(foundLng);
        // useEffect do lat/lng recalculará a taxa de entrega automaticamente
      } else {
        console.warn("Endereço não geocodificado. Mantendo coordenadas atuais da cidade.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
    } finally {
      setCheckingCoverage(false);
      setGpsTriggered(false);
      setAddressMode("map"); // Direciona para o mapa
    }
  };

  const handleSelectHistoryAddress = (history: AddressHistory) => {
    setAddress(history.address);
    setAddressNumber(history.number);
    setReference(history.reference);
    setLat(history.lat);
    setLng(history.lng);
    setGpsTriggered(false);
    setAddressMode("map"); // Vai para confirmação no mapa
  };

  // Submissão Final do Pedido
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!storeOpen) {
      setSubmitError("O estabelecimento está fechado no momento.");
      return;
    }

    setSubmitting(true);

    try {
      const orderPayload = {
        customerName,
        customerPhone,
        type,
        customerAddress: type === OrderType.DELIVERY ? address : null,
        addressNumber: type === OrderType.DELIVERY ? addressNumber : null,
        reference: type === OrderType.DELIVERY ? reference : null,
        customerLat: type === OrderType.DELIVERY ? lat : null,
        customerLng: type === OrderType.DELIVERY ? lng : null,
        paymentMethod,
        changeFor: paymentMethod === PaymentMethod.DINHEIRO && changeFor ? parseFloat(changeFor) : null,
        notes,
        deliveryFee,
        items: items.map((item) => ({
          name: item.name,
          isPizza: item.isPizza,
          quantity: item.quantity,
          price: item.price,
          pizzaSize: item.pizzaSize,
          crustType: item.crustType,
          crustPrice: item.crustPrice,
          flavors: item.flavors,
        })),
      };

      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();

      if (data.success && data.order) {
        clearCart();
        router.push(`/checkout/sucesso?orderId=${data.order.id}`);
      } else {
        setSubmitError(data.error || "Erro ao enviar pedido.");
      }
    } catch (err) {
      console.error(err);
      setSubmitError("Erro de conexão ao enviar pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  const finalTotal = useMemo(() => {
    return subtotal + (type === OrderType.DELIVERY ? deliveryFee : 0);
  }, [subtotal, type, deliveryFee]);

  // Controles de navegação de passos
  const handleNextStep = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (!customerPhone.trim()) {
        alert("Insira seu número de telefone.");
        return;
      }
      if (!customerName.trim()) {
        alert("Insira seu nome.");
        return;
      }
      if (type === OrderType.DELIVERY) {
        setStep(3);
        setAddressMode("list");
      } else {
        setStep(4); // Pula endereço se for Retirada
      }
    } else if (step === 3) {
      if (addressMode === "edit") {
        if (!address.trim() || !addressNumber.trim()) {
          alert("Endereço e Número são obrigatórios.");
          return;
        }
        geocodeTypedAddress(); // geocodifica endereço digitado e abre mapa
      } else if (addressMode === "map") {
        if (!address.trim() || !addressNumber.trim()) {
          alert("Confirme o nome da rua e informe o número do endereço.");
          return;
        }
        if (!inCoverage) {
          alert("Estamos fora de cobertura para este local.");
          return;
        }
        setStep(4);
      }
    }
  };

  const handlePrevStep = () => {
    if (step === 1) {
      router.push("/carrinho");
    } else if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      if (addressMode === "map") {
        if (gpsTriggered) {
          setAddressMode("list");
        } else if (addressesHistory.length > 0) {
          setAddressMode("list");
        } else {
          setAddressMode("edit");
        }
      } else if (addressMode === "edit") {
        setAddressMode("list");
      } else {
        setStep(2);
      }
    } else if (step === 4) {
      if (type === OrderType.DELIVERY) {
        setStep(3);
        setAddressMode("map");
      } else {
        setStep(2);
      }
    }
  };

  if (!mounted || items.length === 0) return null;

  // Renderizador dos círculos de passos
  const renderStepsIndicator = () => {
    const isDelivery = type === OrderType.DELIVERY;
    
    const stepsConfig = isDelivery
      ? [
          { number: 1, label: "Tipo" },
          { number: 2, label: "Identificação" },
          { number: 3, label: "Endereço" },
          { number: 4, label: "Pagamento" },
        ]
      : [
          { number: 1, label: "Tipo" },
          { number: 2, label: "Identificação" },
          { number: 3, label: "Pagamento" },
        ];

    const getActiveNumber = (s: number) => {
      if (!isDelivery && s === 4) return 3;
      return s;
    };

    const activeNum = getActiveNumber(step);

    return (
      <div className="flex items-center justify-center space-x-2 sm:space-x-4 mb-8 overflow-x-auto py-2 scrollbar-none text-xs">
        {stepsConfig.map((item, idx) => {
          const isActive = activeNum === item.number;
          const isCompleted = activeNum > item.number;

          return (
            <React.Fragment key={item.number}>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xxs transition-colors ${
                    isActive
                      ? "bg-brand-red text-white"
                      : isCompleted
                      ? "bg-brand-red/30 text-brand-red border border-brand-red/40"
                      : "bg-brand-mediumGray text-brand-lightGray"
                  }`}
                >
                  {item.number}
                </div>
                <span
                  className={`font-semibold ${
                    isActive ? "text-brand-red" : isCompleted ? "text-brand-red/80" : "text-brand-lightGray"
                  }`}
                >
                  {item.label}
                </span>
              </div>
              {idx < stepsConfig.length - 1 && (
                <div
                  className={`w-8 sm:w-16 h-0.5 transition-colors flex-shrink-0 ${
                    isCompleted ? "bg-brand-red/50" : "bg-brand-mediumGray"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      
      {/* Botão Superior Voltar */}
      <button
        onClick={handlePrevStep}
        className="flex items-center space-x-2 text-xs font-semibold text-brand-lightGray hover:text-white mb-6 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        <span>Voltar</span>
      </button>

      {/* Indicador Superior de Passos */}
      {renderStepsIndicator()}

      <div className="max-w-xl mx-auto">
        
        {/* PASSO 1: TIPO DE RECEBIMENTO */}
        {step === 1 && (
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-xl">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-xl">🏪</span>
              <h2 className="font-serif text-lg font-bold text-white">Como você quer receber?</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
              {/* Card Entrega */}
              <button
                type="button"
                onClick={() => setType(OrderType.DELIVERY)}
                className={`flex items-center space-x-4 p-5 rounded-xl border text-left cursor-pointer transition-all ${
                  type === OrderType.DELIVERY
                    ? "border-brand-red bg-brand-red/5"
                    : "border-brand-mediumGray bg-brand-bg hover:border-brand-lightGray"
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${type === OrderType.DELIVERY ? "bg-brand-red text-white" : "bg-brand-mediumGray text-brand-lightGray"}`}>
                  🚚
                </div>
                <div>
                  <span className="font-bold text-sm block text-white">Entrega</span>
                  <span className="text-xxs text-brand-lightGray block mt-0.5">Receber no meu endereço</span>
                </div>
              </button>

              {/* Card Retirada */}
              <button
                type="button"
                onClick={() => setType(OrderType.RETIRADA)}
                className={`flex items-center space-x-4 p-5 rounded-xl border text-left cursor-pointer transition-all ${
                  type === OrderType.RETIRADA
                    ? "border-brand-red bg-brand-red/5"
                    : "border-brand-mediumGray bg-brand-bg hover:border-brand-lightGray"
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${type === OrderType.RETIRADA ? "bg-brand-red text-white" : "bg-brand-mediumGray text-brand-lightGray"}`}>
                  🏪
                </div>
                <div>
                  <span className="font-bold text-sm block text-white">Retirada</span>
                  <span className="text-xxs text-brand-lightGray block mt-0.5">Vou buscar no local</span>
                </div>
              </button>
            </div>

            <button
              onClick={handleNextStep}
              className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-xs font-bold text-white transition-colors cursor-pointer"
            >
              Continuar ➔
            </button>
          </div>
        )}

        {/* PASSO 2: IDENTIFICAÇÃO (TELEFONE / NOME) */}
        {step === 2 && (
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-5 shadow-xl">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-xl">📞</span>
              <h2 className="font-serif text-lg font-bold text-white">Seu Telefone</h2>
            </div>

            <div className="space-y-4 font-sans">
              <div>
                <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                  Telefone *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(81) 99999-9999"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none transition-colors font-mono"
                />
                {lookupLoading && (
                  <span className="text-xxs text-brand-red animate-pulse mt-1 block">Buscando perfil...</span>
                )}
              </div>

              {/* Box feedback do lookup */}
              {!isNewCustomer && customerName && (
                <div className="p-4 rounded-xl bg-brand-red/5 border border-brand-red/30 text-xs space-y-3">
                  <span className="font-bold text-white block">
                    Estávamos te esperando, {customerName}! 👋
                  </span>
                  <span className="text-xxs text-brand-lightGray block">
                    Seus dados foram preenchidos automaticamente.
                  </span>
                  
                  <div className="flex justify-between items-center pt-2 border-t border-brand-mediumGray/35">
                    <span className="font-bold text-white text-xxs">👤 {customerName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerName("");
                        setIsNewCustomer(true);
                        setAddressesHistory([]);
                      }}
                      className="text-xxs text-brand-red hover:underline font-bold cursor-pointer"
                    >
                      Não sou eu
                    </button>
                  </div>
                </div>
              )}

              {/* Se for novo ou limpar o lookup, exibe campo de nome */}
              {isNewCustomer && (
                <div>
                  <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                    Seu Nome
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gustavo"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-3 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none transition-colors"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleNextStep}
              className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-xs font-bold text-white transition-colors cursor-pointer"
            >
              Continuar ➔
            </button>
          </div>
        )}

        {/* PASSO 3: ENDEREÇO (SOMENTE SE ENTREGA) */}
        {step === 3 && type === OrderType.DELIVERY && (
          <div className="space-y-6">
            
            {/* 3.1: Lista de Endereços Anteriores ou Novo */}
            {addressMode === "list" && (
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-xl font-sans">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-xl">📍</span>
                  <h2 className="font-serif text-lg font-bold text-white">Olá, {customerName}! Onde vamos entregar?</h2>
                </div>

                {addressesHistory.length > 0 && (
                  <div className="space-y-3">
                    <span className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                      ⏰ Endereços anteriores
                    </span>
                    <div className="space-y-2">
                      {addressesHistory.map((addr, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectHistoryAddress(addr)}
                          className="w-full flex items-center justify-between p-4 rounded-xl border border-brand-mediumGray bg-brand-bg hover:border-brand-red text-left text-xs transition-all cursor-pointer group"
                        >
                          <div>
                            <span className="font-bold text-white block">{addr.address}, {addr.number}</span>
                            {addr.reference && <span className="text-xxs text-brand-lightGray block mt-0.5">{addr.reference}</span>}
                          </div>
                          <span className="text-brand-lightGray group-hover:text-brand-red transition-colors">➔</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-4 border-t border-brand-mediumGray/35">
                  <span className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                    🆕 Novo endereço
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Botão Usar Localização */}
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={geoLoading}
                      className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-brand-red/40 hover:border-brand-red bg-brand-red/5 text-center text-xxs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="text-lg mb-2">🧭</span>
                      <span className="font-bold text-brand-red">Usar minha localização</span>
                      <span className="text-xxxs text-brand-lightGray mt-1">GPS atual do celular</span>
                    </button>

                    {/* Botão Digitar Endereço */}
                    <button
                      type="button"
                      onClick={() => {
                        setGpsTriggered(false);
                        setAddress("");
                        setAddressNumber("");
                        setReference("");
                        setAddressMode("edit");
                      }}
                      className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-brand-mediumGray hover:border-brand-lightGray bg-brand-bg text-center text-xxs transition-all cursor-pointer"
                    >
                      <span className="text-lg mb-2">📝</span>
                      <span className="font-bold text-white">Digitar endereço</span>
                      <span className="text-xxxs text-brand-lightGray mt-1">Rua, número e referência</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3.2: Digitar Endereço Manualmente */}
            {addressMode === "edit" && (
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-4 shadow-xl font-sans">
                <h3 className="font-serif text-base font-bold text-white mb-2">Digitar Endereço</h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                      Endereço (Rua/Avenida) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Rua Amélia"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                        Número *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 818"
                        value={addressNumber}
                        onChange={(e) => setAddressNumber(e.target.value)}
                        className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                        Referência / Complemento
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Apto 10, Próximo à praça"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setAddressMode("list")}
                    className="flex-1 py-3 rounded-xl bg-brand-bg border border-brand-mediumGray text-xs font-bold text-white hover:text-white transition-colors cursor-pointer"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="flex-1 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-xs font-bold text-white transition-colors cursor-pointer"
                  >
                    Continuar ➔
                  </button>
                </div>
              </div>
            )}

            {/* 3.3: Confirmação e Ajuste de Pino no Mapa */}
            {addressMode === "map" && (
              <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-4 shadow-xl font-sans">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif text-base font-bold text-white">Confirmar Localização</h3>
                  <button onClick={() => setAddressMode(gpsTriggered ? "list" : "edit")} className="text-xxs text-brand-red hover:underline font-bold cursor-pointer">
                    Editar endereço
                  </button>
                </div>

                {/* Banner de Instrução do Mapa */}
                <div className="p-3 bg-brand-red/10 border border-brand-red/20 rounded-xl text-xxs text-brand-red flex items-center space-x-2">
                  <span>📍</span>
                  <p className="leading-tight font-medium">
                    <strong>Arraste o pin</strong> para o local exato da sua casa. Use o zoom para precisão.
                  </p>
                </div>

                {/* Componente Leaflet */}
                <DeliveryMap
                  initialLat={lat}
                  initialLng={lng}
                  onPositionChange={handlePositionChange}
                />

                {/* Se veio via GPS (Usar Minha Localização), exibe campos abaixo do mapa para confirmação */}
                {gpsTriggered ? (
                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                        Rua / Avenida *
                      </label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white focus:border-brand-red focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                          Número *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Número"
                          value={addressNumber}
                          onChange={(e) => setAddressNumber(e.target.value)}
                          className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white focus:border-brand-red focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                          Referência
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Apto 10"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-white focus:border-brand-red focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // Caso contrário exibe caixa estática de resumo do endereço digitado
                  <div className="p-3.5 bg-brand-bg rounded-xl border border-brand-mediumGray/50 text-xxs leading-relaxed">
                    <span className="font-bold text-white block">📍 Endereço Confirmado:</span>
                    <span className="text-brand-lightGray block mt-0.5">
                      {address}, {addressNumber} {reference && `— ${reference}`}
                    </span>
                  </div>
                )}

                {/* Zonas e Feedbacks de Cobertura */}
                {checkingCoverage && (
                  <span className="text-xxs text-brand-red animate-pulse block">Calculando taxa de entrega...</span>
                )}
                {coverageError && (
                  <div className="p-3 bg-brand-red/10 border border-brand-red/20 rounded-lg text-xxs text-brand-red">
                    {coverageError}
                  </div>
                )}
                {!checkingCoverage && inCoverage && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xxs text-green-400 font-bold">
                    ✓ Área Atendida: {matchedZoneTitle} | Taxa: R$ {deliveryFee.toFixed(2)}
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setAddressMode(gpsTriggered ? "list" : "edit")}
                    className="flex-1 py-3 rounded-xl bg-brand-bg border border-brand-mediumGray text-xs font-bold text-white hover:text-white transition-colors cursor-pointer"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    disabled={checkingCoverage || !inCoverage || !address.trim() || !addressNumber.trim()}
                    onClick={handleNextStep}
                    className="flex-1 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Confirmar localização ➔
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* PASSO 4: PAGAMENTO E RESUMO DO PEDIDO */}
        {step === 4 && (
          <div className="rounded-2xl border border-brand-mediumGray bg-brand-darkGray p-6 space-y-6 shadow-xl font-sans">
            
            {/* Headers de Resumo dos Passos Anteriores (com botões de Alterar) */}
            <div className="space-y-2.5">
              {/* Resumo Identificação */}
              <div className="flex justify-between items-center p-3.5 bg-brand-bg rounded-xl border border-brand-mediumGray/50 text-xxs leading-normal">
                <div>
                  <span className="text-brand-lightGray block uppercase font-bold tracking-wider text-xxxs">Cliente</span>
                  <span className="font-bold text-white block mt-0.5">👤 {customerName}</span>
                  <span className="text-brand-lightGray block">{customerPhone}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xxs text-brand-red hover:underline font-bold cursor-pointer"
                >
                  Alterar
                </button>
              </div>

              {/* Resumo Endereço (somente se entrega) */}
              {type === OrderType.DELIVERY && (
                <div className="flex justify-between items-center p-3.5 bg-brand-bg rounded-xl border border-brand-mediumGray/50 text-xxs leading-normal">
                  <div>
                    <span className="text-brand-lightGray block uppercase font-bold tracking-wider text-xxxs">Local de Entrega</span>
                    <span className="font-bold text-white block mt-0.5">📍 {address}, {addressNumber}</span>
                    <span className="text-brand-lightGray block">Zona: {matchedZoneTitle} • Taxa: R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(3);
                      setAddressMode("map");
                    }}
                    className="text-xxs text-brand-red hover:underline font-bold cursor-pointer"
                  >
                    Alterar
                  </button>
                </div>
              )}
            </div>

            {/* Configuração do Pagamento */}
            <div className="space-y-4 pt-4 border-t border-brand-mediumGray/35">
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-xl">💳</span>
                <h2 className="font-serif text-lg font-bold text-white">Pagamento</h2>
              </div>

              <div>
                <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                  Observações do Pedido
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alguma observação? (Ex: Sem cebola, trocar por borda de queijo, tocar interfone)"
                  rows={2}
                  className="w-full rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white placeholder-brand-lightGray/40 focus:border-brand-red focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { method: PaymentMethod.PIX, label: "PIX" },
                    { method: PaymentMethod.DINHEIRO, label: "Dinheiro" },
                    { method: PaymentMethod.CREDITO, label: "Cartão Crédito" },
                    { method: PaymentMethod.DEBITO, label: "Cartão Débito" },
                  ].map((opt) => (
                    <button
                      key={opt.method}
                      type="button"
                      onClick={() => setPaymentMethod(opt.method)}
                      className={`rounded-lg py-2.5 text-xs font-bold transition-all text-center cursor-pointer ${
                        paymentMethod === opt.method
                          ? "bg-brand-red text-white"
                          : "bg-brand-bg text-brand-lightGray border border-brand-mediumGray hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="block text-xxxs text-brand-lightGray italic mt-1.5">
                  {paymentMethod === PaymentMethod.PIX && "* PIX na maquininha: o entregador leva a maquininha para receber na entrega."}
                  {paymentMethod === PaymentMethod.CREDITO && "* Cartão na maquininha na entrega."}
                  {paymentMethod === PaymentMethod.DEBITO && "* Cartão na maquininha na entrega."}
                </span>
              </div>

              {paymentMethod === PaymentMethod.DINHEIRO && (
                <div className="pt-2 font-mono">
                  <label className="block text-xxs font-semibold uppercase tracking-wider text-brand-lightGray mb-1">
                    Precisa de troco para quanto?
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: R$ 50"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    className="w-32 rounded-lg border border-brand-mediumGray bg-brand-bg px-4 py-2.5 text-xs text-white focus:border-brand-red focus:outline-none font-mono"
                  />
                </div>
              )}
            </div>

            {/* Resumo do Pedido */}
            <div className="space-y-4 pt-4 border-t border-brand-mediumGray/35">
              <h3 className="font-serif text-sm font-bold text-white">Resumo do Pedido</h3>
              
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xxs text-brand-lightGray">
                    <div className="space-y-0.5">
                      <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                      {item.isPizza && <span className="block opacity-75">{item.pizzaSize} - {item.crustType}</span>}
                    </div>
                    <span className="font-mono text-white">R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-xxs text-brand-lightGray pt-2 border-t border-brand-mediumGray/20">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-white">R$ {subtotal.toFixed(2)}</span>
                </div>
                {type === OrderType.DELIVERY && (
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className="font-mono text-white">R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-brand-mediumGray/30">
                <span className="text-xs font-bold text-white">Total</span>
                <span className="font-mono text-lg font-bold text-brand-red">R$ {finalTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Erros da Submissão e Botão Finalizar */}
            {submitError && (
              <div className="p-3 bg-brand-red/10 border border-brand-red/20 rounded-lg text-xxs text-brand-red text-center font-bold">
                {submitError}
              </div>
            )}

            {!storeOpen && (
              <div className="p-3 bg-brand-red/25 border border-brand-red/40 rounded-lg text-xxs text-white text-center font-bold">
                🚫 ESTABELECIMENTO FECHADO NO MOMENTO
              </div>
            )}

            <button
              onClick={handleSubmitOrder}
              disabled={submitting || !storeOpen}
              className="w-full rounded-xl bg-brand-red hover:bg-brand-redHover py-3.5 text-center text-sm font-bold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Processando..." : `Confirmar Pedido • R$ ${finalTotal.toFixed(2)}`}
            </button>

          </div>
        )}

      </div>
    </main>
  );
}
