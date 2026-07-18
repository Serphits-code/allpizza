import { expect, test, describe } from "bun:test";
import {
  calcPizzaBasePrice,
  calcCrustPrice,
  calcPizzaItemTotal,
  FlavorInput,
  CrustInput,
} from "./pricing";

const catTradicional = { priceP: 30.0, priceM: 40.0, priceG: 50.0, priceGG: 60.0 };
const catEspecial = { priceP: 35.0, priceM: 45.0, priceG: 55.0, priceGG: 65.0 };
const catPremium = { priceP: 45.0, priceM: 55.0, priceG: 65.0, priceGG: 75.0 };

const flavorMussarela: FlavorInput = { name: "Mussarela", category: catTradicional };
const flavorCalabresa: FlavorInput = { name: "Calabresa", category: catEspecial };
const flavorCamarao: FlavorInput = { name: "Camarão", category: catPremium };

const crustCatupiry: CrustInput = { name: "Catupiry", pricePM: 5.0, priceGGG: 8.0, caracol: false };

describe("Pizza Base Pricing (calcPizzaBasePrice)", () => {
  test("1 Sabor - Tradicional Média", () => {
    const price = calcPizzaBasePrice("M", [flavorMussarela]);
    expect(price).toBe(40.0);
  });

  test("1 Sabor - Especial Grande", () => {
    const price = calcPizzaBasePrice("G", [flavorCalabresa]);
    expect(price).toBe(55.0);
  });

  test("2 Sabores - Tradicional & Especial Média (Regra do Máximo)", () => {
    const price = calcPizzaBasePrice("M", [flavorMussarela, flavorCalabresa]);
    expect(price).toBe(45.0); // Especial Média (45.0) > Tradicional Média (40.0)
  });

  test("3 Sabores - Tradicional, Especial & Premium Grande (Regra do Máximo)", () => {
    const price = calcPizzaBasePrice("G", [flavorMussarela, flavorCalabresa, flavorCamarao]);
    expect(price).toBe(65.0); // Premium Grande (65.0)
  });

  test("Mais que 3 sabores deve lançar erro", () => {
    expect(() => {
      calcPizzaBasePrice("G", [flavorMussarela, flavorCalabresa, flavorCamarao, flavorMussarela]);
    }).toThrow("Uma pizza não pode ter mais de 3 sabores.");
  });

  test("Tamanho inválido deve lançar erro", () => {
    expect(() => {
      calcPizzaBasePrice("INVALID_SIZE", [flavorMussarela]);
    }).toThrow("Tamanho de pizza inválido");
  });
});

describe("Crust Pricing (calcCrustPrice)", () => {
  test("Borda P/M - Catupiry no tamanho M", () => {
    const price = calcCrustPrice("M", crustCatupiry, false);
    expect(price).toBe(5.0);
  });

  test("Borda G/GG - Catupiry no tamanho G", () => {
    const price = calcCrustPrice("G", crustCatupiry, false);
    expect(price).toBe(8.0);
  });

  test("Borda com adicional Caracol", () => {
    const price = calcCrustPrice("G", crustCatupiry, true);
    expect(price).toBe(13.0); // 8.0 + 5.0
  });

  test("Tamanho inválido de borda deve lançar erro", () => {
    expect(() => {
      calcCrustPrice("X", crustCatupiry, false);
    }).toThrow("Tamanho de pizza inválido");
  });
});

describe("Pizza Item Total (calcPizzaItemTotal)", () => {
  test("Pizza Grande de 2 Sabores com Borda Catupiry e Caracol", () => {
    const total = calcPizzaItemTotal(
      "G",
      [flavorMussarela, flavorCalabresa],
      crustCatupiry,
      true
    );
    // Base: Especial G = 55.0
    // Borda: Catupiry G + Caracol = 8.0 + 5.0 = 13.0
    // Total = 55.0 + 13.0 = 68.0
    expect(total).toBe(68.0);
  });

  test("Pizza Média de 1 Sabor sem borda", () => {
    const total = calcPizzaItemTotal("M", [flavorMussarela]);
    expect(total).toBe(40.0);
  });
});
