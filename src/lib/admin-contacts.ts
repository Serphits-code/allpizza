import { normalizeContactPhoneKey } from "@/lib/phone";

export interface AggregatedContact {
  phoneKey: string;
  displayName: string;
  rawCustomerName: string;
  totalOrders: number;
  validOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number;
  favoriteCategory: string;
  hasNotes: boolean;
  notesPreview: string;
  notes: string;
  displayNameOverride: string;
}

export interface ContactAddress {
  address: string;
  number: string;
  reference?: string;
  type: string;
  lastUsedAt: string;
}

export interface ContactDetail {
  phoneKey: string;
  displayName: string;
  notes: string;
  displayNameOverride: string;
  totalOrders: number;
  validOrders: number;
  totalSpent: number;
  averageDeliveryMinutes: number;
  canceledOrders: number;
  favoriteCategory: string;
  lastOrderAt: string | null;
  daysSinceLastOrder: number;
  addresses: ContactAddress[];
  orders: any[];
}

/**
 * Agrega pedidos brutos e perfis salvos em uma lista consolidada de contatos
 */
export function aggregateContacts(orders: any[], profiles: any[]): AggregatedContact[] {
  const profileMap = new Map<string, any>();
  for (const p of profiles) {
    if (p.phoneKey) profileMap.set(p.phoneKey, p);
  }

  // Agrupa pedidos por chave de telefone normalizada
  const groupMap = new Map<string, any[]>();
  for (const order of orders) {
    const rawPhone = order.customerPhone;
    if (!rawPhone) continue;
    const phoneKey = normalizeContactPhoneKey(rawPhone);
    if (!phoneKey) continue;

    const list = groupMap.get(phoneKey) || [];
    list.push(order);
    groupMap.set(phoneKey, list);
  }

  // Também inclui perfis que possam não ter pedidos recentes no período
  for (const [phoneKey] of profileMap.entries()) {
    if (!groupMap.has(phoneKey)) {
      groupMap.set(phoneKey, []);
    }
  }

  const now = new Date().getTime();
  const results: AggregatedContact[] = [];

  for (const [phoneKey, customerOrders] of groupMap.entries()) {
    const profile = profileMap.get(phoneKey);
    const notes = profile?.notes || "";
    const displayNameOverride = profile?.displayNameOverride || "";

    // Ordena pedidos do cliente pelo mais recente
    customerOrders.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const latestOrder = customerOrders[0];
    const rawCustomerName = latestOrder?.customerName || "Cliente Sem Nome";
    const displayName = displayNameOverride.trim() !== "" ? displayNameOverride : rawCustomerName;

    const totalOrders = customerOrders.length;
    const billableOrders = customerOrders.filter((o) => o.status !== "CANCELADO");
    const validOrders = billableOrders.length;
    const totalSpent = Math.round(billableOrders.reduce((sum, o) => sum + (o.total || 0), 0) * 100) / 100;

    let lastOrderAt: string | null = null;
    let daysSinceLastOrder = 9999;

    if (latestOrder) {
      lastOrderAt = new Date(latestOrder.createdAt).toISOString();
      const diffMs = now - new Date(latestOrder.createdAt).getTime();
      daysSinceLastOrder = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Calcula categoria favorita (baseada nas categorias das pizzas/produtos dos itens)
    const categoryCount = new Map<string, number>();
    for (const ord of billableOrders) {
      const seenInOrder = new Set<string>();
      for (const item of ord.items || []) {
        for (const flavor of item.flavors || []) {
          const cat = flavor.categoryName || "Pizzas";
          if (!seenInOrder.has(cat)) {
            seenInOrder.add(cat);
            categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
          }
        }
      }
    }

    let favoriteCategory = "Diversos";
    let maxCount = 0;
    for (const [cat, cnt] of categoryCount.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        favoriteCategory = cat;
      }
    }

    const hasNotes = notes.trim() !== "" || displayNameOverride.trim() !== "";
    const notesPreview = notes.length > 120 ? notes.slice(0, 117) + "..." : notes;

    results.push({
      phoneKey,
      displayName,
      rawCustomerName,
      totalOrders,
      validOrders,
      totalSpent,
      lastOrderAt,
      daysSinceLastOrder,
      favoriteCategory,
      hasNotes,
      notesPreview,
      notes,
      displayNameOverride,
    });
  }

  return results;
}
