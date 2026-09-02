import { create } from "zustand";
import { persist } from "zustand/middleware";
import { roundCurrency } from "@/lib/pricing";

export interface CartItemTopping {
  toppingId?: string;
  toppingName: string;
  targetType: string;
  flavorName?: string | null;
  slicesCount: number;
  totalSlices: number;
  price: number;
  quantity?: number;
}

export interface CartItem {
  id: string; // Unique cart item ID (UUID or generated)
  name: string; // e.g. "Pizza Customizada (Calabresa / Mussarela)" or "Coca-Cola 2L"
  isPizza: boolean;
  quantity: number;
  price: number; // Unit price (base + crust + toppings)
  notes?: string;
  // Pizza details
  pizzaSize?: string; // P, M, G, GG
  flavors?: { name: string; categoryName: string; slices?: number }[];
  crustType?: string;
  crustPrice?: number;
  caracolRequested?: boolean;
  toppings?: CartItemTopping[];
  // Product details
  productId?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getCartSubtotal: () => number;
  getCartItemsCount: () => number;
}

function generateSafeCartItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const currentItems = get().items;

        // Se for um produto comum (não pizza), agrupamos por productId e notas
        if (!item.isPizza && item.productId) {
          const existingItemIndex = currentItems.findIndex(
            (i) => i.productId === item.productId && (i.notes || "") === (item.notes || "")
          );

          if (existingItemIndex > -1) {
            const updatedItems = currentItems.map((existing, idx) =>
              idx === existingItemIndex
                ? {
                    ...existing,
                    quantity: existing.quantity + item.quantity,
                    price: item.price, // Atualiza para o preço mais recente caso tenha mudado
                  }
                : existing
            );
            set({ items: updatedItems });
            return;
          }
        }

        // Caso contrário (ou se for pizza), adicionamos como novo item único imutável
        const newItem: CartItem = {
          ...item,
          id: generateSafeCartItemId(),
          price: roundCurrency(item.price),
        };
        set({ items: [...currentItems, newItem] });
      },

      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      getCartSubtotal: () => {
        const total = get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return roundCurrency(total);
      },

      getCartItemsCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: "alldelivery-cart-storage",
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || !persistedState) {
          return { items: [] };
        }
        return persistedState as CartState;
      },
    }
  )
);
