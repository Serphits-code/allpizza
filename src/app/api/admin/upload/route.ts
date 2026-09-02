import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

export async function POST(request: Request) {
  // 1. Autenticação e Autorização RBAC
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Apenas administradores e gerentes podem fazer upload de arquivos" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Validações de Tamanho (Max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande (máximo 10MB)" }, { status: 400 });
    }

    // Validações de Tipo de Mídia (jpg, jpeg, png, webp)
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de arquivo inválido (apenas JPG, PNG, WEBP)" }, { status: 400 });
    }

    // Sanitiza nome do arquivo para salvar como .png otimizado
    const sanitizedBase = path.basename(file.name, path.extname(file.name)).replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `${sanitizedBase}-${Date.now()}.png`;

    // Define diretório de destino local (/public/uploads)
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // Garante que o diretório existe
    await fs.mkdir(uploadDir, { recursive: true });

    // Salva o arquivo no disco otimizado via Sharp (Redimensiona para no máx 800x800 e comprime)
    const filePath = path.join(uploadDir, fileName);
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    
    const optimizedBuffer = await sharp(inputBuffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .png({ quality: 80, compressionLevel: 9, palette: true })
      .toBuffer();

    await fs.writeFile(filePath, optimizedBuffer);

    const relativeUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: relativeUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erro ao processar upload do arquivo" }, { status: 500 });
  }
}

