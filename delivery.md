# Especificação Técnica do Sistema de Entregadores — AllDelivery

Este documento detalha o funcionamento técnico, arquitetura física de rotas e fluxo operacional do sistema de entregadores (pilotos) no ecossistema AllDelivery. O módulo foi desenvolvido com foco prioritário em usabilidade mobile, otimização de rotas por inteligência geográfica, roteamento amigável para veículos leves e rastreamento em tempo real.

---

## 1. Fluxo de Autenticação, Controle de Sessão e Redirecionamento

O controle de acesso dos entregadores é gerenciado de forma segura na plataforma por meio de uma arquitetura baseada em Next-Auth e um middleware de proteção de rotas no Next.js.

### A. Processo de Login (Credentials Provider)
A autenticação central é implementada em [src/app/login/page.tsx](src/app/login/page.tsx) utilizando a estratégia de credenciais:
- O usuário insere suas credenciais de e-mail e senha.
- Se o usuário já possuir uma sessão ativa e desejar logar com outra conta, o sistema invoca `signOut({ redirect: false })` para limpar a sessão prévia.
- É acionada a função de serviço `signIn('credentials', { email, password, redirect: false })`.
- No callback de sucesso das credenciais — implementado em [src/lib/auth.ts](src/lib/auth.ts) —, o banco de dados PostgreSQL é consultado para verificar a propriedade `role` (função) configurada para aquela conta.

### B. Análise Reativa do Perfil (Role Redirect)
Ao realizar o login, a plataforma intercepta dinamicamente a sessão recebida:
- O frontend recupera os dados atualizados com `getSession()`.
- O papel (`role`) é verificado sob três atribuições primárias:
  - `role === 'entregador'`: O usuário é imediatamente redirecionado do login para a área operacional do piloto: `/entregador` (desenvolvido em [src/app/entregador/page.tsx](src/app/entregador/page.tsx)).
  - `role === 'garcom'`: O usuário é direcionado para a tela de comandas e mesas: `/garcom`.
  - Outros perfis (`admin` ou gerentes): São redirecionados para a tela administrativa de destino (`/admin` de forma geral ou o `callbackUrl` configurado).

### C. Proteção com Middleware de Rotas
Para impedir acessos não autorizados por meio da digitação direta de URLs no navegador, o arquivo [src/middleware.ts](src/middleware.ts) impõe restrições rígidas baseadas em Tokens JWT decodificados:
- Tanto a rota visual de interface `/entregador` quanto sua respectiva API `/api/entregador` exigem que o token da sessão decodificada possua a atribuição `role === 'entregador'` ou `role === 'admin'`.
- Caso essa validação falhe ou a sessão não possua token ativo, a requisição é interceptada pelo middleware e o usuário é redirecionado para a página `/login`, preservando o parâmetro original no query-string como `callbackUrl` para redirecionamento posterior.

---

## 2. Painel Operacional, Fila de Entrega e Gestão da Bag

Uma vez autêntico, o entregador acessa a aplicação móvel via [src/app/entregador/page.tsx](src/app/entregador/page.tsx). O design de interface é concebido sob medida para dispositivos móveis (Mobile-First) e é dividido em duas seções de listagem operacional em tempo real:

### A. Fila de Pedidos Disponíveis vs. Minha Bag

1. **Pedidos Disponíveis (Fila Pública)**: São ordens de entrega que os administradores despacharam do painel Kanban central. Estas ordens passam ao status `em_rota`, mas mantêm como nula a relação do entregador (`driverId = null`).
2. **Minha Bag (Fila Privada)**: Contém o grupo de pacotes agregados pelo piloto conectado para serem entregues conjuntamente nas ruas (`driverId = session.user.id`).

```
                    ┌──────────────────────────────────────────────┐
                    │            Painel Administrativo             │
                    │        (Pedido despachado no Kanban)         │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼ (Status transita para: em_rota)
                    ┌──────────────────────────────────────────────┐
                    │          Pedidos Disponíveis na Rota         │
                    │               (driverId = NULL)              │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           │ (Entregador aceita / coloca na Bag)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │               Bag do Entregador              │
                    │            (driverId = ID_ENTREGADOR)        │
                    └──────────────────────────────────────────────┘
```

### B. Ciclo de Vida do Pedido via Transições de Estado (Endpoints PATCH)
As operações executadas para organizar a coleta e entrega baseiam-se em chamadas PATCH para a rota [src/app/api/entregador/orders/[id]/route.ts](src/app/api/entregador/orders/%5Bid%5D/route.ts):

*   **Coleta para a Bag (`action: 'claim'`)**:
    O piloto seleciona um pedido disponível para colocá-lo em sua bag. A API restringe essa ação com uma atualização lógica segura (`updateMany`). Se outro motorista reivindicar o pacote frações de segundos antes, o PostgreSQL bloqueia e retorna erro `HTTP 409 (Conflict)` com a mensagem "Pedido já está na bag de outro entregador". Caso obtenha êxito:
    1. O campo `driverId` é atualizado com o ID do piloto logado.
    2. Invoca-se `clearDriverActiveRoute(driverId)` em [src/lib/driver-active-route.ts](src/lib/driver-active-route.ts) para excluir o cache persistido da rota anterior, forçando o recálculo imediato do caminho na próxima renderização de mapa.
*   **Devolução à Fila (`action: 'release'`)**:
    Caso o entregador desista do frete devido a peso excessivo ou limitações geográficas, ele pode liberá-lo voluntariamente de sua bag. A chamada redefine `driverId = null`, recolocando o pedido como disponível para os demais motoboys e limpando o cache das geometrias de rota ativa.
*   **Confirmação de Entrega Realizada (`status: 'entregue'`)**:
    O pacote é entregue fisicamente ao cliente. O patch altera o status para `entregue` e invoca funções adicionais:
    1. Gravação automática do timestamp exato de entrega (`deliveredAt`) no PostgreSQL.
    2. Apaga o cache persistido da rota do piloto (`clearDriverActiveRoute`).
    3. Dispara o gatilho assíncrono `notifyCustomerOrderStatus` em [src/lib/push-notifications.ts](src/lib/push-notifications.ts) para notificar o cliente final via Service Worker/VAPID Web Push de que sua compra foi finalizada.

---

## 3. Inteligência Geográfica de Roteamento Combinado (VROOM 'Bike-Style')

Para que um pacote seja entregue o mais rápido possível, o sistema AllDelivery realiza a otimização de paradas sob o conceito do Problema do Caixeiro Viajante (Traveling Salesperson Problem - TSP), acoplando múltiplos endereços de entrega à rota em menor tempo decorrido.

### A. Arquitetura de Comunicação com a API VROOM
O processo realiza buscas e submissões por meio do endpoint central [src/app/api/entregador/optimize/route.ts](src/app/api/entregador/optimize/route.ts):
1.  **Obtenção do Início (Piloto)**: O frontend obtém do GPS a localização física real do piloto (`driverLat`, `driverLng`) e envia via corpo da chamada.
2.  **Identificação do Ponto Base (Depot / Loja)**: O backend consulta os registros `vroom_depot_lat` e `vroom_depot_lng` na tabela `Setting` do banco para assinalar a sede física do restaurante como retorno obrigatório das decolagens de transporte.
3.  **Filtragem de Segurança**: O backend valida se os pedidos passados para a otimização pertencem estritamente à bag do piloto autenticado (`driverId = session.user.id` e `status = 'em_rota'`), prevenindo adulterações ou abusos de processamento em dados alheios por ataques diretos HTTP.

### B. Payload VROOM estruturado
Para se comunicar com o contêiner Docker local do motor VROOM, o AllDelivery monta a seguinte estrutura JSON:
*   **Jobs (Trabalhos)**: Mapeia as posições dos clientes. O VROOM adota o formato matemático padrão **`[longitude, latitude]`** para posições geográficas.
    ```json
    "jobs": [
      {
        "id": 1,
        "description": "ID_DO_PEDIDO_A",
        "location": [lng_cliente_a, lat_cliente_a]
      }
    ]
    ```
*   **Vehicles (Veículos)**: Define o ponto de partida do piloto, as capacidades e o local físico de término do turno. No AllDelivery, **o veículo é configurado unicamente com o perfil "Estilo Bike"**:
    ```json
    "vehicles": [
      {
        "id": 1,
        "profile": "bike",
        "start": [driverLng, driverLat],
        "end": [depotLng, depotLat]
      }
    ]
    ```
    *   **Por que Perfil 'Bike' no VROOM?**
        Diferente de perfis rodoviários como "car" ou "truck", o perfil de veículo `bike` modela os cálculos de velocidade média baseados em tração urbana leve, prevê cruzamentos adaptados para ciclovias/ciclofaixas, atalhos por caminhos pedonais e cortes em vias proibidas para automóveis terrestres de maior porte. Isso reflete fielmente o percurso feito por motoboys e bike-entregadores com altíssima precisão urbana.

### C. Estratégia de Fallback Geodésico (Trigometria sem VROOM)
Se o contêiner do VROOM estiver inacessível (ex: Timeout excedido de 5 segundos) ou retornar código de falha (`code !== 0`), o backend AllDelivery aciona uma rotina matemática direta de contingência `fallbackSort` baseada no cálculo de Haversine:
- Ordena as entregas da menor para a maior distância em linha reta, calculando o raio da Terra ($R = 6371\text{km}$) e multiplicando as coordenadas trigonométricas:
  $$\text{a} = \sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1) \cdot \cos(\text{lat}_2) \cdot \sin^2\left(\frac{\Delta\text{lng}}{2}\right)$$
  $$\text{Distância} = 2 \cdot R \cdot \arctan2\left(\sqrt{\text{a}}, \sqrt{1 - \text{a}}\right)$$
- Essa estratégia mitiga problemas de indisponibilidade de infraestrutura do servidor, garantindo que o piloto receba um traçado ordenado plausível e não fique sem orientações na rua.

---

## 4. Renderização do Traçado Real nas Ruas (OSRM com Fallback)

Após obter a ordem perfeita de paradas via VROOM ou pelo cálculo Haversine, o sistema traduz essas localizações em um polígono de traçado físico de ruas e avenidas ao invés de exibir linhas retas pontilhadas e cegas.

### A. Interpolação OSRM Server-Side
O backend faz chamadas de waypoints ordenados no fluxo [src/app/api/entregador/optimize/route.ts](src/app/api/entregador/optimize/route.ts) para serviços geográficos externos OSRM (OpenStreetMap Routing Machine):
1.  **Endpoint Primário (Bike Routing de Alta Fidelidade)**:
    `https://routing.openstreetmap.de/routed-bike/route/v1/driving/[waypoint1];[waypoint2]...`
    O uso do canal `/routed-bike/` é excelente pois é calibrado precisamente para tráfego de ciclomotores e bicicletas, mapeando restrições de sentido duplo de ciclovias, caminhos de pedestres compartilhados e vias de baixa intensidade automotiva.
2.  **Fallback de API Secundária (OSRM Standard)**:
    Caso o servidor especializado de bicicleta encontre-se offline or timeout (8 segundos), o AllDelivery encaminha a requisição ao servidor geral público da comunidade OSRM local em `router.project-osrm.org`.
3.  **Retorno da Geometria**:
    Ao coletar os resultados GeoJSON codificados, as coordenadas geográficas em formato `[lng, lat]` são invertidas no backend para `[lat, lng]` para compatibilidade imediata com as rendering de marcadores da biblioteca Leaflet no mapa visual.

### B. Persistência de Rotas no Banco de Dados (Cache Operacional)
Com a finalidade de poupar banda e taxas desnecessárias de APIs, a rota gerada é armazenada na tabela `DriverActiveRoute` via `saveDriverActiveRoute`:
- Estrutura contendo: `driverId`, `orderedIds` (ordem ideal de entrega), `steps` (detalhe de distâncias de chegada), `routeGeometry` (o vetor completo de latitude/longitude das vias para desenhar no mapa) e `summary` (totalizadores geométricos).

---

## 5. Visualização e Interface de Mapa Interativo (Modo Rota e Giroscópio)

O componente visual do frontend que recebe esses dados geográficos e os exibe de forma reativa e fluida é o [src/components/entregador/DeliveryMap.tsx](src/components/entregador/DeliveryMap.tsx). Este mapa possui inovações voltadas a simular dispositivos dedicados de navegação urbana como Waze ou Apple Maps:

### A. Giroscópio vs. Vetores de GPS (Bússola Dinâmica)
O AllDelivery ajusta inteligente e dinamicamente a rotação do mapa com base no movimento do veículo:
*   **Diferenciação de Velocidade**:
    O sistema monitora constantemente a velocidade relatada pelo sensor de GPS do smartphone (`watchPosition` em `speed`).
*   **Orientação por Bússola e Giroscópio (Piloto Parado - $\text{Speed} \le 0.8\text{m/s}$)**:
    Quando o piloto está estacionado buscando o endereço, a bússola magnética do dispositivo e o giroscópio do navegador são lidos via eventos de hardware `deviceorientationabsolute` ou `webkitCompassHeading`. O mapa de ruas gira em 3D sutilmente acompanhando a angulação física em que o celular é virado nas mãos do entregador.
*   **Orientação por Vetores Linear do GPS (Piloto em Movimento - $\text{Speed} > 0.8\text{m/s}$)**:
    Ao acelerar, correntes de vento ou interferências eletromagnéticas do próprio motor ou de fiações elétricas tendem a desequilibrar a agulha magnética interna do aparelho. Para sanar isso de forma profissional, se o veículo estiver em tráfego, o sistema descarta as leituras de bússola e adota a angulação baseada nos vetores de deslocamento geográfico calculados a partir dos últimos pontos de GPS. Isso fornece precisão absoluta à seta de deslocamento e elimina qualquer trepidação visual na tela.

### B. Wake Lock API (Prevenção de Dimming e Suspensão)
Para que o piloto não seja obrigado a tocar constantemente na tela do celular com luvas de moto para mantê-la ligada durante o tráfego, o painel do entregador invoca nativamente a API de economia de tela de dispositivos inteligentes:
```javascript
wakeLockRef.current = await navigator.wakeLock.request('screen')
```
*   **Tratamento de Desfocagem e Minimização**:
    O AllDelivery escuta as modificações de visibilidade de abas (`visibilitychange`). Se o entregador receber uma ligação telefônica ou minimizar a tela para checar algo e posteriormente retornar à rota ativa, a Wake Lock de luz do display é re-adquirida de forma silenciosa automaticamente no background.

### C. Auto-Follow Inteligente e Suspensão de Follow
*   **Auto-Follow**: Garante que o mapa permaneça centralizado na seta azul do entregador em tempo real enquanto ele navega de ponto a ponto.
*   **Suspensão temporária**: Se o piloto realizar gestos de rolagem rápida do mapa com os dedos (drag/pinch) para espiar o final do percurso de sua rota, o auto-follow é imediatamente suspenso para não provocar conflitos físicos desagradáveis ("puxões" de tela de volta ao piloto), reativando-se apenas quando clicado no botão re-centralizador de bússola.

### D. Camada Mista de Satélite e Rótulos (Satellite Tiles)
A renderização das imagens de solo emprega o assistente [src/lib/map-tiles.ts](src/lib/map-tiles.ts):
- Carrega prioritariamente o recurso **Google Satellite Hybrid** (`lyrs=y`). Essa tecnologia mescla a precisão das fotografias de alta resolução aérea com contornos detalhados e nomes de edifícios, numeração de lotes e vias urbanas.
- Caso o servidor do Google restrinja ou apresente indisponibilidade física de ladrilhos de fotos, a biblioteca Leaflet transiciona de forma imperceptível para a imagem da agência **Esri World Imagery** sobreposta com rótulos de ruas claros providos pela infraestrutura **CartoDB Layer**.

---

## 6. Rastreamento e Sincronização dos Clientes em Tempo Real

Para que a experiência do cliente final seja plenamente integrada ao ecossistema AllDelivery, a localização do motoboy é transmitida em tempo real de forma otimizada para o banco e refletida na tela de acompanhamento do cliente.

```
┌───────────────────────────┐
│     Dispositivo do        │
│       Entregador          │
└─────────────┬─────────────┘
              │ 
              │ (POST /api/entregador/location)
              │ • Se distância >= 4m ou tempo >= 30s
              ▼
┌───────────────────────────┐
│      Banco PostgreSQL     │
│   (User: driverLat/Lng)   │
└─────────────┬─────────────┘
              │
              │ (GET /api/public/driver-location?orderId=id)
              │ • Síncrono via Short Polling a cada 3s
              ▼
┌───────────────────────────┐
│     Visualização do       │
│      Cliente Final        │
└───────────────────────────┘
```

### A. Sensor e Transmissão Eficiente (Lado do Motorista)
*   **Movimento Incremental e Heartbeat**:
    Para preservar os índices de bateria do smartphone do entregador, o aplicativo não despacha tráfego de geolocalização ao banco a cada segundo. A validação instalada em [src/app/entregador/page.tsx](src/app/entregador/page.tsx) faz filtros severos: a requisição POST para [src/app/api/entregador/location/route.ts](src/app/api/entregador/location/route.ts) só é disparada se o piloto se mover fisicamente por mais de **4 metros** em relação ao último ponto transmitido, ou se transcorrido o intervalo de segurança de **30 segundos** como mensagem cíclica de keep-alive.
*   **Bypass de Segundo Plano**:
    Muitas plataformas de navegadores em segundo plano suspendem timers curtos (`setInterval`) para poupar energia. Para sanar esse bloqueio e garantir o fluxo de dados mesmo com a aba em segundo plano ou bloqueada, é associado um timer assíncrono paralelo e contínuo focado em buscar posicionamento físico a cada 10 segundos, atuando como um fallback ativo de salvaguarda.

### B. Consumo e Segurança contra Localização Obsoleta (Lado do Cliente)
No frontend do cliente final [src/app/pedido/[id]/page.tsx](src/app/pedido/[id]/page.tsx), se o status da sua compra for detectado como `em_rota`, o sistema estabelece um short-polling de atualização georreferenciada a cada **3 segundos** consumindo o endpoint [src/app/api/public/driver-location/route.ts](src/app/api/public/driver-location/route.ts).
- **Validação de Desconexão (Data Stale)**:
  Para evitar que o cliente visualize uma localização "congelada" e estática na tela caso o entregador perca o sinal de sua rede celular ou encerre de forma anômala o aplicativo carregando pontuações antigas:
  - O backend AllDelivery verifica o campo persistido `driverUpdatedAt`. Se este carimbo de data/hora for superior a **5 minutos (300 segundos)** de inatividade, o AllDelivery invalida as coordenadas individuais do entregador.
  - O sistema retrocede de forma segura exibindo no mapa do cliente as localizações originais físicas da loja física de preparação ou mantendo as geometrias de rotas de segurança estáveis. Isso impede a ansiedade indesejada do cliente por dados não-confiáveis e garante uma excelente usabilidade de interface no rastreamento final.

