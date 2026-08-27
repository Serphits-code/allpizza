/**
 * Retorna uma URL de imagem válida e otimizada, prevenindo requisições 404 para arquivos locais inexistentes.
 */
export function getOptimizedImageUrl(imageUrl?: string | null): string {
  if (!imageUrl || typeof imageUrl !== "string") {
    return "/images/pizza-placeholder.png";
  }
  // Se for um caminho de semente genérico não enviado manualmente por upload, usa o placeholder local
  if (imageUrl.startsWith("/images/flavors/") || imageUrl.startsWith("/images/products/")) {
    return "/images/pizza-placeholder.png";
  }
  return imageUrl;
}
