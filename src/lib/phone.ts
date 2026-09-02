/**
 * Normaliza um número de telefone para chave única de contato no padrão nacional brasileiro.
 * 
 * Regras:
 * 1. Remove caracteres não-numéricos (\D)
 * 2. Remove zeros à esquerda
 * 3. Se possuir prefixo DDI 55 (Brasil):
 *    - Remove o 55 quando o restante formar um número válido (10 a 12 dígitos, ex: 55 + DDD + 8/9 dígitos, com ou sem 0 de operadora)
 * 4. Remove eventuais zeros à esquerda remanescentes após remoção de DDI (ex: 55081999999999 -> 81999999999)
 * 5. Preserva a integridade do número sem truncamento arbitrário de DDD que cause colisões
 */
export function normalizeContactPhoneKey(raw: string): string {
  if (!raw) return "";

  // 1. Limpa caracteres não numéricos
  let cleaned = raw.replace(/\D/g, "");

  // 2. Remove zeros à esquerda iniciais
  cleaned = cleaned.replace(/^0+/, "");

  // 3. Trata prefixo internacional brasileiro (55)
  if (cleaned.startsWith("55") && cleaned.length >= 12) {
    const withoutDDI = cleaned.slice(2).replace(/^0+/, "");
    // Se o restante tiver entre 10 e 11 dígitos (DDD + 8 ou 9 dígitos), aceita a remoção do 55
    if (withoutDDI.length >= 10 && withoutDDI.length <= 11) {
      cleaned = withoutDDI;
    } else if (cleaned.length === 12 || cleaned.length === 13 || cleaned.length === 14) {
      cleaned = withoutDDI;
    }
  }

  return cleaned;
}
