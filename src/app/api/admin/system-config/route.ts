import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateStoreConfigCache } from "@/lib/configHelper";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    return NextResponse.json({
      companyName: configMap.get("company_name") || "Artisanal",
      companyLogo: configMap.get("company_logo") || "",
      deliveryCities: configMap.get("delivery_cities") || "Cachoeirinha",
      primaryColor: configMap.get("primary_color") || "#e31837",
      depotLat: configMap.get("vroom_depot_lat") || "-8.05",
      depotLng: configMap.get("vroom_depot_lng") || "-34.90",
    });
  } catch (error) {
    console.error("Error reading system configs:", error);
    return NextResponse.json({ error: "Erro ao ler configurações" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Apenas administradores e gerentes podem alterar configurações" }, { status: 403 });
  }

  try {
    const { companyName, companyLogo, deliveryCities, primaryColor, depotLat, depotLng } = await request.json();

    // Validação estrita de formato de cor hexadecimal para prevenir CSS Injection
    let safePrimaryColor = "#e31837";
    if (primaryColor && typeof primaryColor === "string") {
      if (HEX_COLOR_REGEX.test(primaryColor.trim())) {
        safePrimaryColor = primaryColor.trim();
      } else {
        return NextResponse.json(
          { error: "Formato de cor inválido. Utilize o formato hexadecimal #RRGGBB (ex: #e31837)." },
          { status: 400 }
        );
      }
    }

    const updates = [
      { key: "company_name", value: companyName || "Artisanal" },
      { key: "company_logo", value: companyLogo || "" },
      { key: "delivery_cities", value: deliveryCities || "Cachoeirinha" },
      { key: "primary_color", value: safePrimaryColor },
      { key: "vroom_depot_lat", value: String(depotLat || "-8.05") },
      { key: "vroom_depot_lng", value: String(depotLng || "-34.90") },
      { key: "depotLat", value: String(depotLat || "-8.05") },
      { key: "depotLng", value: String(depotLng || "-34.90") },
    ];

    for (const update of updates) {
      await prisma.systemConfig.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      });
    }

    // Invalida cache de configurações em memória
    invalidateStoreConfigCache();

    // Limpa rotas antigas em cache para forçar recálculo na nova sede
    await prisma.driverActiveRoute.deleteMany({});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating system configs:", error);
    return NextResponse.json({ error: "Erro ao salvar configurações" }, { status: 500 });
  }
}
