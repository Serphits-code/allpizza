import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Dummy hash para mitigar timing attacks
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF01234567890123456789";

// Rate limiter: 5 tentativas por minuto por IP
const loginRateLimiter = rateLimit({
  interval: 60_000,
  uniqueTokenPerInterval: 500,
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResult = loginRateLimiter.check(5, `login_${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Por favor, aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Por favor, preencha o e-mail e a senha." },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.adminUser.findFirst({
      where: {
        email: {
          equals: trimmedEmail,
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH).catch(() => {});
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch || !user.active) {
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login check error:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao validar credenciais." },
      { status: 500 }
    );
  }
}
