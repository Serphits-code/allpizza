import { prisma } from "./prisma";

export interface StoreConfig {
  companyName: string;
  companyLogo: string;
  deliveryCities: string[];
  primaryColor: string;
  primaryColorHover: string;
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function sanitizeHexColor(color: string | undefined, defaultColor: string): string {
  if (!color || !HEX_COLOR_REGEX.test(color)) {
    return defaultColor;
  }
  return color;
}

// In-memory cache para configurações da loja (TTL de 60 segundos)
let cachedConfig: StoreConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateStoreConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

export async function getStoreConfig(): Promise<StoreConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    const rawPrimaryColor = configMap.get("primary_color");
    const primaryColor = sanitizeHexColor(rawPrimaryColor, "#e31837");
    const companyName = configMap.get("company_name") || "Artisanal";
    const companyLogo = configMap.get("company_logo") || "";

    const deliveryCitiesRaw = configMap.get("delivery_cities") || "Cachoeirinha";
    const deliveryCities = deliveryCitiesRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // Calcula hover a partir da cor padrão (escurece 15%)
    const calculateHoverColor = (hex: string) => {
      let color = hex.replace("#", "");
      if (color.length !== 6) return "#c2122b";
      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);

      r = Math.max(0, Math.floor(r * 0.85));
      g = Math.max(0, Math.floor(g * 0.85));
      b = Math.max(0, Math.floor(b * 0.85));

      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };

    const config: StoreConfig = {
      companyName,
      companyLogo,
      deliveryCities,
      primaryColor,
      primaryColorHover: calculateHoverColor(primaryColor),
    };

    cachedConfig = config;
    cacheTimestamp = now;

    return config;
  } catch (err) {
    console.error("[ConfigHelper] Erro ao carregar configurações do banco de dados:", err);
    return {
      companyName: "Artisanal",
      companyLogo: "",
      deliveryCities: ["Cachoeirinha"],
      primaryColor: "#e31837",
      primaryColorHover: "#c2122b",
    };
  }
}
