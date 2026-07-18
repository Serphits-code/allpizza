import { expect, test, describe } from "bun:test";
import { isPointInPolygon, findDeliveryZone, ZoneInput } from "./geo";

// Definição de polígono de teste (retângulo ao redor de Recife/centro)
// Coordenadas GeoJSON: [longitude, latitude]
const mockPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-34.95, -8.10], // Sudoeste
      [-34.85, -8.10], // Sudeste
      [-34.85, -8.00], // Nordeste
      [-34.95, -8.00], // Noroeste
      [-34.95, -8.10], // Fechamento (igual ao primeiro)
    ]
  ]
};

const zoneCentro: ZoneInput = {
  id: "zone-1",
  title: "Zona Centro",
  geometry: mockPolygon,
  deliveryFee: 5.0,
  isActive: true,
};

const zoneSul: ZoneInput = {
  id: "zone-2",
  title: "Zona Sul",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-34.95, -8.20],
        [-34.85, -8.20],
        [-34.85, -8.11],
        [-34.95, -8.11],
        [-34.95, -8.20],
      ]
    ]
  },
  deliveryFee: 10.0,
  isActive: true,
};

describe("Ray-Casting Point-in-Polygon (isPointInPolygon)", () => {
  test("Ponto no centro do polígono deve estar dentro", () => {
    // Latitude -8.05, Longitude -34.90
    const inside = isPointInPolygon(-8.05, -34.90, mockPolygon);
    expect(inside).toBe(true);
  });

  test("Ponto longe do polígono deve estar fora", () => {
    const inside = isPointInPolygon(-8.30, -35.00, mockPolygon);
    expect(inside).toBe(false);
  });

  test("Ponto na mesma longitude mas latitude norte deve estar fora", () => {
    const inside = isPointInPolygon(-7.90, -34.90, mockPolygon);
    expect(inside).toBe(false);
  });

  test("Polígono inválido ou nulo deve retornar false", () => {
    expect(isPointInPolygon(-8.05, -34.90, null)).toBe(false);
    expect(isPointInPolygon(-8.05, -34.90, { type: "Point" })).toBe(false);
  });
});

describe("Find Delivery Zone (findDeliveryZone)", () => {
  test("Encontra a zona correspondente para coordenada no centro", () => {
    const zone = findDeliveryZone(-8.05, -34.90, [zoneCentro, zoneSul]);
    expect(zone).not.toBeNull();
    expect(zone?.id).toBe("zone-1");
  });

  test("Encontra a zona correspondente na zona sul", () => {
    const zone = findDeliveryZone(-8.15, -34.90, [zoneCentro, zoneSul]);
    expect(zone).not.toBeNull();
    expect(zone?.id).toBe("zone-2");
  });

  test("Retorna null se a coordenada estiver fora de todas as zonas", () => {
    const zone = findDeliveryZone(-8.30, -34.90, [zoneCentro, zoneSul]);
    expect(zone).toBeNull();
  });

  test("Ignora zonas inativas", () => {
    const inactiveZone = { ...zoneCentro, isActive: false };
    const zone = findDeliveryZone(-8.05, -34.90, [inactiveZone, zoneSul]);
    expect(zone).toBeNull(); // Estaria na zonaCentro, mas ela está inativa
  });
});
