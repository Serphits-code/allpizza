export interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

class SseManager {
  private clients: Set<SseClient> = new Set();

  /**
   * Registra um novo cliente conectado
   */
  public subscribe(client: SseClient) {
    this.clients.add(client);
    console.log(`[SSE] Cliente conectado: ${client.id}. Total ativos: ${this.clients.size}`);
  }

  /**
   * Remove um cliente por ID
   */
  public unsubscribe(id: string) {
    for (const client of this.clients) {
      if (client.id === id) {
        this.clients.delete(client);
        console.log(`[SSE] Cliente desconectado: ${id}. Total ativos: ${this.clients.size}`);
        break;
      }
    }
  }

  /**
   * Retorna a quantidade de clientes ativos
   */
  public getActiveCount(): number {
    return this.clients.size;
  }

  /**
   * Envia um payload JSON para todos os clientes conectados.
   */
  public publish(event: string, payload: any) {
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);

    let deadClients: string[] = [];

    for (const client of this.clients) {
      try {
        client.controller.enqueue(encodedData);
      } catch (err) {
        console.warn(`[SSE] Falha ao enviar dados para o cliente ${client.id}, marcando para remoção.`, err);
        deadClients.push(client.id);
      }
    }

    // Limpa clientes inativos
    for (const id of deadClients) {
      this.unsubscribe(id);
    }
  }

  /**
   * Envia um ping/heartbeat para manter a conexão viva.
   */
  public sendHeartbeat() {
    if (this.clients.size === 0) return;
    
    const data = `event: ping\ndata: {}\n\n`;
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);

    let deadClients: string[] = [];
    for (const client of this.clients) {
      try {
        client.controller.enqueue(encodedData);
      } catch (err) {
        deadClients.push(client.id);
      }
    }

    for (const id of deadClients) {
      this.unsubscribe(id);
    }
  }
}

// Singleton global para persistência em memória (HMR compatível no Next.js)
const globalForSse = globalThis as unknown as {
  sseManager: SseManager | undefined;
};

export const sseManager = globalForSse.sseManager ?? new SseManager();
globalForSse.sseManager = sseManager;

// Inicia o intervalo de heartbeat a cada 15 segundos se disponível no runtime
if (typeof setInterval !== "undefined") {
  const HEARTBEAT_INTERVAL = 15000;
  const globalInterval = globalThis as unknown as { sseInterval: any };
  if (!globalInterval.sseInterval) {
    globalInterval.sseInterval = setInterval(() => {
      sseManager.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }
}
