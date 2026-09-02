export type GeoJsonPosition = [number, number]; // [lng, lat]

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: GeoJsonPosition[][]; // array of rings (first is exterior ring, subsequent are interior holes)
}

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: GeoJsonPosition[][][]; // array of polygons
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon | { type: string; coordinates: any };

export interface ZoneInput {
  id: string;
  title: string;
  geometry: GeoJsonGeometry | any;
  deliveryFee: number;
  isActive: boolean;
}

/**
 * Helper interno: Verifica se o ponto (lat, lng) está dentro de um único anel de polígono.
 */
function isPointInRing(lat: number, lng: number, ring: GeoJsonPosition[]): boolean {
  if (!ring || ring.length < 3) return false;

  let inside = false;
  const x = lng; // longitude é o eixo X
  const y = lat; // latitude é o eixo Y

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    // Checagem de interseção do raio horizontal
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Verifica se um ponto (lat, lng) está contido em um polígono simples (considerando anel externo e buracos).
 */
function isPointInSinglePolygon(lat: number, lng: number, rings: GeoJsonPosition[][]): boolean {
  if (!rings || rings.length === 0) return false;

  // 1. Deve estar dentro do anel externo (rings[0])
  const inExterior = isPointInRing(lat, lng, rings[0]);
  if (!inExterior) return false;

  // 2. Não pode estar dentro de nenhum dos buracos interiores (rings[1..n])
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(lat, lng, rings[i])) {
      return false; // Está dentro de um buraco
    }
  }

  return true;
}

/**
 * Verifica se um ponto (lat, lng) está contido em uma geometria GeoJSON (Polygon ou MultiPolygon).
 * No GeoJSON, as coordenadas são representadas no formato [lng, lat].
 */
export function isPointInPolygon(lat: number, lng: number, polygonGeoJson: GeoJsonGeometry | null | undefined): boolean {
  if (!polygonGeoJson || !polygonGeoJson.coordinates || !polygonGeoJson.type) {
    return false;
  }

  if (polygonGeoJson.type === "Polygon") {
    return isPointInSinglePolygon(lat, lng, polygonGeoJson.coordinates as GeoJsonPosition[][]);
  }

  if (polygonGeoJson.type === "MultiPolygon") {
    const polygons = polygonGeoJson.coordinates as GeoJsonPosition[][][];
    for (const polyRings of polygons) {
      if (isPointInSinglePolygon(lat, lng, polyRings)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Retorna a zona de entrega ativa que contém o ponto (lat, lng).
 * Desempate determinístico: prioriza a zona ativa com a menor taxa de entrega.
 */
export function findDeliveryZone(lat: number, lng: number, zones: ZoneInput[]): ZoneInput | null {
  if (!zones || zones.length === 0) return null;

  // Filtra e ordena zonas ativas de forma determinística pelo menor valor de frete
  const activeZones = zones
    .filter((z) => z.isActive)
    .sort((a, b) => a.deliveryFee - b.deliveryFee);

  for (const zone of activeZones) {
    try {
      if (isPointInPolygon(lat, lng, zone.geometry)) {
        return zone;
      }
    } catch (err) {
      console.warn(`[Geo] Falha ao verificar ponto na zona ${zone.title || zone.id}:`, err);
    }
  }

  return null;
}

/**
 * Calcula a distância em quilômetros entre dois pontos geográficos usando a fórmula de Haversine.
 * Inclui clamp numérico para evitar NaNs em pontos antípodas decorrentes de imprecisão de float.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Raio médio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  // Clamp para o intervalo seguro [0, 1]
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return R * c;
}
