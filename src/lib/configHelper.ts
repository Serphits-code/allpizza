import { prisma } from "./prisma";

export interface StoreConfig {
  companyName: string;
  companyLogo: string;
  deliveryCities: string[];
  primaryColor: string;
  primaryColorHover: string;
}

export async function getStoreConfig(): Promise<StoreConfig> {
  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    const primaryColor = configMap.get("primary_color") || "#e31837";
    const companyName = configMap.get("company_name") || "Artisanal";
    const companyLogo = configMap.get("company_logo") || "";
    
    const deliveryCitiesRaw = configMap.get("delivery_cities") || "Cachoeirinha";
    const deliveryCities = deliveryCitiesRaw.split(",").map((c) => c.trim()).filter(Boolean);

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

    return {
      companyName,
      companyLogo,
      deliveryCities,
      primaryColor,
      primaryColorHover: calculateHoverColor(primaryColor),
    };
  } catch (err) {
    return {
      companyName: "Artisanal",
      companyLogo: "",
      deliveryCities: ["Cachoeirinha"],
      primaryColor: "#e31837",
      primaryColorHover: "#c2122b",
    };
  }
}
