import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ApiAuthResult {
  authorized: boolean;
  user: {
    id: string;
    name: string;
    role: string;
  } | null;
  error?: string;
}

/**
 * Autentica requisições tanto de sessões NextAuth (navegador)
 * quanto de serviços autorizados (Electron Desktop / API Key)
 */
// Cache em memória para chave desktop_api_key para evitar roundtrips frequentes ao banco
let cachedApiKey: string | null = null;
let apiKeyCachedAt = 0;
const API_KEY_CACHE_TTL_MS = 60_000;

export function invalidateApiKeyCache(): void {
  cachedApiKey = null;
  apiKeyCachedAt = 0;
}

export async function authenticateApiRequest(
  request: Request,
  allowedRoles: string[] = ["ADMIN", "MANAGER", "GARCOM", "KITCHEN"]
): Promise<ApiAuthResult> {
  // 1. Checa Token / Chave Secreta de API (Header x-print-auth, x-api-key, Bearer ou query param token/apiKey)
  const internalSecret = process.env.PRINT_SERVICE_SECRET || "alldelivery_internal_print_secret";
  const secretHeader = request.headers.get("x-print-auth") || request.headers.get("x-api-key");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  let queryToken: string | null = null;
  try {
    const url = new URL(request.url);
    queryToken = url.searchParams.get("token") || url.searchParams.get("apiKey");
  } catch {
    // URL parsing fallback
  }

  const providedKey = secretHeader || bearerToken || queryToken;

  if (providedKey) {
    // Valida contra o segredo padrão de ambiente
    if (Boolean(internalSecret) && providedKey === internalSecret) {
      return {
        authorized: true,
        user: {
          id: "desktop-electron",
          name: "Central Desktop Electron",
          role: "ADMIN",
        },
      };
    }

    // Valida contra a chave dinâmica cadastrada no banco de dados com cache
    try {
      const now = Date.now();
      let keyVal = cachedApiKey;
      if (!keyVal || now - apiKeyCachedAt >= API_KEY_CACHE_TTL_MS) {
        const dbConfig = await prisma.systemConfig.findUnique({
          where: { key: "desktop_api_key" },
        });
        keyVal = dbConfig?.value?.trim() || "";
        cachedApiKey = keyVal;
        apiKeyCachedAt = now;
      }

      if (keyVal && keyVal === providedKey.trim()) {
        return {
          authorized: true,
          user: {
            id: "desktop-electron",
            name: "Central Desktop Electron",
            role: "ADMIN",
          },
        };
      }
    } catch (err) {
      console.error("Erro ao validar chave desktop_api_key no banco:", err);
    }
  }

  // 2. Checa Sessão NextAuth (Web Browser)
  try {
    const session = await getServerSession(authOptions);
    if (session && session.user && allowedRoles.includes(session.user.role)) {
      return {
        authorized: true,
        user: {
          id: session.user.id || "web-user",
          name: session.user.name || "Usuário",
          role: session.user.role,
        },
      };
    }
  } catch (err) {
    console.error("Erro ao validar sessão NextAuth:", err);
  }

  return {
    authorized: false,
    user: null,
    error: "Não autorizado. Forneça uma chave de acesso válida ou autentique-se no sistema.",
  };
}
