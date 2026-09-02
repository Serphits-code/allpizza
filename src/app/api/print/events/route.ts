import { sseManager } from "@/lib/sse";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Autenticação obrigatória: apenas usuários autenticados da equipe (ou token interno) podem escutar o barramento SSE
  const session = await getServerSession(authOptions);
  
  // Permite autenticação via header secreto ou query param para daemon desktop
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  const secretHeader = request.headers.get("x-print-auth");
  const internalSecret = process.env.PRINT_SERVICE_SECRET || "alldelivery_internal_print_secret";

  const isSecretValid =
    Boolean(internalSecret) &&
    ((secretHeader && secretHeader === internalSecret) ||
      (queryToken && queryToken === internalSecret));

  if (!session && !isSecretValid) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      sseManager.subscribe({ id: clientId, controller });

      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`)
      );
    },
    cancel() {
      sseManager.unsubscribe(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
