import { sseManager } from "@/lib/sse";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Autenticação obrigatória: sessões de equipe ou chave secreta de API
  const auth = await authenticateApiRequest(request);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: auth.error || "Não autorizado" }), {
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
