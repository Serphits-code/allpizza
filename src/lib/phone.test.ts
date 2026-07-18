import { expect, test, describe } from "bun:test";
import { normalizeContactPhoneKey } from "./phone";

describe("Phone Normalization (normalizeContactPhoneKey)", () => {
  test("Remove caracteres não-numéricos", () => {
    const raw = "(81) 99999-9999";
    expect(normalizeContactPhoneKey(raw)).toBe("81999999999");
  });

  test("Remove zeros à esquerda", () => {
    const raw = "081999999999";
    expect(normalizeContactPhoneKey(raw)).toBe("81999999999");
  });

  test("Remove prefixo 55 se o comprimento for 13 (55 + DDD + 9 dígitos)", () => {
    const raw = "5581999999999";
    expect(normalizeContactPhoneKey(raw)).toBe("81999999999");
  });

  test("Remove prefixo 55 se o comprimento for 12 (55 + DDD + 8 dígitos)", () => {
    const raw = "558188888888";
    expect(normalizeContactPhoneKey(raw)).toBe("8188888888");
  });

  test("Trunca para os 11 dígitos finais se exceder 11 e não aplicar regra do 55", () => {
    const raw = "9999999999999"; // 13 dígitos
    expect(normalizeContactPhoneKey(raw)).toBe("99999999999"); // últimos 11
  });

  test("Caso ideal: 11 dígitos limpos", () => {
    const raw = "81999999999";
    expect(normalizeContactPhoneKey(raw)).toBe("81999999999");
  });

  test("Valores nulos, vazios ou indefinidos", () => {
    expect(normalizeContactPhoneKey("")).toBe("");
    expect(normalizeContactPhoneKey(null as any)).toBe("");
    expect(normalizeContactPhoneKey(undefined as any)).toBe("");
  });
});
