import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";

export async function POST(request: Request) {
  // 1. Autenticação e Autorização
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Validações de Tamanho (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande (máximo 5MB)" }, { status: 400 });
    }

    // Validações de Tipo de Mídia (jpg, jpeg, png)
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de arquivo inválido (apenas JPG, JPEG, PNG)" }, { status: 400 });
    }

    // Sanitiza nome do arquivo para evitar path traversal ou caracteres estranhos
    const ext = path.extname(file.name);
    const sanitizedBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `${sanitizedBase}-${Date.now()}${ext}`;

    // Define diretório de destino local no VPS (/public/uploads)
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // Garante que o diretório existe
    await fs.mkdir(uploadDir, { recursive: true });

    // Salva o arquivo no disco
    const filePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const relativeUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: relativeUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erro ao processar upload do arquivo" }, { status: 500 });
  }
}
