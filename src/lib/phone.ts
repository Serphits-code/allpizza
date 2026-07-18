/**
 * Normaliza um número de telefone para o formato interno de 11 dígitos (DDD + 9 dígitos)
 * seguindo as regras de higienização especificadas.
 * 
 * Regras:
 * 1. Remove caracteres não-numéricos (\D)
 * 2. Remove zeros à esquerda
 * 3. Se possuir prefixo 55 e tiver 12 ou 13 caracteres de comprimento, remove o 55
 * 4. Se o comprimento final exceder 11 dígitos, trunca para os 11 dígitos finais
 */
export function normalizeContactPhoneKey(raw: string): string {
  if (!raw) return "";

  // 1. Limpa caracteres não numéricos
  let cleaned = raw.replace(/\D/g, "");

  // 2. Remove zeros à esquerda
  cleaned = cleaned.replace(/^0+/, "");

  // 3. Descarta prefixo 55 se comprimento for 12 ou 13
  if ((cleaned.length === 12 || cleaned.length === 13) && cleaned.startsWith("55")) {
    cleaned = cleaned.slice(2);
  }

  // 4. Trunca para os 11 dígitos finais se exceder 11
  if (cleaned.length > 11) {
    cleaned = cleaned.slice(-11);
  }

  return cleaned;
}
