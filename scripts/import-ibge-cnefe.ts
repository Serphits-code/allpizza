import fs from "fs";
import path from "path";
import readline from "readline";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function normalizeStreetName(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") // remove pontuação
    // remove prefixos comuns de tipo de logradouro
    .replace(/\b(rua|r|avenida|av|travessa|tv|praca|pc|alameda|al|rodovia|rod|estrada|est|beco|vila|vl|loteamento|lot|sitio)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const csvPath = path.resolve(process.cwd(), "2603108_CACHOEIRINHA.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  console.log(`[IBGE CNEFE] Iniciando importação da base de Cachoeirinha...`);
  console.log(`[IBGE CNEFE] Arquivo: ${csvPath}`);

  // Limpa registros anteriores de Cachoeirinha para re-importação limpa e idempotente
  const deleted = await prisma.ibgeAddress.deleteMany({
    where: { cityCode: "2603108" },
  });
  console.log(`[IBGE CNEFE] Registros anteriores removidos: ${deleted.count}`);

  const fileStream = fs.createReadStream(csvPath, { encoding: "latin1" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  const batchSize = 1000;
  let batch: any[] = [];
  let totalInserted = 0;

  for await (const line of rl) {
    lineNumber++;
    if (lineNumber === 1) continue; // Pula cabeçalho

    const parts = line.split(";");
    if (parts.length < 28) continue;

    const neighborhood = (parts[9] || "").trim() || null;
    const streetType = (parts[10] || "").trim() || null;
    const streetTitle = (parts[11] || "").trim() || null;
    const rawStreetName = (parts[12] || "").trim();
    const rawNumber = (parts[13] || "").trim();

    const rawLat = parts[25] || "";
    const rawLng = parts[26] || "";

    const lat = parseFloat(rawLat.replace(",", "."));
    const lng = parseFloat(rawLng.replace(",", "."));

    if (isNaN(lat) || isNaN(lng)) continue;

    const streetFull = [streetType, streetTitle, rawStreetName].filter(Boolean).join(" ").trim();
    if (!streetFull) continue;

    const streetNormalized = normalizeStreetName(streetFull);
    if (!streetNormalized) continue;

    const numberClean = rawNumber || "0";
    const parsedNum = parseInt(numberClean, 10);
    const numberInt = isNaN(parsedNum) ? null : parsedNum;

    const complementPart1 = (parts[15] || "").trim();
    const complementPart2 = (parts[16] || "").trim();
    const complement = [complementPart1, complementPart2].filter(Boolean).join(" ").trim() || null;

    batch.push({
      cityCode: "2603108",
      cityName: "Cachoeirinha",
      neighborhood,
      streetType,
      streetTitle,
      streetName: rawStreetName,
      streetFull,
      streetNormalized,
      number: numberClean,
      numberInt,
      complement,
      latitude: lat,
      longitude: lng,
    });

    if (batch.length >= batchSize) {
      await prisma.ibgeAddress.createMany({ data: batch });
      totalInserted += batch.length;
      console.log(`[IBGE CNEFE] Inseridos: ${totalInserted} registros...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await prisma.ibgeAddress.createMany({ data: batch });
    totalInserted += batch.length;
  }

  console.log(`[IBGE CNEFE] ✅ Importação concluída com sucesso!`);
  console.log(`[IBGE CNEFE] Total de endereços georreferenciados cadastrados: ${totalInserted}`);
}

main()
  .catch((err) => {
    console.error("[IBGE CNEFE] Erro na importação:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
