import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

// Dummy hash para mitigar timing attacks na enumeração de usuários
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF01234567890123456789";

// Fail-fast para NEXTAUTH_SECRET
if (!process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: NEXTAUTH_SECRET não está definido nas variáveis de ambiente! Defina uma chave secreta segura para produção.");
  } else {
    console.warn("AVISO DE SEGURANÇA: NEXTAUTH_SECRET não definido em ambiente de desenvolvimento. Usando segredo temporário local.");
  }
}

// Cache curto em memória para papéis (roles) de usuários para evitar queries excessivas ao banco
interface RoleCacheEntry {
  role: UserRole;
  cachedAt: number;
}
const roleCache = new Map<string, RoleCacheEntry>();
const ROLE_CACHE_TTL_MS = 30_000; // 30 segundos

export function invalidateUserRoleCache(userId?: string) {
  if (userId) {
    roleCache.delete(userId);
  } else {
    roleCache.clear();
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Por favor, preencha e-mail e senha.");
        }

        const trimmedEmail = credentials.email.trim().toLowerCase();
        const user = await prisma.adminUser.findFirst({
          where: {
            email: {
              equals: trimmedEmail,
              mode: "insensitive",
            },
          },
        });

        // Se usuário não existir, executa compare contra hash dummy para evitar timing attack
        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_HASH).catch(() => {});
          throw new Error("E-mail ou senha incorretos.");
        }

        // Se a conta estiver desativada, executa compare para uniformizar timing e retorna erro genérico
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid || !user.active) {
          throw new Error("E-mail ou senha incorretos.");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }

      // Busca papel atualizado com cache de 30 segundos
      if (token.id) {
        const userId = token.id as string;
        const now = Date.now();
        const cached = roleCache.get(userId);

        if (cached && now - cached.cachedAt < ROLE_CACHE_TTL_MS) {
          token.role = cached.role;
        } else {
          try {
            const dbUser = await prisma.adminUser.findUnique({
              where: { id: userId },
              select: { role: true, active: true },
            });
            if (dbUser && dbUser.active) {
              token.role = dbUser.role;
              roleCache.set(userId, { role: dbUser.role, cachedAt: now });
            }
          } catch (err) {
            console.error("[Auth JWT] Error fetching user role:", err);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        const b = new URL(baseUrl);
        if (u.origin === b.origin) return url;
      } catch {
        // Fallback caso a URL seja inválida
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 horas
  },
  secret: process.env.NEXTAUTH_SECRET || "alldelivery_default_secret_key_change_in_prod",
};
