import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (token) {
      const role = token.role;

      // 1. Controle de acesso para Entregadores (/entregador)
      if (path.startsWith("/entregador")) {
        if (role !== "DRIVER" && role !== "ADMIN" && role !== "MANAGER") {
          return NextResponse.redirect(new URL("/admin/login", req.url));
        }
      }

      // 2. Controle de acesso para Garçons (/garcom)
      if (path.startsWith("/garcom")) {
        if (role !== "GARCOM" && role !== "ADMIN" && role !== "MANAGER") {
          return NextResponse.redirect(new URL("/admin/login", req.url));
        }
      }

      // 3. Controle de acesso para Painel Administrativo (/admin)
      if (path.startsWith("/admin") && path !== "/admin/login") {
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

      // 4. Controle centralizado de APIs (/api/admin, /api/entregador, /api/garcom)
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
    } else if (path.startsWith("/api/")) {
      // Rejeita requisições para APIs protegidas sem token de autenticação
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Permite acesso irrestrito à página de login para evitar loops
        if (path === "/admin/login") {
          return true;
        }

        // Permite que requisições de API passem para o handler do middleware responder JSON (em vez de redirect HTML)
        if (path.startsWith("/api/")) {
          return true;
        }

        // Para qualquer outra página protegida (/admin, /entregador, /garcom), exige token existente
        return !!token;
      },
    },
    pages: {
      signIn: "/admin/login",
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/entregador/:path*",
    "/garcom/:path*",
    "/api/admin/:path*",
    "/api/entregador/:path*",
    "/api/garcom/:path*",
  ],
};
