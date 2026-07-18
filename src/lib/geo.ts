/**
 * Verifica se um ponto (lat, lng) está contido em um polígono GeoJSON.
 * No GeoJSON, as coordenadas são representadas como [lng, lat].
 */
export function isPointInPolygon(lat: number, lng: number, polygonGeoJson: any): boolean {
  if (!polygonGeoJson || !polygonGeoJson.coordinates || polygonGeoJson.type !== "Polygon") {
    return false;
  }

  // O anel externo do polígono é o primeiro array em coordinates
  const ring = polygonGeoJson.coordinates[0];
  if (!ring || ring.length < 3) {
    return false;
  }

  let inside = false;
  const x = lng; // longitude é o eixo X
  const y = lat; // latitude é o eixo Y

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

export interface ZoneInput {
  id: string;
  title: string;
  geometry: any; // GeoJSON
  deliveryFee: number;
  isActive: boolean;
}

/**
 * Retorna a primeira zona de entrega ativa que contém o ponto (lat, lng).
 */
export function findDeliveryZone(lat: number, lng: number, zones: ZoneInput[]): ZoneInput | null {
  for (const zone of zones) {
    if (zone.isActive && isPointInPolygon(lat, lng, zone.geometry)) {
      return zone;
    }
  }
  return null;
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula de Haversine.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
