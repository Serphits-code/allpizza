# 🔍 Auditoria Completa — AllDelivery

> **Data:** 31/08/2026
> **Escopo:** Rotas API (38 arquivos), middleware, autenticação, libs (`src/lib`), stores, schema Prisma, apps Electron (`electron/`, `desktop-print/`), configurações e dependências.

---

## 📊 Resumo Executivo

| Categoria | 🔴 Crítico | 🟠 Alto | 🟡 Médio | 🔵 Baixo |
|---|---|---|---|---|
| Segurança | 5 | 6 | 5 | 3 |
| Bugs / Lógica | — | 4 | 5 | 4 |
| Performance | — | 3 | 3 | 2 |
| Dependências | 1 | 2 | — | — |
| **Total** | **6** | **15** | **13** | **9** |

**Veredito geral:** o projeto tem uma base sólida (Prisma sem SQL raw, bcrypt, transação no checkout, proteção contra race no "claim" de pedidos), porém apresenta **vulnerabilidades graves de exposição de dados pessoais (LGPD)**, **ausência de controle de acesso por papel (RBAC)** e **precificação confiada ao cliente**, além de dependências desatualizadas com CVEs críticos.

---

# 🔴 ACHADOS CRÍTICOS

## C1. Dump público de TODOS os pedidos — `GET /api/public/orders`

[src/app/api/public/orders/route.ts](src/app/api/public/orders/route.ts#L186-L201)

```ts
export async function GET() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { flavors: true } } },
  });
  return NextResponse.json(orders);
}
```

Sem autenticação, sem paginação, retorna **todos os pedidos** com PII completa (nome, telefone, endereço, coordenadas GPS, valores). Qualquer pessoa na internet pode baixar a base inteira. **Violação grave de LGPD.**

## C2. Precificação confiada ao cliente — `POST /api/public/orders`

[src/app/api/public/orders/route.ts](src/app/api/public/orders/route.ts#L74-L80)

```ts
let subtotal = 0;
for (const item of data.items) {
  subtotal += item.price * item.quantity;        // ← preço vem do payload!
}
const deliveryFee = data.type === OrderType.DELIVERY ? data.deliveryFee : 0; // ← taxa também!
```

O Zod valida **formato**, mas não regra de negócio: `item.price` e `data.deliveryFee` são aceitos do cliente sem conferência com o cardápio. Um cliente pode enviar `price: 0.01` e `deliveryFee: 0` (ou negativo) e o pedido é persistido com esse valor. Toda a lógica de [src/lib/pricing.ts](src/lib/pricing.ts) e `findDeliveryZone` de [src/lib/geo.ts](src/lib/geo.ts) **não é usada no checkout público**. O mesmo problema existe em [src/app/api/admin/orders/route.ts](src/app/api/admin/orders/route.ts#L35-L50) (`basePrice`, `crustPrice`, `toppings[].price` vindos do body).

## C3. Stream SSE público vaza PII de todos os pedidos em tempo real

[src/app/api/print/events/route.ts](src/app/api/print/events/route.ts#L5-L27) + [src/lib/sse.ts](src/lib/sse.ts#L37-L40)

O endpoint SSE não verifica sessão e o `SseManager.publish` faz broadcast para **todos** os clientes conectados, sem canais ou escopo. Como o checkout público publica o pedido completo (`sseManager.publish("order_created", createdOrder)`), qualquer pessoa que abra um `EventSource` para `/api/print/events` recebe em tempo real **nome, telefone, endereço e itens de todos os clientes**.

## C4. IDOR — `GET /api/public/orders/[id]`

[src/app/api/public/orders/[id]/route.ts](src/app/api/public/orders/[id]/route.ts#L6-L28)

Sem autenticação e sem token de acesso por pedido: quem tiver/adivinhar o `id` (CUID) obtém todos os dados do cliente. Funciona como oráculo de existência de pedidos.

## C5. Enumeração de clientes — `GET /api/public/customer-lookup`

[src/app/api/public/customer-lookup/route.ts](src/app/api/public/customer-lookup/route.ts#L5)

Sem auth e sem rate limit: dado um telefone, retorna nome, até 5 endereços e coordenadas GPS do cliente. Telefone é chave enumerável — permite varrer a base inteira de clientes.

## C6. Dependências com CVEs críticos/altos

| Pacote | Versão | Severidade | Detalhe |
|---|---|---|---|
| `next-auth` | 4.24.7 | 🔴 **Crítico** | Homoglyph `@` bypass na normalização de e-mail (GHSA-7rqj-j65f-68wh); `getToken()` lança exceção não tratada em Bearer malformado (GHSA-xmf8-cvqr-rfgj). Corrigido em 4.24.15+ |
| `next` | 14.2.4 | 🟠 **Alto** | 20+ advisories: DoS via Image Optimizer, request smuggling em rewrites, XSS com CSP nonces, cache poisoning de RSC, SSRF em Server Actions/WebSockets, entre outros |
| `nanoid` | <3.3.18 (transitivo do Next) | 🟠 **Alto** | Loop infinito com size zero (GHSA-2v37-7h3g-55p8) |

---

# 🟠 ACHADOS DE ALTA SEVERIDADE

## Segurança

### A1. Ausência generalizada de verificação de role (RBAC quebrado)

18+ handlers verificam apenas `if (!session)` — **qualquer usuário autenticado** (incluindo `KITCHEN` e `DRIVER`) executa ações administrativas:

| Rota | Impacto |
|---|---|
| [admin/store-status POST](src/app/api/admin/store-status/route.ts#L8-L11) | 🔴 Qualquer autenticado **abre/fecha a loja** |
| [admin/system-config GET/POST](src/app/api/admin/system-config/route.ts#L6-L10) | Qualquer autenticado altera nome/logo/cor da empresa e coords do depot; o POST ainda **apaga todas as rotas ativas** (`driverActiveRoute.deleteMany({})`) |
| [admin/dashboard GET](src/app/api/admin/dashboard/route.ts#L9-L12) | Dados financeiros completos (faturamento, ticket médio) |
| [admin/orders/[id]/status PATCH](src/app/api/admin/orders/[id]/status/route.ts#L13-L16) | Qualquer autenticado muda status de qualquer pedido, **sem validação de transição** (`ENTREGUE` → `NOVO`) e sem auditoria de quem alterou |
| [admin/comandas/*](src/app/api/admin/comandas/route.ts) (close, release, delete-item, migrate-item) | DRIVER/KITCHEN podem **deletar itens de pedidos**, migrar itens, fechar/liberar mesas e alterar totais |
| [admin/contacts](src/app/api/admin/contacts/route.ts#L10-L13) e [admin/customers](src/app/api/admin/customers/route.ts#L8-L11) | Base completa de clientes (PII + total gasto) acessível a qualquer role |
| [admin/upload POST](src/app/api/admin/upload/route.ts#L10-L13) | Qualquer role autenticada faz upload de imagens |
| [garcom/mesas](src/app/api/garcom/mesas/route.ts#L10-L13) | Qualquer role abre mesas / altera responsável |

**Referência correta já existente no projeto:** [admin/users](src/app/api/admin/users/route.ts) e os CRUDs de escrita de cardápio/zonas verificam `ADMIN`/`MANAGER` — o padrão existe, só não foi aplicado de forma consistente.

### A2. Páginas `/entregador` e `/garcom` sem proteção server-side

O middleware só cobre `/admin/:path*` ([middleware.ts](middleware.ts#L41)). `SessionWrapper` ([src/components/admin/SessionWrapper.tsx](src/components/admin/SessionWrapper.tsx#L6)) é apenas um `SessionProvider` — **não exige autenticação**. A página do entregador faz redirect client-side (`sessionStatus === "unauthenticated"`), e a do garçom **nem isso**. Os dados vêm de APIs (que verificam sessão), mas a proteção de página é apenas cosmética. Adicionar `/entregador/:path*` e `/garcom/:path*` ao `matcher` com verificação de role.

### A3. Credencial real hardcoded no seed

[prisma/seed.ts](prisma/seed.ts#L36-L46)

```ts
const customPasswordHash = await bcrypt.hash("Cxz963!@", 10);
const customAdmin = await prisma.adminUser.create({
  data: { email: "Almeidaestudios@outlook.com", ... },
});
```

Senha real commitada no repositório. Se este hash/senha já foi usado em produção, **trocar imediatamente** e mover para variável de ambiente.

### A4. Enumeração de usuários no login

[src/lib/auth.ts](src/lib/auth.ts#L28-L37): mensagem distinta para conta desativada ("Esta conta de usuário está desativada...") vs. senha errada permite descobrir e-mails válidos. Além disso, `bcrypt.compare` só executa quando o usuário existe — diferença de **timing** mensurável também permite enumeração. Mitigação: comparar contra hash dummy quando `!user` e usar mensagem única. O endpoint [admin/auth/login-check](src/app/api/admin/auth/login-check/route.ts#L35) tem o mesmo problema e **não tem rate limit** → força bruta.

### A5. Middleware autoriza qualquer token em `/admin/*`

[middleware.ts](middleware.ts#L24-L31): o callback `authorized` retorna `!!token` — um usuário `KITCHEN`/`DRIVER` acessa qualquer página admin (o redirect do KITCHEN acontece depois, mas `GARCOM` e `DRIVER` navegam livremente). A role deveria ser verificada por prefixo de rota no próprio middleware.

### A6. CSS Injection via cor do tema

[src/app/layout.tsx](src/app/layout.tsx#L33) (e layouts de entregador/garcom) injetam `config.primaryColor` via `dangerouslySetInnerHTML`. Como qualquer autenticado pode alterar `system-config` (ver A1), um valor como `red; } </style><script>...` ou `url(javascript:...)` vira vetor de injeção. Validar formato hex (`/^#[0-9a-fA-F]{6}$/`) no POST de system-config e/ou sanitizar na renderização.

## Bugs / Lógica

### A7. Colisão de chaves de telefone no truncamento

[src/lib/phone.ts](src/lib/phone.ts#L21-L27): número de 12+ dígitos **sem** prefixo 55 perde dígitos iniciais — `199999999999` e `299999999999` colidem na mesma chave `99999999999`, fundindo clientes distintos em um único contato. Número de 14 dígitos com prefixo 55 não tem o 55 removido (regra só cobre 12/13), duplicando o mesmo cliente.

### A8. Aritmética monetária em float, sem arredondamento

[src/lib/pricing.ts](src/lib/pricing.ts#L73-L74): `basePrice * fraction * quantity` — frações como 3/8 × preços quebrados geram dízimas (`2.6249999999999996`). Não há `Math.round(... * 100) / 100` em nenhum ponto de pricing, nem no subtotal do carrinho ([cartStore.ts](src/stores/cartStore.ts#L94)), nem no `totalSpent` ([admin-contacts.ts](src/lib/admin-contacts.ts#L93)). Comparações de troco/total podem falhar e totais exibidos podem sair `R$ 99,99999999`. **Agravante:** o schema usa `Float` para dinheiro (ver M8) — o ideal é `Decimal` ou inteiros em centavos.

### A9. Carrinho editável + merge com preço obsoleto

[src/stores/cartStore.ts](src/stores/cartStore.ts):
- Preços persistidos em localStorage (chave `alldelivery-cart-storage`) são a fonte do pedido → base do C2.
- [Linhas 58-60](src/stores/cartStore.ts#L58-L60): no merge de item existente, o objeto é **mutado in-place** (fere imutabilidade do Zustand) e o `price` novo é descartado — se o preço mudou no cardápio, o carrinho cobra o preço velho.
- Sem `version`/`migrate` no `persist` ([linhas 101-103](src/stores/cartStore.ts#L101-L103)) — mudança de schema reidrata carrinhos incompatíveis.
- Sem gate de hidratação → risco de hydration mismatch (React #418/#423) com contador de itens renderizado no SSR.
- Fallback de ID fraco ([linha 68](src/stores/cartStore.ts#L68)): `Math.random().toString(36).substring(2, 9)` tem colisões plausíveis; `crypto.randomUUID` lança `ReferenceError` se `crypto` não existir (WebViews antigas) — usar `typeof crypto !== "undefined" && crypto.randomUUID`.

### A10. Tamanho inválido de pizza precificado como G/GG silenciosamente

[src/lib/pricing.ts](src/lib/pricing.ts#L67): `(normSize === "P" || normSize === "M") ? topping.pricePM : topping.priceGGG` — qualquer string diferente de P/M cai no preço G/GG sem erro. Inconsistente com `getCategoryPriceForSize` e `calcCrustPrice`, que lançam exceção. Também em [linha 86](src/lib/pricing.ts#L86): `item.quantity || 1` transforma `quantity: 0` explícito em `1` (adicional cobrado mesmo com quantidade zero).

## Performance

### A11. Full table scan em memória na consulta de contato

[src/app/api/admin/contacts/[phoneKey]/route.ts](src/app/api/admin/contacts/[phoneKey]/route.ts#L30): `prisma.order.findMany` **sem `where`** — carrega TODOS os pedidos (com includes profundos) e filtra por telefone em JavaScript. Cada consulta de detalhe de contato varre a tabela inteira. Mover o filtro para o `where` do Prisma.

### A12. Paginação inexistente no banco

`contacts`, `dashboard`, `summary`, `customers`, `comandas`, `garcom/mesas` e `public/orders` carregam tudo e agregam/paginam em memória ([contacts, linhas 97-101](src/app/api/admin/contacts/route.ts#L97-L101)). Não escala e consome memória proporcional à base total.

### A13. Query no banco a cada request autenticado

[src/lib/auth.ts](src/lib/auth.ts#L58-L66): o callback `jwt` consulta `adminUser` **em toda avaliação de token** (toda chamada autenticada). A intenção (role sempre fresco) é válida, mas sem cache curto vira gargalo. Similarmente, [configHelper.ts](src/lib/configHelper.ts#L13) faz `findMany()` de toda a tabela `systemConfig` a cada chamada, sem cache.

---

# 🟡 ACHADOS DE MÉDIA SEVERIDADE

## Segurança

- **M1. GPS do entregador exposto publicamente** — [api/public/driver-location](src/app/api/public/driver-location/route.ts#L6): dado um `orderId`, expõe localização em tempo real e nome do entregador, sem token de acesso ao pedido.
- **M2. Geometria e taxas de zonas públicas** — [api/admin/zones GET](src/app/api/admin/zones/route.ts#L7) sem auth expõe inteligência de negócio (taxas por região). Também é inconsistente cardápio público estar sob `/api/admin`.
- **M3. Vazamento de localização de clientes para terceiros** — [entregador/optimize](src/app/api/entregador/optimize/route.ts#L150-L157) envia coordenadas de clientes na URL do OSRM público. (Timeouts de 4s/6s presentes — ponto positivo.)
- **M4. `NEXTAUTH_SECRET` sem fail-fast** — [auth.ts](src/lib/auth.ts#L85): se a env estiver ausente, o erro só aparece em runtime. Validar no boot.
- **M5. Ausência total de rate limiting** em todo o projeto — nenhuma ocorrência de rate limit/throttle no código. Afeta `login-check` (força bruta), `public/orders` (spam de pedidos falsos → DoS operacional) e `customer-lookup` (varredura).
- **M6. Sem headers de segurança** — [next.config.mjs](next.config.mjs) não define CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` etc.

## Bugs / Lógica

- **M7. Cupom fiscal usa timezone do servidor** — [printFormatter.ts](src/lib/printFormatter.ts#L11) e [desktop-print/main.ts](desktop-print/main.ts): `toLocaleString("pt-BR")` sem `timeZone`. Em VPS/container em UTC, o cupom sai com 3h de diferença — grave para um cupom de pedido.
- **M8. Zona de entrega: primeiro match vence** — [geo.ts](src/lib/geo.ts#L48-L54): `findDeliveryZone` retorna a primeira zona ativa que contém o ponto. Zonas sobrepostas com taxas diferentes → resultado depende da ordem do array (sem `orderBy` garantido). Sem regra de desempate.
- **M9. `isPointInPolygon` limitado** — [geo.ts](src/lib/geo.ts#L5-L14): não suporta `MultiPolygon` (retorna `false` silenciosamente), ignora buracos do polígono e não trata ponto sobre a borda.
- **M10. Haversine sem clamp** — [geo.ts](src/lib/geo.ts#L75): para pontos antípodas, erro de float pode produzir `a > 1` → `Math.sqrt(1 - a)` = `NaN`. Padrão: `const a = Math.min(1, ...)`.
- **M11. Inconsistência customers vs contacts** — [customers GET](src/app/api/admin/customers/route.ts#L32) conta pedidos com igualdade exata de telefone; [contacts/[phoneKey]](src/app/api/admin/contacts/[phoneKey]/route.ts#L48-L50) normaliza. Os dois endpoints divergem sobre quais pedidos pertencem ao cliente. Adicional: [customers PUT](src/app/api/admin/customers/route.ts#L79-L83) usa `update` puro → `P2025` vira 500 genérico em vez de 404 quando o perfil não existe.
- **M12. Telefone fake hardcoded** — [migrate-item, linha 56](src/app/api/admin/comandas/migrate-item/route.ts#L56): pedidos migrados recebem `customerPhone: "00000000000"`, poluindo a base de contatos (vira um `phoneKey` agregado).

## Performance / Arquitetura

- **M13. SSE in-memory não escala** — [sse.ts](src/lib/sse.ts#L81-L83): singleton em `globalThis` só funciona em processo Node único e de longa duração. Em serverless (Vercel) ou múltiplas réplicas, clientes em instâncias diferentes não recebem eventos. Se o deploy for on-premises/VPS única, documentar a limitação.
- **M14. Race conditions / falta de transações** — [comandas POST](src/app/api/admin/comandas/route.ts#L74-L87) (loop de upserts sem transação), [delete-item](src/app/api/admin/comandas/delete-item/route.ts#L35-L79) e [migrate-item](src/app/api/admin/comandas/migrate-item/route.ts) (delete → recálculo → update em etapas separadas), [release](src/app/api/admin/comandas/[id]/release/route.ts) (`updateMany` + `update` sem transação). Falha intermediária deixa pedido/comanda inconsistentes. ✅ Bom exemplo a seguir: [entregador/orders/[id] PATCH](src/app/api/entregador/orders/[id]/route.ts#L37-L46) usa `updateMany` condicional contra double-claim.
- **M15. Validação de entrada quase ausente nas rotas admin** — Zod usado em apenas 1 das 38 rotas. `parseFloat`/`parseInt` sem checagem de `NaN` em crusts, pizzas, products, zones e [entregador/location](src/app/api/entregador/location/route.ts#L24-L25) — `NaN` pode ser persistido ou causar 500. Campos de texto sem limite de tamanho.

---

# 🔵 ACHADOS DE BAIXA SEVERIDADE / MÁS PRÁTICAS

- **B1. `any` excessivo** — [admin-contacts.ts](src/lib/admin-contacts.ts#L41), [printFormatter.ts](src/lib/printFormatter.ts#L2) (`formatThermalReceipt(order: any)`), [driver-active-route.ts](src/lib/driver-active-route.ts#L8-L10), [sse.ts](src/lib/sse.ts#L37), [geo.ts](src/lib/geo.ts#L5).
- **B2. Erros engolidos silenciosamente** — [configHelper.ts](src/lib/configHelper.ts#L47) retorna defaults sem logar (falha de banco → loja renderiza com nome/cores padrão sem ninguém perceber); [driver-active-route.ts](src/lib/driver-active-route.ts#L24-L27) retorna `null` em erro — chamador não distingue "sem rota" de "banco fora do ar".
- **B3. Nome da empresa hardcoded e divergente** — `"Artisanal"` em [configHelper.ts](src/lib/configHelper.ts#L17) vs `"ARTISANAL CRUST & EMBER"` em [printFormatter.ts](src/lib/printFormatter.ts#L8) e [desktop-print/main.ts](desktop-print/main.ts) — o cupom ignora o `SystemConfig` do admin.
- **B4. Código morto / feature fantasma** — [push-notifications.ts](src/lib/push-notifications.ts) é um mock que só faz `console.log`: em produção **nenhuma notificação push é enviada** e o sistema se comporta como se a feature existisse. O campo `caracol: boolean` de `CrustInput` ([pricing.ts](src/lib/pricing.ts#L17)) é ignorado; taxa caracol `5.00` hardcoded ([linha 130](src/lib/pricing.ts#L130)) deveria vir de config.
- **B5. Código de cupom duplicado** — `formatThermalReceipt` existe em [src/lib/printFormatter.ts](src/lib/printFormatter.ts), [electron/main.js](electron/main.js) (32 colunas) e [desktop-print/main.ts](desktop-print/main.ts) (48 colunas), com larguras e tratamento de nulos diferentes — 3 fontes de verdade divergentes.
- **B6. Electron: servidor local sem autenticação e CORS `*`** — [electron/main.js](electron/main.js): `Access-Control-Allow-Origin: *` na porta 3001 permite que **qualquer site aberto no navegador** da máquina dispare impressões. Mitigado por escutar apenas em `localhost`, mas recomenda-se validar `Origin`. Também cria um `BrowserWindow` por impressão (custo alto sob rajadas).
- **B7. Null-safety no cupom** — [printFormatter.ts](src/lib/printFormatter.ts#L14): `order.changeFor.toFixed(2)` quebra se `changeFor` vier serializado como string; `notes`/endereço sem quebra de linha a 48 colunas estouram o layout da bobina.
- **B8. Sentinela mágica** — `daysSinceLastOrder = 9999` em [admin-contacts.ts](src/lib/admin-contacts.ts#L96); `console.log` de negócio em [sse.ts](src/lib/sse.ts#L15) e push mock.
- **B9. Schema sem índices úteis** — `Order.customerPhone` (consultado por igualdade em customers), `Order.status` e `Order.createdAt` (filtros frequentes de dashboard/kanban) não têm `@@index`. Com o crescimento da base, os filtros atuais degradarão.

---

# ✅ PONTOS POSITIVOS ENCONTRADOS

- **Nenhum SQL Injection:** zero uso de `$queryRaw`/`$executeRaw`/`*Unsafe` em todo o projeto — todas as consultas passam pelo Prisma com parâmetros tipados.
- **Transação atômica no checkout público** ([public/orders POST](src/app/api/public/orders/route.ts#L84)) e proteção correta contra double-claim de pedidos por entregadores ([entregador/orders/[id]](src/app/api/entregador/orders/[id]/route.ts#L37-L46)).
- **Sem vazamento de `passwordHash`:** [admin/users](src/app/api/admin/users/route.ts#L19-L30) e `login-check` usam `select` explícito.
- **Upload robusto:** reprocessamento via `sharp` (elimina polyglots/EXIF), nome sanitizado com `path.basename`, limite de 10 MB.
- **RBAC correto** nas rotas de usuários e CRUDs de cardápio (padrão existe — falta aplicar em todo lugar).
- **bcrypt** para senhas, sessão JWT em cookie httpOnly, role default `KITCHEN` (menor privilégio) no schema.
- **`.gitignore`** cobre `.env` corretamente; `.env.example` sem segredos reais.
- Timeouts nas chamadas externas (OSRM/VROOM).

---

# 🎯 PLANO DE AÇÃO PRIORIZADO

## Imediato — risco de vazamento de dados / fraude financeira
1. Remover ou proteger `GET /api/public/orders` e `GET /api/public/orders/[id]` (token opaco por pedido).
2. Exigir sessão admin em `/api/print/events`.
3. Restringir `customer-lookup` (rate limit + minimizar dados retornados).
4. **Recalcular preços server-side** no checkout público e admin, reutilizando [pricing.ts](src/lib/pricing.ts) e `findDeliveryZone` — nunca aceitar `price`/`deliveryFee` do payload.
5. Atualizar `next-auth` (≥4.24.15) e `next` (versão patched); rodar `npm audit fix`.
6. Remover senha hardcoded do [seed.ts](prisma/seed.ts) e trocar a credencial se já usada em produção.

## Alto 
7. Adicionar verificação de role (`ADMIN`/`MANAGER`) em `store-status`, `system-config`, `dashboard`, `orders/[id]/status`, comandas e contacts; incluir `/entregador` e `/garcom` no `matcher` do middleware.
8. Rate limiting em `login-check` e `public/orders` (+ captcha no checkout).
9. Mover filtro de telefone de `contacts/[phoneKey]` para o `where` do Prisma; paginação real no banco.
10. Validar formato da cor do tema (CSS injection) e mensagem única + hash dummy no login (enumeração).

## Médio
11. Envolver fluxos multi-etapa de comandas em `prisma.$transaction`.
12. Centralizar arredondamento monetário (`Math.round(v * 100) / 100`) e migrar `Float` → `Decimal`/centavos no schema.
13. Adicionar headers de segurança no `next.config.mjs`; fixar `timeZone` no cupom; `version`/`migrate` no cartStore.
14. Zod nas rotas admin de CRUD; checagem de `NaN` nos `parseFloat`; role `DRIVER` em `entregador/location` e `optimize`.

## Baixo / melhoria contínua
15. Índices em `customerPhone`/`status`/`createdAt`; consolidar as 3 cópias de `formatThermalReceipt`; implementar (ou remover) push notifications; cache curto no callback JWT e em `getStoreConfig`.
