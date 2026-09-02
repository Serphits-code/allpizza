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

        // Para qualquer outra rota protegida (/admin, /entregador, /garcom), exige token existente
        return !!token;
      },
    },
    pages: {
      signIn: "/admin/login",
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/entregador/:path*", "/garcom/:path*"],
};
