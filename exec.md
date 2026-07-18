# PLANO DE EXECUÇÃO — AllDelivery (Izaack Pizzaria / Artisanal Crust & Ember)

> Documento de execução **persistente**. Serve como fonte única de verdade para o
> desenvolvimento do sistema. Atualize os checkboxes `[ ]` → `[x]` conforme concluir
> cada tarefa. Não remova itens concluídos — eles servem de histórico.

---

## 0. Decisões de Arquitetura (Confirmadas)

| Tema | Decisão | Observação |
| :--- | :--- | :--- |
| **Matriz de preços** | Placeholders via seed (valores fictícios) | Valores reais serão preenchidos depois pelo painel admin |
| **Mapas** | Google Maps via URL tiles | Fallback: Leaflet + OpenStreetMap se houver problema/limite |
| **Armazenamento de imagens** | Filesystem local no VPS (`/public/uploads`) | Upload gera arquivo físico + URL relativa |
| **Autenticação Admin** | Múltiplos usuários com roles no banco | Roles: `ADMIN`, `MANAGER`, `KITCHEN` |
| **Deploy** | Bun/Node direto no VPS + PostgreSQL nativo + PM2 | Sem Docker |
| **Ordem de entrega** | Tudo em paralelo, seguindo a ordem do documento | Fases abaixo respeitam dependências técnicas |

---

## 1. Visão Geral da Pilha Tecnológica

- **Runtime:** Bun (com TypeScript nativo)
- **Framework:** Next.js 14+ (App Router, Server Actions, SSR/Static híbrido)
- **Estado global (frontend):** Zustand + persistência em `localStorage`
- **Banco de dados:** PostgreSQL (VPS dedicada)
- **ORM:** Prisma
- **Tempo real:** Server-Sent Events (SSE)
- **Drag & Drop (Kanban):** `@dnd-kit/core`
- **Estilização:** Tailwind CSS (Dark Mode nativo, cores custom)
- **Autenticação Admin:** NextAuth (Credentials) + roles no banco
- **Mapas:** Google Maps (tiles) com fallback Leaflet/OSM
- **Impressão:** Cliente desktop Electron (AllDelivery Print) escutando SSE

### Paleta / Tipografia (Client)
- Fundo base: `#131313`
- Realce vermelho profundo: `#e31837`
- Tipografia serif sofisticada: **Playfair Display**
- Bordas arredondadas, estética Dark Mode premium

---

## 2. Estrutura de Pastas Alvo (Monorepo simples)

```
allpizza/
├── exec.md                         # este plano
├── Especificação Técnica AllDelivery.md
├── package.json
├── bun.lockb
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env                            # DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_MAPS_KEY...
├── .env.example
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
│   └── uploads/                    # imagens de sabores/produtos (gitignored)
├── src/
│   ├── app/
│   │   ├── (client)/               # rotas do cliente
│   │   │   ├── page.tsx            # cardápio digital (home)
│   │   │   ├── monte-sua-pizza/
│   │   │   ├── carrinho/
│   │   │   └── checkout/
│   │   ├── admin/                  # painel administrativo
│   │   │   ├── login/
│   │   │   ├── pedidos/            # Kanban
│   │   │   ├── cardapio/           # cadastro produtos/pizzas/sabores
│   │   │   ├── zonas/              # mapa poligonal de entrega
│   │   │   └── clientes/           # histórico por telefone
│   │   └── api/
│   │       ├── public/
│   │       │   ├── customer-lookup/route.ts
│   │       │   ├── delivery-zone-check/route.ts
│   │       │   └── orders/route.ts
│   │       ├── admin/
│   │       │   ├── products/
│   │       │   ├── pizzas/
│   │       │   ├── flavors/
│   │       │   ├── zones/
│   │       │   ├── orders/
│   │       │   └── upload/route.ts
│   │       ├── auth/[...nextauth]/route.ts
│   │       └── print/events/route.ts   # stream SSE
│   ├── components/
│   │   ├── client/                 # PizzaBuilder, FlavorSheet, Cart, etc.
│   │   ├── admin/                   # KanbanBoard, ZoneMapEditor, forms
│   │   └── ui/                     # botões, inputs, modais base
│   ├── lib/
│   │   ├── prisma.ts               # singleton Prisma Client
│   │   ├── pricing.ts              # cálculo de pizza fracionada + bordas
│   │   ├── phone.ts                # normalizeContactPhoneKey
│   │   ├── geo.ts                  # ray-casting ponto-em-polígono
│   │   ├── sse.ts                  # barramento de eventos SSE
│   │   └── auth.ts                 # config NextAuth + roles
│   ├── stores/
│   │   ├── cartStore.ts            # Zustand (carrinho + persist)
│   │   └── pizzaBuilderStore.ts
│   └── types/
│       └── index.ts
└── desktop-print/                  # app Electron (AllDelivery Print)
    ├── package.json
    ├── main.ts
    └── printer.ts
```

---

## 3. FASES DE EXECUÇÃO

Cada fase tem tarefas com checkbox. Marque conforme concluir. As "Definições de
Pronto" (DoD) indicam quando a fase pode ser considerada finalizada.

---

### FASE 0 — Bootstrap do Projeto

- [ ] Inicializar projeto Next.js 14+ (App Router) com Bun
- [ ] Configurar TypeScript (`tsconfig.json` estrito)
- [ ] Instalar e configurar Tailwind CSS (Dark Mode `class`)
- [ ] Adicionar cores custom (`#131313`, `#e31837`) e fonte Playfair Display
- [ ] Instalar dependências base: `prisma`, `@prisma/client`, `zustand`,
      `@dnd-kit/core`, `next-auth`, `zod`
- [ ] Criar `.env.example` com todas as variáveis necessárias
- [ ] Configurar `src/lib/prisma.ts` (singleton do Prisma Client)
- [ ] Configurar ESLint + Prettier
- [ ] Estrutura de pastas conforme seção 2

**DoD:** `bun run dev` sobe app em branco estilizada com dark mode e fonte serif.

---

### FASE 1 — Modelagem de Dados (Prisma Schema)

Baseado integralmente na seção 3 da especificação técnica.

- [ ] Configurar `datasource db` (PostgreSQL) e `generator client`
- [ ] Enums: `OrderStatus`, `OrderType`, `PaymentMethod`
- [ ] Adicionar enum novo: `UserRole` (`ADMIN`, `MANAGER`, `KITCHEN`)
- [ ] Model `Product` + `Category`
- [ ] Model `PizzaCategory` (priceP, priceM, priceG, priceGG)
- [ ] Model `PizzaFlavor` (imageUrl, relação com PizzaCategory)
- [ ] Model `DeliveryZone` (geometry Json GeoJSON, deliveryFee, isActive)
- [ ] Model `Order` (todos os campos + timestamps de transição)
- [ ] Model `OrderItem` (isPizza, pizzaSize, crustType, crustPrice)
- [ ] Model `OrderItemFlavor`
- [ ] Model `CustomerContactProfile` (phoneKey único, notes, displayNameOverride)
- [ ] **Novo** Model `AdminUser` (email, passwordHash, role, name)
- [ ] **Novo** Model `CrustType` (borda recheada: nome, precoPM, precoGGG) — para
      preços de borda editáveis (Catupiry, Cheddar, etc.) + flag `caracol`
- [ ] Rodar primeira migration: `bunx prisma migrate dev --name init`
- [ ] Gerar Prisma Client

**DoD:** Migration aplicada no PostgreSQL; `bunx prisma studio` abre e mostra tabelas.

---

### FASE 2 — Seed de Dados (Placeholders)

Popular o banco com o catálogo real de sabores da spec + preços placeholder.

- [ ] Seed das 6 `PizzaCategory`: Tradicionais, Especiais, Executivas, Premium,
      Doces, Doces Premium — com preços P/M/G/GG **placeholder** (ex: escalonados)
- [ ] Seed dos 62 sabores (`PizzaFlavor`) com nome, descrição e categoria corretos
      (lista completa está na seção 4 da spec — copiar fielmente)
- [ ] Seed das bordas recheadas (`CrustType`): Catupiry, Cheddar, Requeijão, Cream
      Cheese, Mussarela, Chocolate, Nutella, Catupiry Original, Cheddar Original,
      Cream Cheese Original — preços P/M e G/GG placeholder + opção Caracol
- [ ] Seed de `Category` + alguns `Product` de exemplo (bebidas, etc.)
- [ ] Seed de 1 `AdminUser` inicial (ADMIN) com senha hasheada (bcrypt/argon2)
- [ ] Seed de 1 `DeliveryZone` exemplo (polígono simples)
- [ ] Script `bunx prisma db seed` funcional

**DoD:** Banco populado; consultas retornam 62 sabores e 6 categorias.

**Nota sobre preços:** todos os valores monetários serão **placeholders**
(ex: P=30, M=40, G=50, GG=60 escalonando por categoria). O estabelecimento
ajusta depois pelo painel admin. Nenhum valor real foi extraído (imagens ilegíveis).

---

### FASE 3 — Lógica de Negócio Central (`lib/`)

Funções puras, testáveis, isoladas de UI.

#### 3.1 Precificação (`lib/pricing.ts`)
- [ ] `calcPizzaBasePrice(size, flavors[])` → retorna preço da **categoria de maior
      valor** entre os sabores para o tamanho escolhido (regra `max`)
- [ ] `calcCrustPrice(size, crustType, caracol)` → preço da borda por faixa (P/M vs G/GG)
      + taxa adicional caracol
- [ ] `calcPizzaItemTotal(size, flavors[], crust)` = base + borda
- [ ] Regra: até **3 sabores** por pizza fracionada
- [ ] Testes unitários dos cenários (1, 2, 3 sabores; categorias mistas; bordas)

#### 3.2 Normalização de Telefone (`lib/phone.ts`)
- [ ] `normalizeContactPhoneKey(raw)` implementando o algoritmo:
  1. Remove não-numéricos (`\D`)
  2. Remove zeros à esquerda
  3. Remove prefixo `55` se comprimento total for 12 ou 13
  4. Trunca para os **11 dígitos finais** se exceder 11
- [ ] Testes com casos: `+55`, `0DDD`, `9` extra, número curto

#### 3.3 Geo Ray-Casting (`lib/geo.ts`)
- [ ] `isPointInPolygon(lat, lng, geoJsonPolygon)` (algoritmo ray-casting)
- [ ] `findDeliveryZone(lat, lng, zones[])` → primeira zona ativa que contém o ponto
- [ ] Testes com polígonos convexos/côncavos e pontos dentro/fora

#### 3.4 Barramento SSE (`lib/sse.ts`)
- [ ] Registro de clientes conectados (subscribers)
- [ ] `publish(event)` → envia payload a todos os inscritos
- [ ] Suporte a evento estruturado de impressão (JSON do pedido)

**DoD:** Todas as funções com testes verdes (`bun test`).

---

### FASE 4 — Autenticação Admin (Roles)

- [ ] Configurar NextAuth Credentials provider (`lib/auth.ts`)
- [ ] Login com email + senha, comparando hash (`AdminUser`)
- [ ] Sessão JWT contendo `role`
- [ ] Middleware protegendo `/admin/**` (redireciona para `/admin/login`)
- [ ] Guarda de role por rota (ex: `KITCHEN` só vê Kanban)
- [ ] Página `/admin/login` estilizada
- [ ] Server action / util `requireRole(roles[])`

**DoD:** Rota admin bloqueada sem login; login redireciona para Kanban.

---

### FASE 5 — Cardápio Digital (Cliente)

- [ ] Layout base do cliente (`(client)/layout.tsx`) — dark mode premium
- [ ] Home `/` — listagem de categorias de pizza + produtos
- [ ] Cards de sabores com imagem, nome, descrição
- [ ] Caixa de busca textual com filtragem instantânea do inventário
- [ ] Seção de produtos avulsos (bebidas etc.)
- [ ] Responsivo mobile-first

**DoD:** Cliente navega o cardápio completo carregado do banco.

---

### FASE 6 — Módulo "Monte sua Pizza" (Client)

Interface premium de composição fracionada (seção 5 da spec).

- [ ] Store Zustand `pizzaBuilderStore` (tamanho, sabores[], borda)
- [ ] Seletor de quantidade de sabores: `[1 Sabor] [2 Sabores] [3 Sabores]`
- [ ] Seletor de tamanho: P / M / G / GG
- [ ] Canvas de visualização com imagens quadradas idênticas centralizadas
- [ ] **Clip-path dinâmico:**
  - 1 sabor: círculo completo (`border-radius: 50%`)
  - 2 sabores: corte vertical 180° (polygons esquerda/direita)
  - 3 sabores: corte trirradial 120° (3 setores conforme spec)
- [ ] **Rótulos "Selecionar" flutuantes** posicionados nos baricentros:
  - 1 sabor: centro
  - 2 sabores: 25% / 75% left
  - 3 sabores: NO (28%,30%), NE (28%,70%), Sul (72%,50%)
- [ ] **Bottom Selection Sheet** deslizante com grid de sabores + busca
- [ ] Seletor de borda recheada (com opção caracol)
- [ ] Cálculo de preço em tempo real (usa `lib/pricing.ts`)
- [ ] Botão "Adicionar ao carrinho"

**DoD:** Cliente monta pizza de 1–3 sabores, vê preço correto e adiciona ao carrinho.

---

### FASE 7 — Carrinho + Estado Global

- [ ] Store Zustand `cartStore` com persistência em `localStorage`
- [ ] Adicionar/remover/editar itens (pizzas customizadas e produtos)
- [ ] Cálculo de subtotal
- [ ] Página `/carrinho` com resumo e observações por item ("Sem cebola")
- [ ] Persistência sobrevive a refresh

**DoD:** Carrinho persiste entre sessões e calcula subtotal corretamente.

---

### FASE 8 — Checkout com Phone-Bypass Flow (Cliente)

Fluxo sem cadastro/senha (seção 6 da spec):
`[Carrinho] → [Identificação] → [Lookup] → [Confirmação Pin] → [Zonas]`

- [ ] Formulário de identificação (nome + telefone)
- [ ] **Lookup automático:** ao atingir 11 dígitos, dispara
      `GET /api/public/customer-lookup?phone=...`
- [ ] API `customer-lookup`: normaliza telefone, faz scan indexado em `Order`,
      retorna nome mais recente + até **5 endereços** mais usados (com lat/lng)
- [ ] Autopreenchimento de nome
- [ ] Carrossel de seleção de endereços anteriores (pula digitação → mapa)
- [ ] Seleção de tipo: DELIVERY / RETIRADA / COMANDA
- [ ] Seleção de forma de pagamento (PIX/DINHEIRO/CRÉDITO/DÉBITO) + troco
- [ ] Campo de observações gerais

**DoD:** Cliente recorrente é reconhecido pelo telefone e autopreenchido.

---

### FASE 9 — Mapa de Confirmação de Entrega + Ray-Casting (Cliente)

- [ ] Componente de mapa (Google Maps tiles; fallback Leaflet/OSM)
- [ ] Marcador (Pin) arrastável para ajuste fino de coordenada
- [ ] Ao confirmar: envia lat/lng para `POST /api/public/delivery-zone-check`
- [ ] API varre `DeliveryZone` ativas com `findDeliveryZone` (ray-casting)
- [ ] **Sucesso:** injeta `deliveryFee` da zona no total
- [ ] **Falha:** mensagem amigável "fora do raio de cobertura" e trava a transação
- [ ] Recalcular total final (subtotal + deliveryFee)

**DoD:** Pin dentro de zona aplica taxa; fora bloqueia o pedido.

---

### FASE 10 — Criação de Pedido (API Pública)

- [ ] `POST /api/public/orders` — valida payload com Zod
- [ ] Cria `Order` + `OrderItem` + `OrderItemFlavor` (transação Prisma)
- [ ] Grava `customerPhone` normalizado (indexador)
- [ ] Upsert `CustomerContactProfile` por `phoneKey`
- [ ] Define `orderNumber` (autoincrement) e status inicial `NOVO`
- [ ] Retorna confirmação ao cliente

**DoD:** Pedido persiste no banco com itens e sabores corretos.

---

### FASE 11 — Painel Admin: Cadastros (Cardápio)

- [ ] CRUD `Category` + `Product` (com upload de imagem)
- [ ] CRUD `PizzaCategory` (editar preços P/M/G/GG)
- [ ] CRUD `PizzaFlavor` (nome, descrição, imagem, categoria)
- [ ] CRUD `CrustType` (bordas recheadas + preços por faixa + caracol)
- [ ] `POST /api/admin/upload` — salva arquivo em `/public/uploads`, retorna URL
      (validar tipo/tamanho; nome sanitizado; proteção contra path traversal)
- [ ] Preview de imagem no formulário

**DoD:** Admin cadastra/edita sabores, categorias, preços e bordas com imagens.

---

### FASE 12 — Painel Admin: Zonas de Entrega (Mapa Poligonal)

- [ ] Componente `ZoneMapEditor` com desenho de polígonos
- [ ] Ferramenta de desenho (Google Maps Drawing / fallback Leaflet.draw)
- [ ] Salvar geometria como **GeoJSON Polygon** em `DeliveryZone.geometry`
- [ ] Definir `title` + `deliveryFee` + `isActive`
- [ ] Listar/editar/excluir zonas
- [ ] Visualização de todas as zonas no mapa

**DoD:** Admin desenha polígono, atribui taxa e salva; zona é usada no checkout.

---

### FASE 13 — Painel Admin: Kanban de Pedidos + SSE

Workflow de gestão (seções 8 da spec).

- [ ] Board Kanban com `@dnd-kit/core`
- [ ] Colunas: NOVO → EM_PREPARO → EM_ROTA → ENTREGUE
- [ ] Área horizontal dedicada **Balcão** (PRONTO_RETIRADA) para RETIRADA
- [ ] Controle visual de **COMANDA/mesas** (bypass do funil de motoboys)
- [ ] **Regras de transição estritas:**
  - RETIRADA: não passa por EM_ROTA/ENTREGUE → vai para PRONTO_RETIRADA
  - COMANDA: fluxo interno de mesas
- [ ] `PATCH /api/admin/orders/:id/status` atualiza status + **timestamps**:
  - `preparedAt` (drop em Em Preparo)
  - `sentAt` (drop em Em Rota)
  - `readyForPickupAt` (drop em Balcão)
  - `deliveredAt` (drop em Entregues)
- [ ] Atualização em tempo real do board via SSE (novos pedidos aparecem)
- [ ] Ao mover para **EM_PREPARO** → persiste + publica evento SSE de impressão

**DoD:** Cards arrastáveis com regras corretas; timestamps gravados; novos
pedidos aparecem em tempo real.

---

### FASE 14 — Stream SSE de Impressão

- [ ] `GET /api/print/events` — rota de streaming unidirecional persistente
- [ ] Headers corretos (`text/event-stream`, `no-cache`, keep-alive)
- [ ] Publica JSON detalhado do pedido (itens, observações, dados do cliente)
- [ ] Reconexão / heartbeat para manter conexão viva

**DoD:** Transição para EM_PREPARO emite evento consumível via `curl`/EventSource.

---

### FASE 15 — Painel Admin: Histórico de Clientes

- [ ] Busca de clientes por telefone (normalizado)
- [ ] Exibir histórico unificado de pedidos por `phoneKey`
- [ ] Editar `CustomerContactProfile`: `notes` internas +
      `displayNameOverride` (ex: "Dr. João Silva")
- [ ] Listar endereços e coordenadas usados

**DoD:** Admin busca por telefone e vê histórico + anotações internas.

---

### FASE 16 — AllDelivery Print (Desktop Electron)

- [ ] Projeto Electron em `desktop-print/`
- [ ] Conexão `EventSource` à rota SSE (`/api/print/events`) na rede interna
- [ ] Parser do payload do pedido
- [ ] Formatação para bobina térmica (largura estreita, layout monoespaçado)
- [ ] Invocar rotina de impressão do SO
- [ ] Dois perfis: **Cozinha** (fatias) e **Expedição** (conferência de entrega)
- [ ] Config de impressora/IP via UI simples
- [ ] Reconexão automática ao SSE

**DoD:** App desktop imprime automaticamente ao receber evento de novo pedido em preparo.

---

### FASE 17 — Qualidade, Segurança e Deploy

#### Segurança (OWASP Top 10)
- [ ] Validação de todas as entradas (Zod) nas APIs
- [ ] Sanitização de upload de arquivos (tipo/tamanho, anti path-traversal)
- [ ] Proteção de rotas admin por role
- [ ] Rate limiting no `customer-lookup` (evitar enumeração)
- [ ] Senhas com hash forte (argon2/bcrypt)
- [ ] Variáveis sensíveis apenas em `.env` (nunca commitadas)

#### Testes
- [ ] Testes unitários: pricing, phone, geo
- [ ] Testes de integração das APIs críticas
- [ ] Teste manual do fluxo completo (montar pizza → checkout → Kanban → impressão)

#### Deploy (VPS — Bun/Node + PostgreSQL nativo + PM2)
- [ ] Provisionar PostgreSQL no VPS + criar database/usuário
- [ ] Configurar `.env` de produção
- [ ] `bunx prisma migrate deploy` no servidor
- [ ] Rodar seed inicial (admin + catálogo)
- [ ] Build de produção (`bun run build`)
- [ ] Configurar PM2 (`ecosystem.config.js`) para app Next.js
- [ ] Reverse proxy (Nginx) + HTTPS (Let's Encrypt)
- [ ] Garantir que SSE funciona atrás do proxy (buffering off)
- [ ] Configurar backups do PostgreSQL

**DoD:** Sistema no ar, acessível via HTTPS, impressão funcionando na rede local.

---

## 4. Dependências Entre Fases

```
FASE 0 (bootstrap)
  └─> FASE 1 (schema) ──> FASE 2 (seed)
        └─> FASE 3 (lib) ──────────────────────────┐
        └─> FASE 4 (auth admin)                    │
                                                   ▼
  FASE 5 (cardápio) ─> FASE 6 (monte pizza) ─> FASE 7 (carrinho) ─> FASE 8 (checkout)
                                                   └─> FASE 9 (mapa/ray-cast) ─> FASE 10 (criar pedido)
  FASE 11 (cadastros admin) ── depende de 1,2,4
  FASE 12 (zonas admin) ────── depende de 3.3, 4
  FASE 13 (kanban+sse) ─────── depende de 3.4, 4, 10
  FASE 14 (sse print) ──────── depende de 3.4, 13
  FASE 15 (histórico) ──────── depende de 10
  FASE 16 (electron) ───────── depende de 14
  FASE 17 (qa/deploy) ──────── depende de tudo
```

---

## 5. Variáveis de Ambiente (`.env.example`)

```
DATABASE_URL="postgresql://user:pass@localhost:5432/alldelivery"
NEXTAUTH_SECRET="troque-por-um-secret-forte"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_GOOGLE_MAPS_KEY=""          # opcional; se vazio usa fallback Leaflet/OSM
UPLOAD_DIR="./public/uploads"
```

---

## 6. Pontos de Atenção / Riscos

- **Preços placeholder:** NÃO usar em produção sem revisão do estabelecimento.
- **Google Maps tiles via URL:** monitorar limites/ToS; fallback Leaflet/OSM pronto.
- **SSE atrás de proxy:** desabilitar buffering no Nginx (`proxy_buffering off`).
- **Clip-path 3 sabores:** validar visualmente os polígonos da spec em vários tamanhos.
- **Normalização de telefone:** cobrir bem casos brasileiros (DDD, 9º dígito, +55).
- **Ray-casting em pontos na borda:** definir comportamento (dentro/fora) e testar.
- **Upload local:** `/public/uploads` precisa de permissão de escrita e backup.

---

## 7. Log de Progresso

> Adicione entradas datadas conforme avança. Ex:
> - `2026-07-13` — Plano criado. Aguardando início da Fase 0.

- `2026-07-13` — Plano de execução criado e decisões de arquitetura confirmadas.
