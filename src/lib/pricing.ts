export interface PizzaCategoryPrice {
  priceP: number;
  priceM: number;
  priceG: number;
  priceGG: number;
}

export interface FlavorInput {
  name: string;
  category: PizzaCategoryPrice;
}

export interface CrustInput {
  name: string;
  pricePM: number;
  priceGGG: number;
  caracol?: boolean;
}

export interface ToppingInput {
  id?: string;
  name: string;
  pricePM: number;
  priceGGG: number;
  isUnit: boolean;
}

export interface SelectedToppingItem {
  topping: ToppingInput;
  targetType: "FULL" | "FLAVOR" | "INTEIRA" | string;
  flavorName?: string | null;
  slicesCount: number; // Ex: 4 fatias
  totalSlices: number; // Ex: 8 fatias
  quantity?: number;   // Quantidade do adicional (padrão 1)
}

/**
 * Arredonda um valor monetário para 2 casas decimais com precisão segura.
 */
export function roundCurrency(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Retorna o preço correspondente ao tamanho na categoria de preço.
 */
export function getCategoryPriceForSize(category: PizzaCategoryPrice, size: string): number {
  const normSize = (size || "").toUpperCase().trim();
  switch (normSize) {
    case "P":
      return roundCurrency(category.priceP);
    case "M":
      return roundCurrency(category.priceM);
    case "G":
      return roundCurrency(category.priceG);
    case "GG":
      return roundCurrency(category.priceGG);
    default:
      throw new Error(`Tamanho de pizza inválido: ${size}`);
  }
}

/**
 * Calcula o preço proporcional de um adicional.
 */
export function calcSingleToppingPrice(
  topping: ToppingInput,
  size: string,
  slicesCount: number,
  totalSlices: number,
  quantity: number = 1
): number {
  const normSize = (size || "").toUpperCase().trim();
  let basePrice = 0;

  if (normSize === "P" || normSize === "M") {
    basePrice = topping.pricePM;
  } else if (normSize === "G" || normSize === "GG") {
    basePrice = topping.priceGGG;
  } else {
    throw new Error(`Tamanho de pizza inválido para cálculo de adicionais: ${size}`);
  }

  const validQty = typeof quantity === "number" ? Math.max(0, quantity) : 1;
  if (validQty === 0) return 0;

  if (topping.isUnit) {
    return roundCurrency(basePrice * validQty);
  }

  const fraction = totalSlices > 0 ? slicesCount / totalSlices : 1;
  return roundCurrency(basePrice * fraction * validQty);
}

/**
 * Calcula a soma de todos os adicionais da pizza.
 */
export function calcAllToppingsTotal(
  toppings: SelectedToppingItem[],
  size: string
): number {
  if (!toppings || toppings.length === 0) return 0;
  const total = toppings.reduce((acc, item) => {
    const qty = typeof item.quantity === "number" ? item.quantity : 1;
    return acc + calcSingleToppingPrice(item.topping, size, item.slicesCount, item.totalSlices, qty);
  }, 0);
  return roundCurrency(total);
}

/**
 * Calcula o preço base de uma pizza fracionada (de 1 a 3 sabores).
 * Regra: Preço da categoria de maior valor monetário entre os sabores.
 */
export function calcPizzaBasePrice(size: string, flavors: FlavorInput[]): number {
  if (!flavors || flavors.length === 0) {
    return 0;
  }
  if (flavors.length > 3) {
    throw new Error("Uma pizza não pode ter mais de 3 sabores.");
  }

  let maxPrice = 0;
  for (const flavor of flavors) {
    const price = getCategoryPriceForSize(flavor.category, size);
    if (price > maxPrice) {
      maxPrice = price;
    }
  }
  return roundCurrency(maxPrice);
}

/**
 * Calcula o preço da borda recheada.
 * Regra: Preço por faixa (P/M vs G/GG) + taxa adicional se caracol for solicitado.
 */
export function calcCrustPrice(size: string, crust: CrustInput, caracolRequested: boolean = false, caracolFee: number = 5.00): number {
  const normSize = (size || "").toUpperCase().trim();
  let basePrice = 0;

  if (normSize === "P" || normSize === "M") {
    basePrice = crust.pricePM;
  } else if (normSize === "G" || normSize === "GG") {
    basePrice = crust.priceGGG;
  } else {
    throw new Error(`Tamanho de pizza inválido para cálculo de borda: ${size}`);
  }

  // Se a borda caracol for solicitada, adicionamos a taxa correspondente
  if (caracolRequested) {
    basePrice += caracolFee;
  }

  return roundCurrency(basePrice);
}

/**
 * Calcula o preço total de um item de pizza (base + borda + adicionais).
 */
export function calcPizzaItemTotal(
  size: string,
  flavors: FlavorInput[],
  crust?: CrustInput | null,
  caracolRequested: boolean = false,
  toppings: SelectedToppingItem[] = [],
  caracolFee: number = 5.00
): number {
  const basePrice = calcPizzaBasePrice(size, flavors);
  const crustPrice = crust ? calcCrustPrice(size, crust, caracolRequested, caracolFee) : 0;
  const toppingsPrice = calcAllToppingsTotal(toppings, size);
  return roundCurrency(basePrice + crustPrice + toppingsPrice);
}
