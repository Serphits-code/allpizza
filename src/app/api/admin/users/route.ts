import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/admin/users - Lista todos os usuários
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        driverLat: true,
        driverLng: true,
        driverUpdatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}

// POST /api/admin/users - Cria um novo usuário
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem criar usuários" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, email, password, role, active } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Verifica duplicidade de e-mail
    const existing = await prisma.adminUser.findFirst({
      where: { email: { equals: trimmedEmail, mode: "insensitive" } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail" },
        { status: 409 }
      );
    }

    // Valida role
    const validRole = Object.values(UserRole).includes(role) ? (role as UserRole) : UserRole.KITCHEN;

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.adminUser.create({
      data: {
        name: name.trim(),
        email: trimmedEmail,
        passwordHash,
        role: validRole,
        active: active !== undefined ? Boolean(active) : true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Erro interno ao criar usuário" }, { status: 500 });
  }
}
