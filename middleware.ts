import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Se o usuário está autenticado
    if (token) {
      const role = token.role;

      // KITCHEN role: Apenas pode acessar o Kanban de Pedidos (/admin/pedidos)
      if (role === "KITCHEN") {
        if (path !== "/admin/pedidos" && !path.startsWith("/api/")) {
          return NextResponse.redirect(new URL("/admin/pedidos", req.url));
        }
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        
        // Permite acesso irrestrito à página de login para evitar loops de redirecionamento
        if (path === "/admin/login") {
          return true;
        }

        // Para qualquer outra rota /admin, exige autenticação (token existente)
        return !!token;
      },
    },
    pages: {
      signIn: "/admin/login",
    },
  }
);

export const config = {
  matcher: ["/admin/:path*"],
};
