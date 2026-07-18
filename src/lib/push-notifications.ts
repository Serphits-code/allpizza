/**
 * Mock de envio de notificações Push para o cliente final.
 * Como o ambiente local não possui chaves VAPID/WebPush ativas,
 * este módulo atua como fallback silencioso imprimindo no console operacional.
 */
export async function notifyCustomerOrderStatus(orderId: string, status: string) {
  console.log(`[PUSH NOTIFICATION] Pedido #${orderId} alterado para o status: ${status}`);
}
