# AllDelivery — Documentação das páginas administrativas

**Autor:** Manus AI  
**Escopo:** revisão do repositório `Serphits-code/alldelivery`, com foco nas páginas administrativas **Dashboard, Usuários, Contatos, Mapa, Comandas e Resumo Diário**.  
**Versão analisada:** branch `main`, commit `2b8cb1e`, publicado em 27/08/2026 [1].

## 1. Objetivo desta documentação

Este documento transforma a implementação existente em uma especificação funcional e técnica que pode ser usada como referência para transportar essas funcionalidades para outro sistema. A análise considera as páginas, os componentes compartilhados, os endpoints, as regras de negócio observáveis no código e os modelos de dados necessários.

A conclusão geral é que o AllDelivery não trata essas telas como módulos isolados. O **pedido** é a entidade central: ele alimenta as métricas do dashboard, forma o histórico de contatos, aparece no mapa quando é delivery ativo, pertence a uma comanda quando é um pedido local e compõe o resumo diário. Por isso, a replicação deve começar pelo domínio de pedidos, status, usuários, clientes e localização, e só depois implementar as telas.

> **Nota de leitura:** as referências no formato `[n]` apontam para os arquivos correspondentes no GitHub, na seção **Referências** ao final.

## 2. Visão geral do projeto

O repositório é uma aplicação web em **Next.js 15**, com **React 19**, **TypeScript**, **Prisma** sobre **PostgreSQL**, **NextAuth** para autenticação e **Tailwind CSS** para a interface. Também utiliza Leaflet para mapas, Zustand para estado local, `react-hot-toast` para notificações, Web Push, Socket.IO e bibliotecas de gráficos, embora as páginas analisadas usem principalmente componentes próprios e barras CSS para visualização. Essas dependências e scripts estão declarados no `package.json` [2].

A aplicação combina três superfícies operacionais: o cardápio público e checkout, o painel administrativo e as áreas operacionais de garçom e entregador. O layout global registra o idioma `pt-BR`, carrega a sessão de autenticação, o provider de aparência, o manifesto PWA e o sistema de toast [3].

| Área | Rotas principais | Responsabilidade |
|---|---|---|
| Público | `/`, `/cardapio/[slug]`, `/carrinho`, `/checkout`, `/pedido/[id]` | Exibir cardápio, receber pedidos e acompanhar pedido. |
| Administração | `/admin`, `/admin/pedidos`, `/admin/whatsapp`, `/admin/produtos`, `/admin/usuarios`, `/admin/contatos`, `/admin/mapa`, `/admin/comandas`, `/admin/resumo`, entre outras | Operação da loja, catálogo, equipe, clientes, entregas e indicadores. |
| Garçom | `/garcom` | Lançar pedidos locais em comandas. |
| Entregador | `/entregador` | Receber entregas, atualizar localização e otimizar rota. |
| Integrações | `/api/whatsapp/*`, `/api/print/*`, `/api/public/*`, `/api/entregador/*` | WhatsApp, impressão, rastreamento público e operação do entregador. |

O painel administrativo é montado por `src/app/admin/layout.tsx` e `src/components/admin/admin-layout.tsx`. O menu atual contém Dashboard, Pedidos, WhatsApp, Produtos, Categorias, Ingredientes, Adicionais, Complementos, Usuários, Contatos, Zonas de Entrega, Mapa, Comandas, Resumo Diário e Configurações [4].

### 2.1. Autenticação e autorização

O login usa credenciais de e-mail e senha, com senha armazenada por hash `bcrypt`. A sessão usa estratégia JWT e inclui `id` e `role` do usuário [5]. Os papéis existentes no schema são `admin`, `garcom` e `entregador` [6].

A proteção de acesso é concentrada no middleware. Rotas `/admin` exigem papel `admin`; as APIs administrativas também exigem `admin`, com exceções específicas para o garçom em comandas, categorias, produtos e pedidos. As rotas de garçom e entregador possuem regras próprias de papel [7]. Na replicação, essa autorização deve existir também na camada de serviço ou handler, e não apenas na borda de roteamento.

O layout ainda consulta `/api/admin/orders?status=novo` a cada oito segundos para exibir um contador de novos pedidos no menu. Esse contador é independente do polling específico das telas de mapa e comandas [4].

## 3. Modelo de dados necessário para replicação

O núcleo do modelo está em `prisma/schema.prisma`. A entidade `Order` possui cliente, endereço, coordenadas, pagamento, totais, tipo de pedido, comanda, usuário criador, entregador e timestamps operacionais [6].

| Entidade | Campos ou relações essenciais | Telas que dependem dela |
|---|---|---|
| `User` | `name`, `email`, `password`, `role`, `active`, `driverLat`, `driverLng`, `driverUpdatedAt` | Usuários, Mapa, autenticação. |
| `Order` | `status`, `type`, cliente, endereço, latitude/longitude, pagamento, subtotal, taxa, total, `comandaId`, `driverId`, timestamps | Todas as seis telas. |
| `OrderItem` | Produto, quantidade, preço unitário, total, sabores, snapshot de ingredientes, observações | Dashboard, Contatos, Comandas, Resumo Diário. |
| `OrderItemExtra` | Adicional, quantidade, preço e snapshot do nome | Dashboard, Contatos, Comandas, Resumo Diário. |
| `OrderItemComplement` | Complemento associado ao item | Contatos e Comandas. |
| `Comanda` | Número, status `livre/ocupada/inativa`, ativo e responsável | Comandas e pedidos locais. |
| `DeliveryZone` | Nome, taxa, cor, prioridade, geometria e ativo | Mapa, pedidos e configurações. |
| `CustomerContactProfile` | `phoneKey`, observações internas e nome substituto | Contatos. |
| `DriverActiveRoute` | Entregador, IDs ordenados, etapas, geometria, depósito e resumo | Mapa. |
| `Setting` | Chave/valor, especialmente `delivery_last_closed_at`, coordenadas do mapa e configurações de delivery | Dashboard, Mapa, Resumo e operação de delivery. |

Os enums relevantes são `OrderStatus = novo, em_preparo, comanda, em_rota, pronto_retirada, entregue, cancelado`, `OrderType = delivery, local, retirada`, `PaymentMethod = pix, dinheiro, cartao_credito, cartao_debito` e `ComandaStatus = livre, ocupada, inativa` [6].

## 4. Página Dashboard

### 4.1. Propósito e rota

A página está em `/admin` e é implementada por `src/app/admin/page.tsx`. Ela oferece leitura gerencial do período selecionado, com métricas financeiras, volume de pedidos, distribuição por status, tipo e pagamento, análise de movimento, produtos mais vendidos, ingredientes mais utilizados e tempos médios por etapa [8].

O período padrão é os últimos 30 dias até a data atual. O administrador pode alterar as datas inicial e final. A página envia `from` e `to` para `/api/admin/dashboard`; quando o usuário seleciona um dia da semana no bloco de movimento, acrescenta o parâmetro `weekday` [8].

### 4.2. Componentes funcionais

| Bloco | Conteúdo |
|---|---|
| Indicadores principais | Total de vendas, quantidade de pedidos, ticket médio e itens vendidos. |
| Indicadores operacionais | Pedidos ativos, taxas de entrega, cancelamentos com percentual e retiradas. |
| Média por status | Tempo médio em `novo`, `em_preparo`, `em_rota` e `pronto_retirada`/“Até balcão”. |
| Status dos pedidos | Contagem de `novo`, `em_preparo`, `em_rota`, `pronto_retirada`, `entregue` e `cancelado`. |
| Canais de pedido | Quantidade e receita por `delivery`, `retirada` e `local`. |
| Pagamentos | Quantidade e receita por forma de pagamento. |
| Horários de movimento | Média geral por dia da semana; ao clicar, detalha média por hora para aquele dia. |
| Top produtos | Até seis produtos com quantidade vendida e receita calculada. |
| Ingredientes favoritos | Até oito ingredientes por número de saídas, separando uso como base e como adicional. |

### 4.3. Regras das métricas

O endpoint `/api/admin/dashboard` busca os pedidos do período e calcula as agregações no servidor [9]. Pedidos cancelados permanecem disponíveis para contagem de status, mas não entram em vendas, quantidade faturável, ticket médio, itens vendidos, canais ou pagamentos. A taxa de cancelamento é calculada como cancelados dividido pelo total de pedidos do período, incluindo os cancelados.

| Métrica | Regra observada |
|---|---|
| Total de vendas | Soma de `Order.total` apenas dos pedidos não cancelados. |
| Pedidos | Quantidade de pedidos não cancelados. |
| Ticket médio | `totalSales / orderCount`; zero quando não há pedidos faturáveis. |
| Itens vendidos | Soma das quantidades de itens de pedidos não cancelados. |
| Taxas de entrega | Soma de `deliveryFee` dos pedidos não cancelados. |
| Pedidos ativos | Pedidos nos status `novo`, `em_preparo` ou `em_rota`. |
| Cancelamentos | Quantidade de pedidos com status `cancelado`. |
| Taxa de cancelamento | Cancelados dividido pelo total de pedidos, multiplicado por 100. |
| Produto mais vendido | Agrupamento de `OrderItem` por produto e soma de quantidade, limitado a seis. |
| Categoria favorita de ingrediente | Baseada nos snapshots dos ingredientes do item; quando não há snapshot, usa a composição atual do produto. |

Os tempos são calculados entre timestamps do pedido. Por exemplo, a etapa “Novo” mede criação até preparo; “Em preparo” mede preparo até pronto, envio ou entrega; “Em rota” mede envio até entrega; e o total de delivery mede criação até entrega somente para pedidos do tipo `delivery` [9]. Pedidos ainda em andamento usam o momento atual como fim em algumas métricas, o que significa que os valores podem crescer enquanto a operação está aberta.

A análise por dia da semana divide o total pelo número de ocorrências daquele dia no intervalo selecionado. Ao selecionar um dia, a análise por hora também é dividida pelo número de ocorrências daquele dia no período. Essa é uma média histórica do intervalo, não uma série temporal diária.

### 4.4. Contrato técnico

| Método | Endpoint | Parâmetros | Retorno principal |
|---|---|---|---|
| `GET` | `/api/admin/dashboard` | `from`, `to`, opcionalmente `weekday`; também aceita `start` e `end` | `kpis`, `topProducts`, `ingredientFavorites`, `statusCounts`, `typeBreakdown`, `paymentBreakdown`, `weekdaySales`, `hourlySales`, `averageStatusTimes`. |

### 4.5. Requisitos para portar

O outro sistema precisa ter pedidos com timestamps de ciclo de vida, itens com quantidade e snapshots de ingredientes, e uma forma consistente de distinguir pedidos faturáveis de cancelados. Recomenda-se preservar o cálculo no backend para evitar divergência entre telas e permitir exportação ou relatórios futuros.

**Ponto de atenção:** o dashboard converte o fim do intervalo usando `T23:59:59.999Z`, enquanto o resumo diário usa configuração de horário local no servidor. Antes de portar, padronize explicitamente o fuso horário da loja, especialmente para datas próximas à meia-noite [9] [29].

## 5. Página Usuários

### 5.1. Propósito e interface

A página está em `/admin/usuarios` e oferece CRUD de usuários internos. A listagem mostra nome, e-mail, papel, status ativo/inativo e ações de editar e excluir [10]. O formulário permite criar ou editar nome, e-mail, senha, papel e ativo.

Os papéis disponibilizados na interface são:

| Papel | Rótulo na interface | Uso operacional esperado |
|---|---|---|
| `admin` | Admin | Acesso ao painel completo. |
| `garcom` | Garçom | Operação de comandas e pedidos locais autorizados. |
| `entregador` | Entregador | Operação de entregas e localização. |

Ao editar um usuário, a senha é opcional: vazia significa manter a senha atual. Ao criar, a senha é obrigatória no formulário. O administrador não pode excluir a própria conta pela interface [10].

### 5.2. Contrato técnico

| Método | Endpoint | Comportamento |
|---|---|---|
| `GET` | `/api/admin/users` | Lista usuários ordenados por nome e retorna `id`, `name`, `email`, `role`, `active` e `createdAt`. |
| `POST` | `/api/admin/users` | Valida conflito de e-mail, gera hash da senha e cria o usuário. Papel padrão: `admin`; ativo padrão: `true`. |
| `PATCH` | `/api/admin/users/:id` | Atualiza parcialmente nome, e-mail, papel, ativo e, se informado, a senha com novo hash. |
| `DELETE` | `/api/admin/users/:id` | Remove o usuário pelo ID. |

Os endpoints estão em `src/app/api/admin/users/route.ts` e `src/app/api/admin/users/[id]/route.ts` [11] [12]. A proteção para administrador é feita pelo middleware; ao replicar, recomenda-se adicionar verificação explícita de sessão e papel em cada handler.

### 5.3. Requisitos para portar

São necessários: tabela de usuários, hash de senha, enum ou catálogo de papéis, flag de ativação, sessão que carregue `id` e `role`, validação de e-mail único e regra para impedir autoexclusão. É aconselhável também impedir via backend a remoção do próprio usuário e evitar que uma atualização transforme o último administrador ativo em usuário inativo.

## 6. Página Contatos

### 6.1. Propósito e experiência

A página está em `/admin/contatos`. Ela consolida pedidos por cliente usando o telefone como chave e apresenta uma interface mestre-detalhe. Na coluna esquerda há busca, ordenação, filtros, cartões de clientes e paginação. Na coluna direita aparece o resumo do contato, histórico expansível, observações internas e endereços utilizados [13].

A listagem permite buscar por nome ou telefone, ordenar por recentes, mais frequentes ou maior gasto, filtrar clientes sem pedido há uma quantidade mínima de dias e mostrar somente contatos com observações. A busca é aplicada com pequeno atraso de 250 ms para evitar uma requisição a cada tecla [13].

### 6.2. Identificação e agregação do contato

O helper `admin-contacts.ts` normaliza o telefone removendo caracteres não numéricos, DDI `55` em determinados formatos, zeros iniciais e, quando necessário, mantendo os últimos 11 ou 8 dígitos [14]. Essa chave normalizada é chamada `phoneKey` e é utilizada para consolidar pedidos e localizar o perfil manual do cliente.

| Campo da lista | Regra |
|---|---|
| Nome | Usa `displayNameOverride` quando preenchido; caso contrário, usa o nome do pedido mais recente disponível. |
| Pedidos totais | Conta todos os pedidos associados, inclusive cancelados. |
| Pedidos válidos | Conta pedidos não cancelados. |
| Gasto total | Soma o total somente de pedidos não cancelados. |
| Último pedido | Data do pedido mais recente, inclusive se ele estiver cancelado. |
| Dias sem pedido | Diferença em dias desde o pedido mais recente. |
| Categoria favorita | Categoria presente em mais pedidos; cada categoria conta no máximo uma vez por pedido. |
| Observação | Indica se existe perfil manual e exibe prévia de até 120 caracteres. |

O endpoint de listagem carrega pedidos que possuem telefone e perfis de contato, depois delega a agregação, filtros, ordenação e paginação ao helper [15]. A interface sempre solicita `pageSize=20`, enquanto o helper limita qualquer tamanho recebido entre 1 e 100.

### 6.3. Detalhe do contato

Ao selecionar um contato, a página consulta `/api/admin/contacts/:phoneKey`. O detalhe mostra pedidos totais, gasto total, média de entrega, cancelados, categoria favorita e último pedido. Cada pedido pode ser expandido para visualizar status, tipo, data, endereço, pagamento, troco, PIX, subtotal, taxa, total, itens, sabores, adicionais, complementos e observações [13] [16].

A média de entrega considera apenas pedidos com status `entregue` e calcula criação até `deliveredAt`. Os endereços são deduplicados pela combinação de endereço, número, referência e tipo do pedido, mantendo o último uso.

O painel de observações internas envia `PATCH` para o mesmo endpoint. O corpo aceita `notes` e `displayNameOverride`; se ambos ficarem vazios, o perfil é removido. A interface atual edita somente `notes`, embora o backend já suporte o nome substituto [16].

### 6.4. Contrato técnico

| Método | Endpoint | Parâmetros ou corpo | Retorno |
|---|---|---|---|
| `GET` | `/api/admin/contacts` | `q`, `sort=recent\|frequent\|spent`, `staleDays`, `hasNotes`, `page`, `pageSize` | `{ items, total, page, pageSize, totalPages }`. |
| `GET` | `/api/admin/contacts/:phoneKey` | Chave de telefone normalizada na URL | Resumo do cliente, endereços e histórico completo. |
| `PATCH` | `/api/admin/contacts/:phoneKey` | `{ notes?, displayNameOverride? }` | Perfil salvo ou removido quando vazio. |

Os endpoints exigem sessão autenticada e retornam `401` quando não há usuário [15] [16].

### 6.5. Requisitos para portar

O outro sistema deve manter uma estratégia de telefone normalizado e estável. Não é suficiente agrupar pelo texto bruto do telefone, pois o mesmo cliente pode aparecer com DDI, máscara, espaços ou formatos diferentes. Também é necessária uma tabela de perfil manual separada do pedido, para que observações internas e nome comercial não sejam sobrescritos pelo próximo pedido.

Recomenda-se criar índice sobre `phoneKey`, manter paginação no backend e decidir se pedidos cancelados serão tratados da mesma forma em todos os relatórios. A regra atual é coerente para gasto — cancelados não gastam —, mas o pedido cancelado ainda influencia a noção de último contato e o total bruto de pedidos.

## 7. Página Mapa

### 7.1. Propósito e experiência

A página está em `/admin/mapa` e é intitulada “Mapa de Entregas”. Ela combina mapa Leaflet com painel lateral. O mapa exibe pedidos delivery ativos que possuem coordenadas, rotas salvas de entregadores, marcadores de entregadores e polígonos de zonas de entrega [17] [18].

A tela consulta o backend imediatamente e repete a consulta a cada cinco segundos. Também oferece botão de atualização manual, indicador do horário da última atualização, botão para mostrar ou ocultar zonas, filtro por status e filtro por entregador [17].

| Elemento | Comportamento |
|---|---|
| Indicadores | Mostra total de pedidos abertos, em rota, novos e em preparo. |
| Filtro de status | `Todos`, `Novos`, `Preparo` e `Em rota`. |
| Filtro de entregador | Todos, sem entregador ou um entregador específico. |
| Lista de entregadores | Mostra nome, número de pedidos, existência de rota salva e situação do GPS. |
| Lista de pedidos | Mostra número, cliente, endereço, status, entregador e zona. Clicar seleciona o pedido no mapa. |
| Zonas | Alternância de visibilidade de polígonos com nome e cor. |
| Seleção | Selecionar um pedido também seleciona seu entregador; selecionar entregador aplica o filtro correspondente. |

A localização é classificada como “Tempo real” quando atualizada há menos de dois minutos. Entre dois e 60 minutos aparece como localização defasada em minutos; depois disso, em horas. Sem timestamp ou coordenadas, aparece “Sem localização” [17] [19].

### 7.2. Dados aceitos pelo mapa

O endpoint `/api/admin/mapa` filtra somente pedidos com `type='delivery'`, status `novo`, `em_preparo` ou `em_rota`, latitude e longitude preenchidas. Quando existe `delivery_last_closed_at`, também exige que o pedido tenha sido criado a partir desse fechamento [18].

A resposta inclui pedidos, rotas ativas, zonas ativas, centro do mapa e o timestamp de geração. As rotas são reduzidas às que possuem pelo menos um pedido ainda retornado na consulta. O centro usa `city_lat/city_lng`, depois `vroom_depot_lat/vroom_depot_lng`, e por fim o fallback `[ -8.05, -34.87 ]` [18].

O componente visual cria camadas separadas para zonas, rotas e marcadores. Os pedidos são desenhados por status, com número do pedido no marcador; entregadores aparecem com iniciais, nome, quantidade de pedidos e situação da localização. A rota usa `routeGeometry` quando há geometria suficiente e, caso contrário, tenta usar os pontos de `steps` [19].

### 7.3. Origem da localização e das rotas

O entregador atualiza sua posição via `POST /api/entregador/location` com `{ lat, lng }`. O backend grava a posição e o timestamp no usuário e também atualiza settings globais de localização [20]. O mapa lê a posição vinculada ao entregador por meio da relação do pedido ou da rota ativa.

As rotas ativas são produzidas pelo módulo do entregador. A documentação do projeto descreve a integração com VROOM para otimização, fallback por distância e OSRM para geometria de rua [21]. A persistência usa `DriverActiveRoute`, com IDs ordenados, etapas, geometria, depósito e resumo [6].

A regra `delivery_last_closed_at` é configurada quando o delivery é fechado. Esse valor delimita a sessão operacional atual e é reutilizado por mapa, pedidos e resumo [22].

### 7.4. Contrato técnico

| Método | Endpoint | Parâmetros | Retorno |
|---|---|---|---|
| `GET` | `/api/admin/mapa` | Nenhum; a tela acrescenta um parâmetro de cache apenas no frontend | `{ orders, activeRoutes, zones, mapCenter, generatedAt }`. |
| `POST` | `/api/entregador/location` | `{ lat, lng }` | `{ ok: true }`; atualiza GPS do entregador autenticado. |
| `POST` | `/api/entregador/optimize` | Pedidos em rota e configurações da base | Persiste rota ativa, etapas e geometria para o entregador. |

### 7.5. Requisitos para portar

São obrigatórios: coordenadas dos pedidos, coordenadas e timestamp dos entregadores, zonas com geometria e cor, rota ativa persistida, centro ou depósito do mapa e polling ou canal de tempo real. Para uma primeira versão, o mapa pode funcionar apenas com pedidos e entregadores; zonas e rotas salvas podem ser adicionadas em seguida.

Não se deve reutilizar automaticamente o fallback de coordenadas sem revisar a localidade do novo sistema. O fallback atual aponta para Recife e deve ser substituído pelas coordenadas da nova operação.

## 8. Página Comandas

### 8.1. Arquitetura da tela

A rota `/admin/comandas` é apenas um wrapper que renderiza `GarcomComponent` com `isAdminView={true}` [23]. Isso significa que a funcionalidade não está isolada no admin: o mesmo componente também atende a rota `/garcom`, com diferença de permissões e visibilidade de controles.

A tela possui quatro etapas de navegação:

1. **Comanda:** grade de mesas/comandas, situação livre/ocupada/inativa e, no admin, geração em lote.
2. **Detalhes:** consumo acumulado, pedidos já lançados, responsável da mesa e controles administrativos.
3. **Cardápio:** busca de produto, filtro por categoria e catálogo ativo.
4. **Carrinho:** revisão do subpedido, quantidades, observações e envio para a cozinha.

O componente carrega categorias, produtos ativos e comandas. Ele atualiza a lista e os detalhes a cada cinco segundos [24]. No modo admin, comandas inativas permanecem visíveis; no modo garçom, são filtradas.

### 8.2. Funcionalidades da comanda

| Função | Comportamento |
|---|---|
| Gerar lote | Informa número inicial e quantidade; cria várias comandas. |
| Abrir comanda | Seleciona a mesa, limpa o carrinho de rascunho e carrega detalhes. |
| Identificar responsável | Salva `responsibleName` ao perder foco do campo. |
| Ver consumo | Soma os totais dos pedidos vinculados à comanda. |
| Adicionar produto | Permite produto simples ou abre modal de configuração. |
| Personalizar item | Seleciona sabores até `maxFlavors`, complementos, adicionais por quantidade e observação. |
| Editar carrinho | Altera quantidade ou remove o item ao chegar a zero. |
| Enviar para cozinha | Cria um pedido `local` vinculado à comanda e limpa o carrinho. |
| Excluir item lançado | Remove o item, ajusta o pedido e pode liberar a comanda quando não restarem pedidos ativos. |
| Migrar item | Move um item de uma comanda para outra, ajustando totais de origem e destino. |
| Liberar mesa | Marca pedidos abertos como entregues e a comanda como livre. |
| Ativar/inativar | Alterna o campo `active` da comanda. |
| Excluir comanda | Remove a comanda, sujeito às restrições do banco e aos pedidos vinculados. |

Ao enviar o carrinho, o frontend chama `POST /api/admin/orders` com `type='local'`, `paymentMethod='dinheiro'`, `comandaId` e os itens. O backend calcula os itens, subtotal e total, grava o usuário da sessão e cria o pedido em `em_preparo` quando o tipo é local ou quando existe `comandaId` [24] [25]. Em seguida, o componente atualiza a comanda para `ocupada` e recarrega os detalhes [24].

### 8.3. Contrato técnico

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/admin/comandas` | Lista comandas com contagem de pedidos, ordenadas por número. |
| `POST` | `/api/admin/comandas` | Cria comandas em lote a partir de `startNumber` e `quantity`. |
| `GET` | `/api/admin/comandas/:id` | Retorna a comanda, pedidos não cancelados, itens, extras e complementos. |
| `PATCH` | `/api/admin/comandas/:id` | Atualiza campos recebidos, incluindo `status`, `active` e `responsibleName`. |
| `DELETE` | `/api/admin/comandas/:id` | Exclui a comanda. |
| `POST` | `/api/admin/comandas/:id/release` | Finaliza pedidos que não estejam entregues/cancelados e libera a comanda. |
| `POST` | `/api/admin/comandas/:id/close` | Atualmente apenas soma pedidos e retorna total/quantidade. |
| `POST` | `/api/admin/comandas/delete-item` | Remove item de pedido e recalcula ou remove o pedido. |
| `POST` | `/api/admin/comandas/migrate-item` | Migra item entre comandas e corrige os totais envolvidos. |
| `POST` | `/api/admin/orders` | Cria o subpedido local enviado à cozinha. |

### 8.4. Inconsistência importante observada

A interface apresenta o botão **“Fechar Comanda”** e mostra uma confirmação dizendo que os pedidos abertos serão finalizados. Entretanto, a rota `/api/admin/comandas/:id/close` atualmente apenas busca os pedidos, soma seus totais e retorna `{ total, orderCount }`; ela não altera status de pedido nem o status da comanda [24] [26].

A ação que efetivamente finaliza pedidos abertos e muda a comanda para `livre` é `/release` [27]. Ao portar, há duas opções: renomear o botão para “Consultar total” e manter a semântica atual, ou corrigir o endpoint `close` para realizar o fechamento esperado e deixar `release` apenas como liberação operacional. Essa decisão deve ser tomada antes da migração para não reproduzir uma ação com mensagem enganosa.

## 9. Página Resumo Diário

### 9.1. Propósito e interface

A página está em `/admin/resumo`. O administrador escolhe uma data e consulta os pedidos criados naquele dia. A tela mostra total, quantidade de pedidos, finalizados e média por pedido. Cada pedido aparece em um cartão expansível com status, cliente, telefone, endereço, horários, duração da entrega, itens, adicionais, observações, financeiro e pagamento [28].

O total do dia é calculado pelo endpoint como soma de todos os pedidos retornados para a data, sem excluir cancelados. A quantidade de finalizados na interface considera pedidos `entregue` e `pronto_retirada` [28] [29]. Essa regra é diferente do dashboard, que exclui cancelados das vendas faturáveis.

### 9.2. Alerta de entregas aguardando fechamento

O resumo também verifica se há pedidos delivery ainda ativos de uma sessão anterior. Quando `delivery_last_closed_at` existe e é anterior ao início do dia atual, o backend busca pedidos `delivery` com status `novo`, `em_preparo` ou `em_rota` criados até o último fechamento [29].

A interface exibe um alerta de “Entregas aguardando fechamento”, mostrando há quanto tempo cada pedido está parado, seu cliente, telefone, endereço, entregador, quantidade de itens e total. O administrador pode confirmar a entrega ou cancelar o pedido. Essas ações chamam `PATCH /api/admin/orders/:id/status` com `entregue` ou `cancelado` [28].

### 9.3. Contrato técnico

| Método | Endpoint | Parâmetros | Retorno |
|---|---|---|---|
| `GET` | `/api/admin/summary` | `date=YYYY-MM-DD` | `{ date, orders, total, count, stalledDeliveryAlert }`. |
| `PATCH` | `/api/admin/orders/:id/status` | `{ status: 'entregue'\| 'cancelado' }` | Pedido atualizado e efeitos colaterais do fluxo de status. |

O endpoint de mudança de status também pode publicar evento de impressão, limpar rota ativa do entregador ao sair de `em_rota` e disparar notificação ao cliente, conforme o restante da implementação do pedido [30].

### 9.4. Requisitos para portar

O módulo exige uma consulta por intervalo de dia, relação com itens/produtos/adicionais, timestamps de operação, status de pedido, entregador e o conceito de fechamento operacional do delivery. O alerta de pedidos travados deve ser implementado com cuidado: ele não depende apenas da data selecionada, mas do último fechamento real da operação.

## 10. Matriz consolidada de endpoints

| Página | Leitura principal | Escritas principais | Integrações associadas |
|---|---|---|---|
| Dashboard | `GET /api/admin/dashboard` | Nenhuma | Pedidos, itens, produtos, timestamps. |
| Usuários | `GET /api/admin/users` | `POST /api/admin/users`, `PATCH/DELETE /api/admin/users/:id` | NextAuth, bcrypt, papéis. |
| Contatos | `GET /api/admin/contacts`, `GET /api/admin/contacts/:phoneKey` | `PATCH /api/admin/contacts/:phoneKey` | Pedidos, telefone normalizado, perfil de contato. |
| Mapa | `GET /api/admin/mapa` | Indiretamente, GPS e rotas do entregador | Leaflet, zonas, GPS, VROOM/OSRM. |
| Comandas | `GET/POST /api/admin/comandas`, `GET/PATCH/DELETE /api/admin/comandas/:id` | Release, close, delete-item, migrate-item, criação de pedido | Catálogo, cozinha/impressão, pedidos locais. |
| Resumo Diário | `GET /api/admin/summary` | `PATCH /api/admin/orders/:id/status` | Fechamento do delivery, push, impressão. |

## 11. Plano recomendado de replicação

### Fase 1 — Fundamentos de acesso e dados

Implemente usuários, autenticação, papéis, pedidos, itens, produtos, status, pagamentos e timestamps. Crie índices para `Order.status`, `Order.createdAt`, `Order.comandaId`, `Order.driverId` e `CustomerContactProfile.phoneKey`. Esses campos sustentam as consultas mais frequentes das seis telas [6].

### Fase 2 — Operação de pedidos e comandas

Implemente a criação de pedidos locais, o carrinho da comanda, consumo acumulado, identificação do responsável, liberação, exclusão e migração de itens. Defina formalmente a diferença entre “fechar” e “liberar” uma comanda antes de construir os botões.

### Fase 3 — Contatos e resumo

Adicione normalização de telefone, agregação por cliente, perfil de observações, histórico de pedidos, endereços deduplicados e resumo por data. Faça uma decisão de produto sobre o tratamento de cancelados e aplique a mesma política em dashboard, contatos e resumo.

### Fase 4 — Mapa operacional

Adicione coordenadas de pedidos, GPS de entregadores, zonas e centro do mapa. Depois persista rotas ativas e integre um otimizador como VROOM, com OSRM ou serviço equivalente para desenhar a rota viária. Comece com atualização periódica e substitua por eventos em tempo real se a escala justificar.

### Fase 5 — Métricas e robustez

Replique as agregações do dashboard no backend, padronize timezone, adicione estados de carregamento/erro, auditoria de alterações e testes de contrato para cada endpoint. Em produção, monitore custo do polling e tempo de consulta das APIs administrativas.

## 12. Critérios de aceite para o novo sistema

| Área | Critério mínimo |
|---|---|
| Dashboard | Alterar o intervalo atualiza todas as métricas; cancelados não entram em vendas, mas aparecem na taxa e na contagem de status. |
| Usuários | Criar, editar, ativar/inativar e excluir respeitando papéis, e-mail único e autoexclusão bloqueada. |
| Contatos | O mesmo telefone em formatos diferentes aparece como um cliente; filtros e paginação funcionam no backend. |
| Mapa | Somente deliveries ativos com coordenadas aparecem; pedidos, entregadores, zonas e rotas podem ser identificados individualmente. |
| Comandas | Um subpedido local vinculado à mesa entra em preparo, incrementa o consumo e ocupa a comanda. |
| Comandas | Remover/migrar item recalcula origem e destino sem deixar totais inconsistentes. |
| Resumo | A data selecionada retorna pedidos, totais e detalhes; pedidos travados de sessão anterior aparecem com ações de resolução. |
| Segurança | Usuário sem papel adequado não consegue consultar ou alterar APIs administrativas. |
| Datas | Dashboard, resumo e fechamento do delivery usam a mesma política de fuso horário. |

## 13. Pontos de atenção antes de copiar a implementação

Primeiro, corrija ou documente a semântica de **fechar versus liberar comanda**. Segundo, centralize as regras de faturamento para que dashboard e resumo não apresentem totais incompatíveis sem uma decisão explícita. Terceiro, não dependa somente do middleware para segurança de APIs. Quarto, substitua o fallback geográfico do mapa pelas coordenadas da nova operação. Quinto, preserve snapshots de nomes, preços e ingredientes nos itens, pois o histórico de contatos e as métricas dependem de dados que não devem mudar retroativamente quando o catálogo for editado.

A base já possui documentação complementar de pedidos/clientes, entregadores/roteirização e deploy, que pode ser usada como material de apoio durante a implementação [21] [31] [32].

## Referências

[1]: https://github.com/Serphits-code/alldelivery/commit/2b8cb1e64760b902c2362a759278b6ac6c2f7625 "Commit analisado do AllDelivery"

[2]: https://github.com/Serphits-code/alldelivery/blob/main/package.json "Dependências e scripts do projeto"

[3]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/layout.tsx "Layout global da aplicação"

[4]: https://github.com/Serphits-code/alldelivery/blob/main/src/components/admin/admin-layout.tsx "Layout e menu administrativo"

[5]: https://github.com/Serphits-code/alldelivery/blob/main/src/lib/auth.ts "Configuração de autenticação NextAuth"

[6]: https://github.com/Serphits-code/alldelivery/blob/main/prisma/schema.prisma "Schema Prisma e modelo de dados"

[7]: https://github.com/Serphits-code/alldelivery/blob/main/src/middleware.ts "Middleware de autenticação e autorização"

[8]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/page.tsx "Página do Dashboard"

[9]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/dashboard/route.ts "API de métricas do Dashboard"

[10]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/usuarios/page.tsx "Página de Usuários"

[11]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/users/route.ts "API de listagem e criação de usuários"

[12]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/users/[id]/route.ts "API individual de usuários"

[13]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/contatos/page.tsx "Página de Contatos"

[14]: https://github.com/Serphits-code/alldelivery/blob/main/src/lib/admin-contacts.ts "Agregação e regras de contatos"

[15]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/contacts/route.ts "API de listagem de contatos"

[16]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/contacts/[phoneKey]/route.ts "API de detalhe e perfil de contato"

[17]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/mapa/page.tsx "Página do Mapa de Entregas"

[18]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/mapa/route.ts "API do Mapa de Entregas"

[19]: https://github.com/Serphits-code/alldelivery/blob/main/src/components/admin/mapa/LiveDeliveryMap.tsx "Componente Leaflet do mapa administrativo"

[20]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/location/route.ts "API de atualização de localização do entregador"

[21]: https://github.com/Serphits-code/alldelivery/blob/main/delivery.md "Documentação de entregadores e roteirização"

[22]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/settings/delivery/route.ts "Abertura e fechamento do delivery"

[23]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/comandas/page.tsx "Wrapper da página administrativa de comandas"

[24]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/garcom/GarcomComponent.tsx "Componente compartilhado de comandas e garçom"

[25]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/orders/route.ts "API de pedidos do admin"

[26]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/comandas/[id]/close/route.ts "API atual de fechamento de comanda"

[27]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/comandas/[id]/release/route.ts "API de liberação de comanda"

[28]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/admin/resumo/page.tsx "Página de Resumo Diário"

[29]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/summary/route.ts "API de Resumo Diário"

[30]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/admin/orders/[id]/status/route.ts "API de mudança de status de pedido"

[31]: https://github.com/Serphits-code/alldelivery/blob/main/pedido-spec.md "Especificação funcional de pedidos e clientes"

[32]: https://github.com/Serphits-code/alldelivery/blob/main/passo-passo.md "Guia de deploy do AllDelivery"
