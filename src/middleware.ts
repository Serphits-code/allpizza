import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // 1. Permite acesso à página de login e rotas de autenticação sem restrições
    if (
      path === "/admin/login" ||
      path.startsWith("/api/admin/auth/") ||
      path.startsWith("/api/auth/")
    ) {
      return NextResponse.next();
    }

    // 2. Permite requisições de API autenticadas via Chave de API / Desktop Electron
    const secretHeader = req.headers.get("x-print-auth") || req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const queryToken = req.nextUrl.searchParams.get("token") || req.nextUrl.searchParams.get("apiKey");
    const providedApiKey = secretHeader || bearerToken || queryToken;

    if (path.startsWith("/api/") && providedApiKey) {
      // Delega a validação de permissões e chaves para authenticateApiRequest nas rotas
      return NextResponse.next();
    }

    // 3. Se NÃO houver token de autenticação:
    if (!token) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      // Sempre redireciona preservando o IP / Host e porta da requisição original (req.url)
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    const role = token.role;

    // 3. Controle de acesso para Entregadores (/entregador)
    if (path.startsWith("/entregador")) {
      if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
    }

    // 4. Controle de acesso para Garçons (/garcom)
    if (path.startsWith("/garcom")) {
      if (role !== "GARCOM" && role !== "ADMIN" && role !== "MANAGER") {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
    }

    // 5. Controle de acesso para Painel Administrativo (/admin)
    if (path.startsWith("/admin")) {
      if (role === "KITCHEN") {
        if (path !== "/admin/pedidos" && !path.startsWith("/api/")) {
          return NextResponse.redirect(new URL("/admin/pedidos", req.url));
        }
      } else if (role === "DRIVER") {
        return NextResponse.redirect(new URL("/entregador", req.url));
      } else if (role === "GARCOM") {
        return NextResponse.redirect(new URL("/garcom", req.url));
      } else if (role !== "ADMIN" && role !== "MANAGER") {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
    }

    // 6. Controle centralizado de APIs (/api/admin, /api/entregador, /api/garcom)
    if (path.startsWith("/api/admin")) {
      const allowedRoles = ["ADMIN", "MANAGER", "GARCOM", "KITCHEN"];
      if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    } else if (path.startsWith("/api/entregador")) {
      if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
        return NextResponse.json({ error: "Acesso restrito a entregadores" }, { status: 403 });
      }
    } else if (path.startsWith("/api/garcom")) {
      if (role !== "GARCOM" && role !== "ADMIN" && role !== "MANAGER") {
        return NextResponse.json({ error: "Acesso restrito a garçons" }, { status: 403 });
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Retorna sempre true para delegar o redirecionamento ao handler com req.url preservando IP da rede
      authorized: () => true,
    },
    pages: {
      signIn: "/admin/login",
    },
    secret: process.env.NEXTAUTH_SECRET || "alldelivery_default_secret_key_change_in_prod",
  }
);

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/entregador",
    "/entregador/:path*",
    "/garcom",
    "/garcom/:path*",
    "/api/admin/:path*",
    "/api/entregador/:path*",
    "/api/garcom/:path*",
  ],
};
