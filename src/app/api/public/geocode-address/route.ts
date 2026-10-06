import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Normalizador de logradouros (remove acentos, pontuação e prefixos como rua, av, etc.)
function normalizeStreet(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") // remove pontuação
    .replace(/\b(rua|r|avenida|av|travessa|tv|praca|pc|alameda|al|rodovia|rod|estrada|est|beco|vila|vl|loteamento|lot|sitio)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// GET /api/public/geocode-address?street=...&number=...&city=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawStreet = searchParams.get("street") || "";
    const rawNumber = searchParams.get("number") || "";
    const city = searchParams.get("city") || "Cachoeirinha";

    const cleanStreet = rawStreet.trim();
    const cleanNumber = rawNumber.trim();
    const normalizedStreet = normalizeStreet(cleanStreet);

    const parsedNum = parseInt(cleanNumber, 10);
    const numInt = isNaN(parsedNum) ? null : parsedNum;

    const isCachoeirinha =
      !city ||
      city.toLowerCase().includes("cachoeirinha") ||
      city.trim() === "";

    // =========================================================================
    // ETAPA 1: BUSCA EXATA NA BASE IBGE CNEFE (Rua + Número Exato em Cachoeirinha)
    // =========================================================================
    if (isCachoeirinha && normalizedStreet.length >= 2 && cleanNumber) {
      // 1.1 Tentativa exata pelo streetNormalized exato
      let match = await prisma.ibgeAddress.findFirst({
        where: {
          streetNormalized: normalizedStreet,
          number: cleanNumber,
        },
      });

      // 1.2 Tentativa parcial (ex: cliente digitou "vicente de paula" e a rua é "sao vicente de paula")
      if (!match && normalizedStreet.length >= 4) {
        match = await prisma.ibgeAddress.findFirst({
          where: {
            streetNormalized: { contains: normalizedStreet },
            number: cleanNumber,
          },
        });
      }

      if (match) {
        return NextResponse.json({
          success: true,
          found: true,
          source: "IBGE_EXACT",
          accuracy: "HOUSE_NUMBER",
          message: "Localizado no número exato do imóvel (IBGE 2022)",
          lat: match.latitude,
          lng: match.longitude,
          matchedAddress: {
            street: match.streetFull,
            number: match.number,
            neighborhood: match.neighborhood,
            city: match.cityName,
          },
        });
      }
    }

    // =========================================================================
    // ETAPA 2: BUSCA PELO NÚMERO MAIS PRÓXIMO NA MESMA RUA (IBGE Cachoeirinha)
    // =========================================================================
    if (isCachoeirinha && normalizedStreet.length >= 3 && numInt !== null) {
      const candidates = await prisma.ibgeAddress.findMany({
        where: {
          OR: [
            { streetNormalized: normalizedStreet },
            { streetNormalized: { contains: normalizedStreet } },
          ],
          numberInt: { not: null, gt: 0 },
        },
        take: 60,
      });

      if (candidates.length > 0) {
        // Ordena pela menor diferença absoluta numérica
        candidates.sort((a, b) => {
          const diffA = Math.abs((a.numberInt || 0) - numInt);
          const diffB = Math.abs((b.numberInt || 0) - numInt);
          return diffA - diffB;
        });

        const closest = candidates[0];
        return NextResponse.json({
          success: true,
          found: true,
          source: "IBGE_NEAREST",
          accuracy: "STREET_NUMBER_NEAR",
          message: `Número ${cleanNumber} aproximado pelo imóvel nº ${closest.number} na mesma rua (IBGE)`,
          lat: closest.latitude,
          lng: closest.longitude,
          nearestNumber: closest.number,
          matchedAddress: {
            street: closest.streetFull,
            number: closest.number,
            neighborhood: closest.neighborhood,
            city: closest.cityName,
          },
        });
      }
    }

    // =========================================================================
    // ETAPA 3: CENTRÓIDE DA RUA NA BASE IBGE (Sem número ou número não achado)
    // =========================================================================
    if (isCachoeirinha && normalizedStreet.length >= 3) {
      const streetPoints = await prisma.ibgeAddress.findMany({
        where: {
          OR: [
            { streetNormalized: normalizedStreet },
            { streetNormalized: { contains: normalizedStreet } },
          ],
        },
        select: {
          latitude: true,
          longitude: true,
          streetFull: true,
          neighborhood: true,
          cityName: true,
        },
        take: 30,
      });

      if (streetPoints.length > 0) {
        const avgLat =
          streetPoints.reduce((acc, p) => acc + p.latitude, 0) / streetPoints.length;
        const avgLng =
          streetPoints.reduce((acc, p) => acc + p.longitude, 0) / streetPoints.length;

        return NextResponse.json({
          success: true,
          found: true,
          source: "IBGE_STREET",
          accuracy: "STREET_CENTROID",
          message: "Rua localizada na base do município (IBGE)",
          lat: avgLat,
          lng: avgLng,
          matchedAddress: {
            street: streetPoints[0].streetFull,
            neighborhood: streetPoints[0].neighborhood,
            city: streetPoints[0].cityName,
          },
        });
      }
    }

    // =========================================================================
    // ETAPA 4: FALLBACK PARA NOMINATIM / OPENSTREETMAP (Comportamento original)
    // =========================================================================
    try {
      const searchQuery = `${cleanStreet}${cleanNumber ? `, ${cleanNumber}` : ""}, ${city}, Pernambuco, Brasil`;
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        searchQuery
      )}&format=json&limit=1`;

      const nomRes = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "AllDeliveryApp/1.0",
        },
        // Timeout de 3 segundos para não prender o usuário
        signal: AbortSignal.timeout(3500),
      });

      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          const lat = parseFloat(nomData[0].lat);
          const lng = parseFloat(nomData[0].lon);

          if (!isNaN(lat) && !isNaN(lng)) {
            return NextResponse.json({
              success: true,
              found: true,
              source: "NOMINATIM_FALLBACK",
              accuracy: "ROAD_CENTROID",
              message: "Localizado no mapa aberto (OpenStreetMap / Meio da Rua)",
              lat,
              lng,
              displayName: nomData[0].display_name,
            });
          }
        }
      }
    } catch (nomErr) {
      console.warn("[Geocode] Falha no fallback Nominatim:", nomErr);
    }

    // =========================================================================
    // ETAPA 5: FALLBACK FINAL - CENTRO DE CACHOEIRINHA - PE
    // =========================================================================
    return NextResponse.json({
      success: true,
      found: false,
      source: "CITY_CENTER_FALLBACK",
      accuracy: "CITY_CENTER",
      message: "Endereço não geocodificado. Posição central da cidade mantida.",
      lat: -8.4849,
      lng: -36.2369,
    });
  } catch (error) {
    console.error("[Geocode API] Erro ao processar geocodificação:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao processar geocodificação",
        lat: -8.4849,
        lng: -36.2369,
      },
      { status: 500 }
    );
  }
}
