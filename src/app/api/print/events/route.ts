import { sseManager } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET() {
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
