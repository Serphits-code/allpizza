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
  caracol: boolean;
}

/**
 * Retorna o preço correspondente ao tamanho na categoria de preço.
 */
export function getCategoryPriceForSize(category: PizzaCategoryPrice, size: string): number {
  const normSize = size.toUpperCase();
  switch (normSize) {
    case "P":
      return category.priceP;
    case "M":
      return category.priceM;
    case "G":
      return category.priceG;
    case "GG":
      return category.priceGG;
    default:
      throw new Error(`Tamanho de pizza inválido: ${size}`);
  }
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
  return maxPrice;
}

/**
 * Calcula o preço da borda recheada.
 * Regra: Preço por faixa (P/M vs G/GG) + taxa adicional se caracol for solicitado.
 */
export function calcCrustPrice(size: string, crust: CrustInput, caracolRequested: boolean = false): number {
  const normSize = size.toUpperCase();
  let basePrice = 0;

  if (normSize === "P" || normSize === "M") {
    basePrice = crust.pricePM;
  } else if (normSize === "G" || normSize === "GG") {
    basePrice = crust.priceGGG;
  } else {
    throw new Error(`Tamanho de pizza inválido para cálculo de borda: ${size}`);
  }

  // Se a borda caracol for solicitada, adicionamos a taxa de R$ 5.00
  if (caracolRequested) {
    basePrice += 5.00;
  }

  return basePrice;
}

/**
 * Calcula o preço total de um item de pizza (base + borda).
 */
export function calcPizzaItemTotal(
  size: string,
  flavors: FlavorInput[],
  crust?: CrustInput,
  caracolRequested: boolean = false
): number {
  const basePrice = calcPizzaBasePrice(size, flavors);
  const crustPrice = crust ? calcCrustPrice(size, crust, caracolRequested) : 0;
  return basePrice + crustPrice;
}
