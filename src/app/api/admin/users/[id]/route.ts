import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/:id - Atualiza usuário
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem editar usuários" }, { status: 403 });
  }

  const { id } = params;

  try {
    const body = await request.json();
    const { name, email, password, role, active } = body;

    const existingUser = await prisma.adminUser.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Impede que o admin desative a si próprio
    if (session.user.id === id && active === false) {
      return NextResponse.json(
        { error: "Você não pode desativar sua própria conta de administrador" },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) {
      const trimmedEmail = email.trim().toLowerCase();
      // Verifica se outro usuário já tem esse email
      const emailConflict = await prisma.adminUser.findFirst({
        where: {
          email: { equals: trimmedEmail, mode: "insensitive" },
          NOT: { id },
        },
      });
      if (emailConflict) {
        return NextResponse.json(
          { error: "Este e-mail já está em uso por outro usuário" },
          { status: 409 }
        );
      }
      updateData.email = trimmedEmail;
    }

    if (role !== undefined && Object.values(UserRole).includes(role)) {
      updateData.role = role as UserRole;
    }

    if (active !== undefined) {
      updateData.active = Boolean(active);
    }

    if (password && password.trim() !== "") {
      updateData.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const updatedUser = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

// DELETE /api/admin/users/:id - Remove usuário
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir usuários" }, { status: 403 });
  }

  const { id } = params;

  // Bloqueia autoexclusão
  if (session.user.id === id) {
    return NextResponse.json(
      { error: "Você não pode excluir sua própria conta de administrador" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.adminUser.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Se o usuário tiver pedidos vinculados (ex: entregador), removemos ou desvinculamos antes
    await prisma.driverActiveRoute.deleteMany({ where: { driverId: id } });
    await prisma.order.updateMany({
      where: { driverId: id },
      data: { driverId: null },
    });

    await prisma.adminUser.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Usuário removido com sucesso" });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Erro ao excluir usuário" }, { status: 500 });
  }
}
