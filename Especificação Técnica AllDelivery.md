# **ESPECIFICAÇÃO TÉCNICA E ARQUITETURAL1. Escopo e Objetivos do Sistema**

O **AllDelivery** é um ecossistema completo de gestão e vendas para a pizzaria gourmet **Artisanal Crust & Ember** (Operação: *Izaack Pizzaria*). O sistema consiste em:

* **Plataforma Web/Mobile para Clientes:** Cardápio digital imersivo de alta fidelidade visual, com o módulo inovador **"Monte sua Pizza"** para divisão dinâmica de sabores em tempo real.  
* **Painel Administrativo (VPS Host):** Gestão de pedidos via Kanban dinâmico, cadastro estruturado de insumos e pizzas, mapeamento poligonal de zonas de entrega e histórico unificado de clientes guiado pelo número de telefone.  
* **Serviço de Integração Local (AllDelivery Print):** Cliente local (desktop) para monitoramento de eventos de rede e impressão automática em bobinas térmicas de ![][image1].

## **2\. Visão Geral da Pilha Tecnológica**

* **Ambiente de Execução (Runtime):** Bun com TypeScript nativo.  
* **Framework Full-Stack:** Next.js 14+ (App Router, Server Actions e Híbrido SSR/Static).  
* **Gerenciamento de Estado Global (Frontend):** Zustand com persistência em localStorage.  
* **Banco de Dados:** PostgreSQL (Instalado em VPS dedicada).  
* **Mapeamento e ORM:** Prisma ORM.  
* **Protocolo de Comunicação em Tempo Real:** Server-Sent Events (SSE) para atualização de painéis e disparos de impressão térmica.  
* **Mecanismo de Arrastar e Soltar (Kanban Admin):** @dnd-kit/core com colisões de arrasto otimizadas.  
* **Estilização Visual:** Tailwind CSS configurado para Dark Mode nativo com cores personalizadas.

## **3\. Modelagem de Dados Completa (Prisma Schema)**

datasource db {  
  provider \= "postgresql"  
  url      \= env("DATABASE\_URL")  
}

generator client {  
  provider \= "prisma-client-js"  
}

enum OrderStatus {  
  NOVO  
  EM\_PREPARO  
  EM\_ROTA  
  PRONTO\_RETIRADA  
  ENTREGUE  
  COMANDA\_MESA  
}

enum OrderType {  
  DELIVERY  
  RETIRADA  
  COMANDA  
}

enum PaymentMethod {  
  PIX  
  DINHEIRO  
  CREDITO  
  DEBITO  
}

model Product {  
  id          String   @id @default(cuid())  
  name        String  
  description String  
  price       Float  
  imageUrl    String  
  categoryId  String  
  category    Category @relation(fields: \[categoryId\], references: \[id\])  
  createdAt   DateTime @default(now())  
  updatedAt   DateTime @updatedAt  
}

model Category {  
  id       String    @id @default(cuid())  
  name     String    @unique  
  products Product\[\]  
}

model PizzaCategory {  
  id          String       @id @default(cuid())  
  name        String       @unique // Tradicionais, Especiais, Executivas, Premium, Doces, Doces Premium  
  priceP      Float        // Preço Pequena (4 fatias)  
  priceM      Float        // Preço Média (6 fatias)  
  priceG      Float        // Preço Grande (8 fatias)  
  priceGG     Float        // Preço GG (10 fatias)  
  flavors     PizzaFlavor\[\]  
}

model PizzaFlavor {  
  id              String        @id @default(cuid())  
  name            String  
  description     String  
  imageUrl        String        // Foto aérea de alta resolução para composição do canvas  
  pizzaCategoryId String  
  category        PizzaCategory @relation(fields: \[pizzaCategoryId\], references: \[id\])  
}

model DeliveryZone {  
  id          String   @id @default(cuid())  
  title       String  
  geometry    Json     // Armazena GeoJSON Polygon estruturado  
  deliveryFee Float  
  isActive    Boolean  @default(true)  
  createdAt   DateTime @default(now())  
}

model Order {  
  id              String         @id @default(cuid())  
  orderNumber     Int            @unique @default(autoincrement())  
  status          OrderStatus    @default(NOVO)  
  type            OrderType      @default(DELIVERY)  
  customerName    String  
  customerPhone   String         // Indexador de busca simplificada (telefone sanitizado)  
  customerAddress String?  
  addressNumber   String?  
  reference       String?  
  customerLat     Float?  
  customerLng     Float?  
  paymentMethod   PaymentMethod  @default(PIX)  
  changeFor       Float?  
  subtotal        Float  
  deliveryFee     Float          @default(0)  
  total           Float  
  notes           String?        // Observações (ex: "Sem cebola")  
  createdAt       DateTime       @default(now())  
  preparedAt      DateTime?      // Data de transição para "Em Preparo"  
  sentAt          DateTime?      // Data de transição para "Em Rota"  
  readyForPickupAt DateTime?     // Data de transição para "Pronto para Retirada"  
  deliveredAt     DateTime?      // Data de transição para "Entregue"  
  items           OrderItem\[\]  
}

model OrderItem {  
  id             String           @id @default(cuid())  
  orderId        String  
  order          Order            @relation(fields: \[orderId\], references: \[id\], onDelete: Cascade)  
  name           String           // Ex: "Pizza Customizada Grande"  
  quantity       Int  
  basePrice      Float  
  totalPrice     Float  
  isPizza        Boolean          @default(false)  
  pizzaSize      String?          // P, M, G, GG  
  crustType      String?          // Tradicional, Catupiry, Cheddar, etc.  
  crustPrice     Float            @default(0)  
  flavors        OrderItemFlavor\[\]  
}

model OrderItemFlavor {  
  id           String    @id @default(cuid())  
  orderItemId  String  
  orderItem    OrderItem @relation(fields: \[orderItemId\], references: \[id\], onDelete: Cascade)  
  flavorName   String  
  categoryName String  
}

model CustomerContactProfile {  
  id                  String   @id @default(cuid())  
  phoneKey            String   @unique // Chave de telefone normalizada (11 dígitos)  
  notes               String?  // Anotações avançadas internas do Admin (ex: "Cliente prefere massa fina")  
  displayNameOverride String?  // Nome customizado definido pelo estabelecimento (ex: "Dr. João Silva")  
  createdAt           DateTime @default(now())  
}

## **4\. Engenharia de Cardápio e Regra de Precificação de Pizzas Fracionadas**

O sistema opera sob uma regra de negócios onde o usuário pode compor pizzas fracionadas em até **3 sabores**. O preço cobrado pela pizza inteira é baseado estritamente na **categoria de maior valor monetário** dentre os sabores selecionados para aquele tamanho.

### **Cálculo do Preço de Pizza Fracionada**

Seja ![][image2] o tamanho selecionado pelo cliente (![][image3]) e ![][image4] o conjunto de sabores selecionados (![][image5]). Cada sabor ![][image6] pertence a uma categoria de pizza ![][image7]. O preço base da pizza customizada (![][image8]) é definido pela função máximo:

![][image9]O custo final do item da pizza adicionará o preço de eventuais adicionais de bordas recheadas (![][image10]):

### **![][image11]Matrizes de Preços Base por Categoria e Tamanho**

| ID Categoria | Categoria | Pequena (4 Fatias) | Média (6 Fatias) | Grande (8 Fatias) | GG (10 Fatias) |
| :---- | :---- | :---- | :---- | :---- | :---- |
| cat\_trad | Tradicionais | ![][image12] | ![][image13] | ![][image14] | ![][image15] |
| cat\_espe | Especiais | ![][image16] | ![][image17] | ![][image18] | ![][image19] |
| cat\_exec | Executivas | ![][image20] | ![][image14] | ![][image21] | ![][image22] |
| cat\_prem | Premium | ![][image23] | ![][image24] | ![][image19] | ![][image25] |
| cat\_doce | Doces | ![][image26] | ![][image27] | ![][image28] | ![][image29] |
| cat\_dpre | Doces Premium | ![][image30] | ![][image31] | ![][image15] | ![][image32] |

### **Catálogo e Divisão de Sabores Cadastrados**

#### **01 • Tradicionais**

* **01 • Atum:** Mussarela, atum, cebola, orégano e azeitona.  
* **02 • Bauru:** Mussarela, presunto, tomate, orégano e azeitona.  
* **03 • Dois Queijos:** Mussarela, catupiry, orégano e azeitona.  
* **04 • Frango Cheddar:** Frango, mussarela, cheddar, orégano e azeitona.  
* **05 • Frango Mussarela:** Frango, mussarela, tomate, orégano e azeitona.  
* **06 • Frango Catupiry:** Frango, mussarela, catupiry, orégano e azeitona.  
* **10 • Lombo:** Mussarela, lombo canadense, cebola, orégano e azeitona.  
* **08 • Mussarela:** Mussarela, tomate, orégano e azeitona.  
* **09 • Marguerita:** Mussarela, tomate, parmesão, manjericão, orégano e azeitona.  
* **07 • Milho Verde:** Mussarela, milho verde, orégano e azeitona.  
* **11 • Três Queijos:** Mussarela, catupiry, parmesão, orégano e azeitona.

#### **02 • Especiais**

* **12 • Água na Boca:** Mussarela, milho, bacon, cebola, orégano e azeitona.  
* **13 • Bacon:** Mussarela, bacon, ovo, cebola, orégano e azeitona.  
* **14 • Baiana:** Calabresa ralada, mussarela, ovo, pimenta, cebola, orégano e azeitona.  
* **15 • Carne Seca:** Mussarela, charque, catupiry, orégano e azeitona.  
* **16 • Carne de Sol:** Mussarela, carne de sol, queijo coalho, cebola, orégano e azeitona.  
* **17 • Calabresa:** Mussarela, calabresa, cebola, orégano e azeitona.  
* **18 • Calabresa Catupiry (ou) Cheddar:** Mussarela, calabresa, catupiry ou cheddar, orégano e azeitona.  
* **19 • Nordestina:** Mussarela, frango, charque, ovo, cebola, orégano e azeitona.  
* **20 • Charque:** Mussarela, charque, cebola, orégano e azeitona.  
* **21 • Frango Cheese:** Mussarela, frango, cream cheese, orégano e azeitona.  
* **22 • Frango Bacon:** Frango, mussarela, bacon, orégano e azeitona.  
* **23 • Italiana:** Mussarela, salaminho italiano, cebola, tomate, orégano e azeitona.  
* **24 • Lombo Cremoso:** Mussarela, lombo canadense, requeijão, orégano e azeitona.  
* **25 • Peperone:** Mussarela, peperone, cebola, orégano e azeitona.

#### **03 • Executivas**

* **26 • Brasileira:** Presunto, mussarela, charque, ovo, cebola, orégano e azeitona.  
* **27 • Charque Cheese:** Mussarela, charque, cream cheese, orégano e azeitona.  
* **28 • Caipira:** Mussarela, frango, milho, ovo, cebola, orégano e azeitona.  
* **29 • Calabresa Cheese:** Calabresa, mussarela, cream cheese, orégano e azeitona.  
* **30 • Campestre:** Mussarela, bacon, ovo, milho, tomate, cebola, orégano e azeitona.  
* **31 • Canadense:** Lombo canadense, mussarela, bacon, cebola, orégano e azeitona.  
* **32 • Especial:** Mussarela, presunto, frango, bacon, calabresa, orégano e azeitona.  
* **33 • Mista:** Mussarela, calabresa ralada, frango, requeijão, orégano e azeitona.  
* **34 • Moda do Cheff:** Mussarela, calabresa ralada, charque, ovo, bacon, orégano e azeitona.  
* **35 • Moda da Casa:** Mussarela, catupiry, carne de sol, queijo coalho, cebola, orégano e azeitona.  
* **36 • Portuguesa:** Mussarela, presunto, milho, ervilha, ovo, tomate, cebola, orégano e azeitona.  
* **37 • Quatro Queijos:** Mussarela, catupiry, provolone, parmesão, orégano e azeitona.  
* **38 • Saborosa:** Mussarela, frango, cream cheese, bacon, milho, orégano e azeitona.

#### **04 • Premium**

* **39 • Camarão:** Mussarela, catupiry, camarão, cebola, orégano e azeitona.  
* **40 • Catupiry Original:** Frango, mussarela, catupiry original, orégano e azeitona.  
* **41 • Charque Top:** Mussarela, charque, queijo coalho, cebola, orégano e azeitona.  
* **42 • Cheddar Original:** Frango, mussarela, cheddar original, orégano e azeitona.  
* **43 • Bacon X:** Mussarela, calabresa, bacon, cream cheese original, orégano e azeitona.  
* **44 • Paulista:** Calabresa ralada, mussarela, cheddar original, bacon, orégano e azeitona.  
* **45 • Peperone Bacon:** Mussarela, peperone, bacon, cheddar original, orégano e azeitona.  
* **46 • Frango X Original:** Frango, mussarela, cream cheese original, orégano e azeitona.

#### **05 • Doces (A base contém creme de leite; mussarela é opcional)**

* **47 • Brigadeiro:** Mussarela, chocolate ao leite, granulado, M\&M's.  
* **48 • Bis:** Mussarela, chocolate ao leite, Bis, M\&M's.  
* **49 • Banana com Canela:** Mussarela, banana, canela, leite condensado.  
* **50 • Sensação:** Mussarela, chocolate branco, chocolate ao leite, M\&M's.  
* **51 • Romeu e Julieta:** Mussarela, queijo coalho e goiabada.  
* **52 • Prestígio:** Mussarela, chocolate ao leite, coco ralado, M\&M's.

#### **06 • Doces Premium**

* **53 • KitKat:** Mussarela, chocolate ao leite, KitKat, M\&M's.  
* **54 • Banana Nevada:** Mussarela, banana, chocolate branco gratinado.  
* **55 • Cartola:** Mussarela, banana, queijo coalho, chocolate branco.  
* **56 • Nutella:** Mussarela, Nutella, chocolate avelã, morango.  
* **57 • Ninho com Nutella:** Mussarela, Nutella, chocolate avelã, leite Ninho.  
* **58 • Oreo:** Mussarela, chocolate ao leite, Oreo, morango.  
* **59 • Sensação Especial:** Mussarela, chocolate ao leite, chocolate branco, morango, M\&M's.  
* **60 • Sonho de Valsa (ou) Ouro Branco:**  
  * *Ouro:* Mussarela, chocolate ao leite, Ouro Branco.  
  * *Sonho:* Mussarela, chocolate branco, granulado, Sonho de Valsa.  
* **61 • Tutti Frutti:** Mussarela, chocolate ao leite, chocolate avelã, morango, uva, banana.  
* **62 • Uva dos Sonhos:** Mussarela, chocolate ao leite, chocolate branco, uva.

### **Adicionais de Bordas Recheadas**

| Recheio de Borda | Preço P / M | Preço G / GG |
| :---- | :---- | :---- |
| **Catupiry** | **![][image33]** | **![][image34]** |
| **Cheddar** | **![][image33]** | **![][image34]** |
| **Requeijão** | **![][image35]** | **![][image36]** |
| **Cream Cheese** | **![][image35]** | **![][image36]** |
| **Mussarela** | **![][image37]** | **![][image38]** |
| **Chocolate** | **![][image37]** | **![][image38]** |
| **Nutella** | **![][image36]** | **![][image39]** |
| **Catupiry Original** | **![][image36]** | **![][image39]** |
| **Cheddar Original** | **![][image36]** | **![][image39]** |
| **Cream Cheese Original** | **![][image36]** | **![][image39]** |

* **Borda Caracol:** Taxa adicional de ![][image40] adicionada sobre a borda recheada selecionada acima.  
* *Nota Geral:* Azeitona e orégano são opcionais para todas as pizzas salgadas.

## **5\. Engenharia do Frontend Client: Interface "Monte sua Pizza"**

O frontend exibe uma UI premium no estilo **Dark Mode moderno** com base de cores \#131313, realces vermelhos profundos \#e31837, tipografia sofisticada Serif (*Playfair Display*) e bordas arredondadas.

       \[ 1 Sabor \]   \[ 2 Sabores \]   \[ 3 Sabores \]  
         
                    ┌─────────────┐  
                 ┌──│  Selecionar │──┐  
                 │  └─────────────┘  │  
                 │                   │  
              ┌──┴──┐             ┌──┴──┐  
              │ Sel │             │ Sel │  
              └──┬──┘             └──┬──┘  
                 │                   │  
                 └───┐           ┌───┘  
                     └───────────┘

### **Processamento Gráfico por Máscara SVG/CSS (Dynamic Clipping)**

Para criar a visualização perfeita de pizzas de sabores diferentes sem distorções de proporção, o sistema utiliza imagens quadradas idênticas (![][image41]) centralizadas de forma absoluta. Conforme o cliente altera o seletor de sabores, o frontend renderiza os recortes baseando-se no número de fatias.

#### **Regras de CSS clip-path:**

* **1 Sabor:**  
  Nenhum recorte é aplicado. O contêiner de imagem principal renderiza ![][image42] do sabor escolhido.  
  border-radius: 50%;

* **2 Sabores (Corte Vertical Perfeito 180°):**  
  A imagem de cada metade recebe o recorte correspondente.  
  * *Fatia 1 (Esquerda):*  
    clip-path: polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%);

  * *Fatia 2 (Direita):*  
    clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%);

* **3 Sabores (Corte Trirradial Equidistante 120°):**  
  Três imagens são montadas de forma concêntrica a partir do ponto central ![][image43] do círculo, dividindo-o em setores de ![][image44].  
  * *Fatia 1 (Superior Esquerda):*  
    clip-path: polygon(50% 50%, 50% 0%, 0% 0%, 0% 75%);

  * *Fatia 2 (Superior Direita):*  
    clip-path: polygon(50% 50%, 100% 75%, 100% 0%, 50% 0%);

  * *Fatia 3 (Metade Inferior):*  
    clip-path: polygon(50% 50%, 0% 75%, 0% 100%, 100% 100%, 100% 75%);

### **Posicionamento Matemático dos Rótulos Flutuantes**

Os botões dinâmicos de texto com rótulo "Selecionar" são centralizados geometricamente sobre o centro de gravidade (baricentro) de cada fatia recortada no CSS:

* **1 Sabor:**  
  * Posição central:  
    top: 50%; left: 50%; transform: translate(-50%, \-50%);

* **2 Sabores:**  
  * Fatia 1 (Centro Esquerdo):  
    top: 50%; left: 25%; transform: translate(-50%, \-50%);

  * Fatia 2 (Centro Direito):  
    top: 50%; left: 75%; transform: translate(-50%, \-50%);

* **3 Sabores:**  
  * Fatia 1 (Noroeste):  
    top: 28%; left: 30%; transform: translate(-50%, \-50%);

  * Fatia 2 (Nordeste):  
    top: 28%; left: 70%; transform: translate(-50%, \-50%);

  * Fatia 3 (Sul):  
    top: 72%; left: 50%; transform: translate(-50%, \-50%);

Ao clicar em um dos rótulos flutuantes do setor, a planilha de seleção inferior (Bottom Selection Sheet) desliza suavemente exibindo o catálogo de sabores da pizzaria em uma grid, provida de uma caixa de busca textual dinâmica com filtragem instantânea do inventário de sabores.

## **6\. Módulo de Autenticação Simplificada por Telefone (Phone-Bypass Flow)**

Para eliminar fricções no checkout, o **AllDelivery** remove por completo os cadastros tradicionais e uso de senhas para o cliente consumidor. O fluxo de fechamento de carrinho baseia-se unicamente no número do telefone.

 \[Carrinho\] ──\> \[Identificação\] ──\> \[Lookup Automático\] ──\> \[Confirmação de Pin\] ──\> \[Zonas de Entrega\]

### **Algoritmo de Higienização de Contato (normalizeContactPhoneKey)**

Para garantir integridade de dados e remover duplicidades causadas por preenchimentos variáveis de prefixos brasileiros (ex: presença do código do país 55, dígitos 9 extras nas operadoras e DDDs precedidos por zero), o backend processa o telefone do cliente com a rotina de normalização antes de realizar pesquisas no banco:

1. Limpa todos os caracteres não numéricos (\\D).  
2. Remove zeros à esquerda do número sanitizado.  
3. Se a string contiver o prefixo brasileiro 55 com 12 ou 13 caracteres de comprimento total, o 55 é descartado.  
4. Se o comprimento restante exceder 11 dígitos, a string é truncada para os 11 dígitos finais (DDD \+ Número de 9 dígitos).  
5. A string resultante é gravada ou consultada na coluna exclusiva phoneKey das tabelas relacionais.

### **Lookup Inteligente e Autocompletar**

Quando o cliente insere o número no formulário de identificação e o input alcança o formato padrão de telefone celular brasileiro (11 dígitos):

1. Uma requisição Ajax silenciosa dispara: GET /api/public/customer-lookup?phone={telefone}.  
2. O backend processa a normalização e realiza um scan indexado na tabela Order.  
3. Se o número for correspondente a compras passadas do estabelecimento, o sistema retorna de forma assíncrona:  
   * O nome cadastrado mais recentemente.  
   * Um array contendo até **5 endereços mais utilizados em compras anteriores** (contendo logs de logradouro, número predial, referências geográficas e as coordenadas de Latitude e Longitude salvas).  
4. O formulário preenche automaticamente o nome do usuário e gera um carrossel de seleção de endereços anteriores. Selecionar um endereço pula etapas manuais de digitação, direcionando o cliente direto ao mapa de confirmação.

## **7\. Módulo Admin: Gestão de Zonas de Entrega e Ray-Casting**

O administrador possui um mapa com suporte a desenho para delimitar visualmente os polígonos de atendimento da pizzaria e atribuir taxas de entrega dinâmicas.

### **Algoritmo Ray-Casting (Ponto em Polígono)**

Durante o fechamento do pedido, o cliente ajusta finamente sua coordenada de entrega arrastando um marcador (Pin) sobre o mapa interativo. O backend recebe as coordenadas exatas ![][image45] de latitude e longitude do cliente e busca se há cobertura varrendo todas as zonas geográficas de entrega ativas no banco de dados (DeliveryZone).

O cálculo de intersecção computa o seguinte algoritmo matemático sobre os vértices ordenados do polígono GeoJSON para verificar se o ponto do usuário está contido em seu interior:

* ![][image46]**Sucesso:** O sistema adota a zona que englobou o ponto, injetando sua respectiva deliveryFee no somatório final de despesas do pedido.  
* **Falha:** Se o cálculo falhar para todos os polígonos delimitados pelo administrador, o cliente recebe uma mensagem amigável no checkout informando que a residência está fora do raio de cobertura atual, travando preventivamente as transações do pedido.

## **8\. Workflow Administrativo: Kanban de Gestão e SSE**

Os gerentes e pizzaiolos acompanham o andamento de todos os pedidos no estabelecimento de forma dinâmica por meio de colunas Kanban interativas.

### **Regras de Transições de Estado Estritas**

* **Pedidos na modalidade RETIRADA:** Não passam pela coluna de entrega convencional EM\_ROTA ou status terminal ENTREGUE. Ao concluir o preparo, o card do pedido é travado e posicionado na área horizontal dedicada de **Balcão** (PRONTO\_RETIRADA), aguardando a retirada do cliente.  
* **Pedidos na modalidade COMANDA:** São associados ao controle visual específico das mesas locais do estabelecimento e comandas operacionais internas, bypassing o funil clássico de motoboys.

### **Pipeline de Log de Métricas Operacionais**

Sempre que um card transita de coluna no Kanban Admin, gatilhos de banco registram carimbos de data/hora (timestamps) incrementais para análise posterior de eficiência da cozinha:

* preparedAt: Momento do drop em "Em Preparo".  
* sentAt: Momento do drop em "Em Rota".  
* readyForPickupAt: Momento do drop em "Pronto para Retirada (Balcão)".  
* deliveredAt: Conclusão física do pedido na coluna de "Entregues".

### **Automação de Impressão via Server-Sent Events (SSE)**

O servidor central Next.js expõe uma rota persistente e otimizada de streaming unidirecional de eventos: GET /api/print/events.

1. No painel administrativo, o tráfego de transição de um card para EM\_PREPARO dispara uma persistência no PostgreSQL.  
2. O barramento de eventos Next.js publica no stream do SSE o evento estruturado contendo o JSON detalhado do pedido (itens, observações e dados do cliente).  
3. O programa desktop local **AllDelivery Print** (desenvolvido em Electron e rodando na rede interna da pizzaria) mantém a escuta ativa da rota SSE.  
4. Ao receber a carga estruturada com a flag de impressão, o utilitário Electron invoca as rotinas internas do sistema operacional, enviando automaticamente a formatação do pedido para a impressora térmica física de bobina térmica de ![][image1] (Cozinha para fatias de pizza e Expedição para conferência de entrega).

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAAZCAYAAACVfbYAAAADNUlEQVR4Xu2Wy0tVURTGr2ggvans0n3tc/XWJSgopEE0yJlRCYmPUSU0KLHIBkGETUKaNIkQgiIKISqQLgUGEWREEYXVJGwgBeHEqeAfYL/vnr11e7jqsDM4CxZ7r2+vtc769vOkUokkksh/kSAIGo0xXeht9EaxWCwD10X9crncbo1bvy7FRX1iJaVSaTOFPiwUCr2QSufz+X3YLyi8P+URZPwk+AQE9zc1NW3Evob9TPFeungJBZ6j0MEIthfsDWSN7Gw2mwP7CNbtfCC/Fey14pciYyYUeZcCh1LeKmkFRU6rKFuk8PmN74HFQPzBRtAxraSHx0co+DoFzqHD6XR6g8VOoaOuaI3VIOcm5gdtIF8mI0O3rbm5eU9ra+s6xg6ix7XyNqSObV1isjrkg13vcmFvyWQyeeLbidlF24jfEdnEbLNu9apBOfEvKJ+LrylKSJIPBCygnyzZinDnY0msRK6K64PoN5tHF86IVpyxK/Khf1o4dj/aZ31vkabB5rqA/UvxqgH/O/Q7TTixU/bM36M9Qztgc57366kpmkUcvyoxOq+iy+XyJo1pRcDGlGw1crK1ctiT6PuWlpadwpQHu4L+RQ97sZrELzoCDjPhSv9BnwT2JvZyfkeL1rWB/gPVteqRsMEVyJ1Fe1UsukD/pbYDK7ie/nPha5FToSoYHXY+3uRU3IRJsC/J1yenPMqnWhzm5RxJedvQfntlcpodEj3WhxwGoSz2IxE09iaMknASxb1CFvN55JYVIh/51iJH2+4wl1Pfcpj1XZ2cbkOdN3u4F0WkTbg1qgmDcAutRG5Sqy87VuRssgnaIDoG6UFjtxfDx+jP0h514/Qb0VGr1fMRK3L2w08hcjnl7WfO2Q4FsiKHZOvsYY+jV50P/aIJD3qnw9zh18Q4bA1yP/1dY5YulBMOW4PcO56Z7T6+TFQkjm9NSLJbRBWkyyXlEbYf/oxeZKzDhH8nQ3rPNE6OPvAZY29cdBy7h3bKYlJd6T3oKxO+rbq4ZhSL3sSetX5z2PdpBxiftti8jpCtUU+XvqH46cDbUbWk+jiqaNo295hHRbjGzfKHOZFEEkkkkUTiKP8APIYroeDAVPQAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAaCAYAAACHD21cAAABWUlEQVR4Xu2Tu0rEYBCFI1lhwQsohkDuG4LBTglWNmK1hYKCVguCYKOIYqmChVrY2thYbC1ip41gYSEKPoCNvYWlD6DfhETimBdQPHCYP+fMzD+Z7BrG74dlWf1BEExFUTSdJMmgaJ7nDTuOM6Jzc2RZ1kvydhiG93CV8wrxmib7xMs4jkd1jaBBwjEJp7Zt95Wi3IR2BS9kkmpBDt/3JzEf4Zj2aLiFfqj1HIy1g/lEA0d76Ov4ba3nwDgh4Z3umzyaVQ+9hT5U1b6AuSCF8AO+0uic2EnTdEDnfoNslMRdKSqKc9Lgpm78Opiydor24LMUM+ayThKYmC1ijzbQZ+Ab3NCeLCXCOOLYqPHG8V64cVF7YrYxusSm9tCX4J3rup72yu8nXbOqLuPLYtBnq3oO+QmRcEbCGvFWzrADD+AD+rxR8+5yW7NYTPk5Jrhhrvhn/Bj9H38Ln760SlJqahdbAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAaCAYAAAC+aNwHAAABDElEQVR4XmNgGAUoQE5OzkVeXv4zEP8ngO8oKCgYoOuHA6DkRKCiJ0DaAk2KGWhJLFDurJKSkhqaHAQANQkAFWwF4qPKyspi6PLS0tLCQDULFRUVxdHlwEBWVlYHqPkmEM8CclmgwoxSUlJcIAbIAKArOkRFRXkQupAAUDIE5E+gLRkwMZBzgeJ1QCYjkM0PtMQPxEboQgJAzT1o/mcG8quABsShKMQGkPz/ARRQQE23oKF+F4gN0dVjAFDUABXeQfY/1PkrQH5HU44JYP4H4hyYGLL/kZRiBYxAhf1o/mcwNjZmhcUAXkAo/gkCbP4nCgA12oNCXB4S8iD/g/BVIF4C9JIguvpRMApoAgAwKEpjb709iAAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHoAAAAaCAYAAAB4rUi+AAAFjElEQVR4Xu1Z32sdRRjdkArxtygxND927k2CUVEpDRZrlaoUWpQ+9E2MVJRKSyoqior6UGmhaFFQLlqpKCiI1kAfij7YiiKtYAkWRFJRGih9yZsI+QPqOdlvwuRzZ3Z27ypG9sDH3plv5sx8c+bX7k2SBg0a/A8xMTFxNR69Or8q6uargsnJycvGxsZuHB0dvVb7VhNarVZfu90eqCWONE1fIpnOr4q6+cqAAhtjXoHNox+HYfcgu0eXWy1AHGthe2HfwE5C8Jt0mWj4hOGKAPkPsEsR9pSt5+P7N4B+7IBdEIG9wIClLKvzY8H4UP852CHYC7C2LhMD7n7o65OWZ3h4eDzJmZicwCj3Plb48fHx8Wu0PwpFwoB8K8XE82XtGxkZuQ2+H8Gx0+YV8f2T4IRjf/La52pADI/DjqLMAp7v6DIxQN31sM9gGxk/eD7G7z/x3JPkiOSDjN0MxmsT6l7HMYRd9PGEYotCkTAUGA0sotwW7SPgO8DJYNNFfD7Yc5V1rWGGX5/kBO1DaDAoNHwPwrcBz9kqQqNOH+p+BHskkXsI+4j0l7Dz8K9TVbzguJlswm1jmmIj/RXsl7wtOhRbFELCDA4OXgH/52jgLDrSsvkI7vJEAoX/RTfAEF8euH2Bfz/qfY3nW0a2MaS3c7ajyBpdx4eYwaCPZaoIbevCfuOKtPno5zMm2/W4GqOAOvtQZxE2xbSMwzHNbRETWxAhYSguyM9SbIoueX1IH0T+WqYpiKy8JYT4NGQ7PYrA7k1KrFwfYgajG6Hlsrcf9qnbhrR7iU+3fAjkGhoauiGRBYO6t8DOwWb6+/uvUsWjYgsiJAx8W0C+2HLOZ4qC/MMU3C1rEeJzwWDA/QFsvfZVRcxgdCO0B2vAdwS2IDtQachq7qD+GSya27WfiIktiJAwFNhkM3UO9jNFZ5pblS5rEeJzAZ4HwP+szu8CHPB3wXnC3WE06hYa8U6C7zzsEFep9ofAXRL13qPAJnvDuT/xfIMw2RvFPBbandoXBZ8wsuJmjHM+cxUjfQTPzar4Mnx8Gmn2WsHL0fLlS1vMhwLZAofB9Sr7KseAF3UKzVedNLvDdAYGBq7U/jKQy+JPPi55xXod/m+5c+Rt70H4hKG4HDiKbUkpdOqcz3nw8WmAazd4PjTZ5ctn02xT13UhA9Qx2SVpqmhV1SU02wHHG7DXivoYiR6Jg0flY9pJoO8TMrFOw3YlntWfC58waGybNOq+P/fIJ07vxcnHp4Fyj7INnV8V6GsbnN9z1ieBm3odQluR0dbTiQy2XCzvW1kyH1J/N82dmEYudXl9Q7/vgG/ObbMUfMJQYAqdet6fffDxaYD/ZvC/WdNqWIL0OXhhKRKau1fB+3sP6u6hSPxtMxH3TvA+ZNMhHtRdZ7JzfcW7N/tEoWEH3PKETIJZHE2D2heFPGHyzudY5PF5wK1qGvZ80XYbCxmMKKFhnUSJQGEQ7gn4LnguPRT5YfjnOeiI9Yw1pOfgu4uFinjkTnEK9d62nzSdDy/nuHp1nZjYgnCFQaP9IDuGvItGvmPL71Mos0HXzUMJoYlecO/CoHyB58ZWl6s7NBjg3gzfLGzBie13PE/ieSvLyAT/BPYHbFpzOJNkqb6y5UVRxENwpzTZWctL5I5W9in1V98OagKxRaGkMIWowsfyrWw7PO6uEs74MuJ3PRgCmRRP6PyyKOJhbIhxE2w7yt0d2tm6jq2KMCHUzVcGXQ+GABx787bcsqiLh+g6trqFqZuvDGQwSt8rXMi/Sl1fEuvisUiz7+mN0EQ7ewXh9+JO6OtYCBBma+WbrYO6eIBentsme7Xah/TfbvFRAMFU1UHJQ918ZaHO+4NJlXfO/wja2V+q3/Guwt/JKo6lQYMGDRo0aLASfwGCltgAGSYYLwAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADYAAAAaCAYAAAD8K6+QAAACqUlEQVR4Xu2WyYsTQRjFO4zCuA9KDGbrJBOMggc14IKIIoIy4EHwKIMHl2EQFFxAvDmiIiMoHgTFsxvkIEbw4EFEUBRBxIM3ES+e5w/Q32OqofnoNt0Jygz2g0el6luqXtVX1fG8DBnmPgqFwpJarba7XC436easfV6iWCxWfN/vwIvwgwRan7+J0dHR1cz7Bv5KwJM2PhY4n4UdBF2gnYEHrc+/APPv0+K1DmurVCobsL2tVqvj1hYJkowQ0IXTpVJplRIwPGT9/oR2u71Qu16v1wsBKemVXsqSDjaWxe+1NgHblMTb8Ug0Go21BHwmYMLaeqHVai0j9hILeUF7A16H5+gfgDtwWWBj4sB1WEzMQ+I/spZaMM4GLfLcRmM/j2ljYIsEDsPaWZwPkeynyk/9fD6/1PpGQRtCjkec8E4v5clEQWIkSuIk0o0N07/C+Br1tWGuEuJB0Fa3w8/hN3jb9TdZXwuJx+8e3Gxt/ULlR74ZlWMwpk1j/I4Ehn0TgaBbJOzSjlhbHPDfg/9pOz4IJMifffW+wE8SqT7CTlnfnnB3RM/8XS/FfWCyY8SMhR8LS0p1hY2Lg6uAJ37ofumUtC7aXca9NzjqIsHv0+4Kk50g7r4/W7pxnExaQhIjURIX3HHFhu9XKhC8jcAftaRPqAMTHiZmvx3vF8rlm/sFcqootaGxZGCB4yT86r5dicEC1hE3nfREekGCJEwPiLX1BZJNwZf6MFtbD+RUavCMPs7WmAZR92sghD6IqR6OEIaIPcpaHtNuT3t6zWYzT1yHNXz33f9A9/s1j88W658YoYcj2X+vGOgFRNQEfEqudyHeTCt2EOSY8DiCHsAxCYPrrdO8g44fYa8Q06W9Cq95/ZXhnEOO8jiCsGfwMkKXW4cMGTJk+G/wG7eWsM9/WztOAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAAB4ElEQVR4Xu2UzytEURTH3ySl/JrUNDU/35smYz8RSaRsxE7ZsaT8SpRkocxGk2RsrBAiJUKxJhsl9pSN7Cz9AXwOz/Te6TGmsfStb/e++z3ne96799xnGP8oBYFAoCoWi7XC3kQiUc9SmawHg8HKSCQSVuG/h2VZKUxP4ANcM01zOB6Pr8I95g2MO4ztOq8g0ul0OYmTmD7BMeYVTh3jFngPb6LRaMipFYSYY7pI8jNjj9YFUhBu2XQVLwgSBjF/xXycR5/Wv0BcjpgJvf4jMLbgLbwKh8MRrTtBzFLR+0/SNHwjcVZrGslkska2U69/C2lFzA/gS9Fv5oaPfL9ht3IetGQQ82t4R4DpEn8JOXDys5zNPpx3iY4C1zJ3iQrSCMQ0eaw3Y7yJxyjzDi36Ec4KFeDm1hGzzBkEtGZ+XsSMXs9DPkvOAHZqzYbs77C+H/w+asmZgxfwHH0mlUpVO2M+EAqFooiXBB3qr7D3d4pxyPC4H3aTbMs2ac0F3oYasWOCHxlXSOhnvgCP+C20GR7mAvllEHsKTa15wSeFMO22aRm67RTkzYnb9dyavwBf20eRnF7/M/D2GYoM6PWSIYdv36ENzqFR6yXB7qx1MYdZedYxJYNt6cJ8RLf1P4rGO6zsZxaMLiE9AAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAaCAYAAADBuc72AAACgElEQVR4Xu2Wv2sUQRTHN6gQRGM8OMXz7nbvBx4KJpFDjFEQLDQoFoJWKsQ0URC0kEBIApKYIEEMGmxS+APhFESLgIWFdhIbFRUtrFLY2Qj+Afr5ujMyGS5YRPcQ7wtf3sx7M/u++/bt7AZBE038Q8jn83vDMHwNv8Hvhh/gW/mIf8KOVSqVtf7ehgAxV+HnKIq6XX+hUOg0omvpdHqNG0scqhZCHsMXpVJpgxuTOPwP4RduYp8bSxzFYnELQt7DWaYr3Rji2vE/qVftxIGAXvUj9owfy+VyO4ktEJsrl8ttfjxRIGS8XsUkjJfpAf53xHe4scTh9OACnIFTIuKuY18hdDqbzW729yUOpz/vZzKZHG/5RkvEtmoNsR74UeL9/YnB9ieVO+/HXLDmcEOFmv787dFD/GDDhDrn5zzc5MddSChVv409i72DPe20xiHGl0xv91Wr1VXy09tlfMOGM+zbhrtFT0dzkfW7FiWqBxZuDePeu2uTLgUJZe0je0Qx7ifxlVQq1cb4XhQfbRJxGZ4wayZCc1oQ74Vdsvhu6GawBVjzPzK/QHA3fAm/hou/7z8T1IOERs6jV1LWP8dGmiuZuRlV6px82Ith/Pmd4qaquCRuVmuYH4HH2TOna9nrLhtLCJ2XJeGkyKNOSaQVyimyGv8e5mPwja6hc9nG/wpstRi2aM54P6zBHpI/1XFm1g0xH4THGF+wjzWM+1I30Q9vBuZTzb4Ojsi8zbNs8Ck9QIJrSoaIU6oMFdyunsV3C44irE8WPtNYVWY8Ao+qn/Uy4W9lPm7mJ5kP2Jfvj0IXJcH6wFTWgqqskwjXF8RVW4G/PfDWa23DfxubaOJ/wQ/i162X9gnMcgAAAABJRU5ErkJggg==>

[image9]: <data:image/png;base64,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>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAaCAYAAAD1wA/qAAACxklEQVR4Xu2W34tNURTHZ7qIQkNdct17z7k/uM1F6OZnpCTUPCm/MiGT5FeRBzXJg/EiTaQpDxg/c0dkaqY0b8qDeKEQD5OHefDmRfkD+Hw7e2vf07lR9z6ccr71ba+91t5rr7V/rHM6OhIkSPDPyOfzmzzPew9/wl+Gn+EH6bBP0g5UKpU54bmxBMEOwm++76939YVCYaVJqp5Op2e7tthBu02go/B1qVRa4NoUPPpn8DtJbnFtsUOxWFxKoJ/gLbrTXBvBd6F/EXVasQMB7tR7oD0etuVyuTXYprCNl8vluWF7rECgl6N2XIHz2J+g/4h9tWuLHZw3MAWH4FWR4G/QviOR69lsdnF4XuzgvI+RTCaTo0ottCSZmRqDbSP8ouTC81uBboA2SxvZckW074OdPxO2uWBMT7sTEfC5oy2JeMH7+Gtp1YKxTcT5fryBi8J2F1qQU7tHe4L2Pu0R31w9+UE+Cy/hZ0BvSjbkk/Ax449pLtd1rfG1Dv1NL/gIX7SJaI780L+gt6lxjVE0ARO6veDuP7BBNYMSYexzW4KR+1jsShdAHoYbjL4A65TtDAnNR54wY8/DvRoHH1o/+N1vE8G+DL5i7nJ9mFUx8bHEjaMBxtlb+MNr/L/qDY+1UCK+c7WQVzH+JdylVsVBelsFCWK3ke9qrJ1Hf5B+v+MnfLVSKkDM34Nt3J3bFjRJRFfyqNqIRA5FJSIf6E47/T+JqGoijyoJOC88ty0wCw4hdqqPvBXWWbzComPI3dKbKzGmAKISod/nOb9CyD02ESVoN8sPfo1G4AH9Xdj5LQNn23F6TYsR6EFzf1cY22b0d1h8n5LVtcI2C/mcF1zZYXTbNFZvQ8HCfvS98BH8qrF+UAQmaA/TnoK3kZ+2/VSEWq02XcfeYU7GQad2kTYV0kfCVqlqtTpDPh1TSkVCraNLkCDB/4zfls3PZ42RZqIAAAAASUVORK5CYII=>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAAuCAYAAACVmkVrAAADwUlEQVR4Xu3bTYscVRQG4BlmhCCKIozifHT3fOAQCCEwG1EhIIKRLESIEHAhxI2LEUQwkIWbJIhKQCSIIhgTlBDIPpCFKxcigoL+geyzzA+I58xUJddrddNMN5lgngcuVXXqdtXpWr3crp6ZAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJjc4uLi4/1+/4/2OPbfiHErdufvz9pfvV7vWtHjbPYYtc/+NWkfrKysHIpevmuPY//sYDA4Vs4BAJhYBIyjMc4Ux4MMR7ktpu2r6Od2V4/lnGlZXV19bmFh4Ym63iV6OBetvNgeR4g80QS4hybsAgD/AxEwtiNovFYcvxXjzsxDFDqyn44evy7nTMu4gS3nRA/X19fXn21r2VP2Vs4DAJhIhIvnY/waYejL2H4R229i+8nm5uaT9dxJxXV/iuv/1jXi3Ef1/Fb2OBgM/mp7jPFn9ljPm5ZxA1v+9JlBsukpx/WovVnPAwCYSISM7Rh363qKgPRKXUujwlxc61KEliN1fRJNj8c76hfr2l7kO3zR84dF8LpYhMMc79SfSRnQYvxe1+OzP4wT+Eo5P3p4va4DAOQq0ZUIHX/X9TQsQMT8g3WtNSqwLS8vP5OrV11jbW3tqXp+imsdyB7j/Asd576qa9Mw7gpbPrfsraN+aZzPlwQ2AGCoCBe3Y5yr66kNEBFgDmfY6vV6b8f4tAwWsf95buMap5rt0MC2F3G9V7PHup6awDbbhLr8efLH2L4f2/MZuvq7K3DzTRg6trW19VjUrpbvnHUZM7DlP1XzjxBH6xNRvxEBs5e9V/f+OPuLcTL2X4pn+W3T406YzefarPbtfIf+kJU9AIB7MkBsbGwsRHC40Bwfif1fsh6H8xE41jJcRMDpN7WpB7ZRBsUKW/RyLcNkjuhhO0pzGYJi//sMT3m++OhIYwa2ofIZ5Oeb0Hi8vXc+ozj+uX1WKc7dzG27wpbBrv0OzfcAABguA0SEh5czdMT+gf7uatfVrDcB4902cMT2RI59Cmy52pX/dL2ZISnqZ+L4vTj+IM9lP/3dFcD5XC3MAHf/Kv/VhLU9/0M27ns53/OLex5cWlpaboJX9ngqxoUysMXxjdzm/Kxnr+13iOucvndRAIAu+fNcu58rP8POTbIaNam8d3n/4l242Rhz5bkMne3+AzDXjB2j7h3nnp4p5g57nw8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBHxD8zc74zxcASIAAAAABJRU5ErkJggg==>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAFCUlEQVR4Xu2X22tfRRDHT4hC8H4hBnP57clFo6AQDYpVIbEUK1RRab2gtqB4KbZ4CRUpCoqpqLVUJIJpHyoVrcVe8P5QkrYP1gtCpQ0qQn0pQh76EugfED/fs7P9bTbn9/P3olCSgS+7Ozs7Mzs7Z3ZPli3SIv2nNDg4eG5fX99FKX/BkQKR5/m9YGdPT08FVlMqc9ZRpVK53Tl3FJwGs9Yeg3+Sdhp8Tf9uRJvDms7OzuvhHwR7wWGwB3yM3KWR6qy7u7sN/gjYDF4C3fF8IPRdxdyrkkPHA21tbeenMg1QE2sH0TFK+1ZXV9edWeRzoP7+/guZf8p8GknnC2JiC/ibk74lYjezcLXzQVnHuAkj7fC+lGFkB+BvkqACRv8VyZi+G8FnYAlrrlMG0Z+hXRtkwjowTnZdLd3IPAm+bW9v7woyDVCT/AN7OQBHcC+jPwY2K4ODkHRi/wD2HqNtoV0WKylI0WLhfnCkt7f3injOTvenMEe7AuxpbW29IASDjVxM/3NtgvYSGaK/AzyS2emYg9+AE1onnun7REGITGpjb4INEa8umR+/xgdJPze/lxrrHOcPfLv6QW4e6VQQmioThHcD+AtMdnR0XK6TpX9IGwnBoIi20k6AfSqoUQD/VFYEXZzE8/BmLTvCJg7D76laLGyul+Mxrx6hZ6PsyW7ghQNG93sMmyw4KgfrqytLCLm7EDrNwjXpHPwNmos2MMT4lPNpeIezzyTzGVCkv1IT/hvg09hB2+RscChy8Hts3yaegsl4l3wK6+oRci25/wTnBEOZ63wtC9k65Lzf9YOBwKhL6oVt6FHnM+bZ8O3JOI5/5PymhD/AOp1EVWMpKU23g+mw8az6ratoz+gUaXdY4Bu6naJN1wpGwUfncvO3djDCIhw5Cb4wBYfkIOO39a2na1TtnT95FVYZECbqFb2Kr/QnXFLUoObcp3mhh/5xMJw1GIzok6wbDJdkZSnVqBe6pp6DN22OlRJzA2CbgobsjKtR9JT6yOxmfiy5NpUZT4BdOHyz80VXDit7HozkapIV4SPuX4KhbDPdtYORW72w1Iz5Km46yTmFzKI8knsKV2u4Afann4s9zt4Br4OWeI7xMGsmKMydxmpmvNLsFkU6li+jdNO1+Hkjn4krqRciTmaVFsPfGPPzKMJRMMSXseLGCbIhEMqyzK5YZaKCoL7zV91okA8Ebyn4TfrTuRIKtahWMIoD0v60T/kdLz5D9d4XctKVRJKNLYM3Ztds/OhaxXhnXj19XWdrwTPqR+vXsGaF+sy9nyfBFtnj6zsFTmP7B2pNas0Zko9gKsiL5B+8Se3DZK4EP4bxPGLiWvC7m/++0Mtz3M29Bl8AQ/am0El0h2BY/0A48cwH4mHn3ye/oOvnAOdPvMjC3H+ik/ZvEyis/SAzn1j3mvlSWpNkX3bA/RFvCThGYG8ylurgy+j+KvxcFsE1QVVgFT0ZKf5H5FxQVvHPaxWycRUz+u/mdurcMH2M9zE+XvH/MHr93SeDmre6Iv3SneIosrmZUY3Q1ToF60XLrm0ueZ/AfxreKdrdSv/Aj8n5l/EPyKxGx0P0D9I+nkVZaW8Y/UN9WPEZvjVSUZ/slbkcDIdAxISyW8GWWunbKOn6lh0cvEeBzqINBLK038T1fV46FyjoEcqeBEa6ygdkS206eVaQ0l1ZlPIXHNnNsJWTvCadW3CkW6JSfcIv0iL9D/QPAoaqjpOicy8AAAAASUVORK5CYII=>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE8UlEQVR4Xu2X3YvWRRTHn4ctkF6teFral2d++1JbUGEsQWlghrRCRQlRF2ZRUElKpBgiGwStkdSyJQu9eBPbVZRKrxeZZmCWERkWJIFBRLAX3gT+Afb5/uYcn3l+/n7PLoQXsnvgMDNnzpxz5jszZ2ZqtUVapPNKo6OjFw8PD19RlC84EhBZlj0IzwwODjYR1Ys6Fxw1m827QgjH4NPwGSuPI/+bchb+nPr9qHb5mL6+vluQfwPvgb+FP4Y/QO+qxHRtZGTkcmRP0/c6/CLjhmsVoNF3PTovSbfob55UZ9wo4ycoX+vv77+3VmKjENOWYn9OdEzC/7DSdyTiLgauN1A20q7jpAfZp3KM7jLkO6SoCVAfl47a6N0skJCvQG8p5eMCmPoG1xHZDtuM7peyB2fovU/xhOvMg+qKD94zMDAQAPZq6tOasOy7Uk9PTz9292P/McollKtTIzkJLQbug48MDQ1dm/ZhvBv5Ue+jvE+TbDQalzkYHJMrqX9kE1qqcdQn4Fnaa9SWXP3wb+jf4PY1aWSH7agJ1NW0TyPf5TpzkcXxS5YsJPXM4r7HRBeFuOC7VXe9c0jBKcgyRWS3wX/CB3t7e6/BxwbqhwSMg0ESbVAegPd6QmVSL2tS8Dq1E8D/0K6RDHt9tA/DE+5P47G7WTvPZXMR+tuxcVQL5zL3h503adYNHKWDTa2RJYTeGgWurVzsQ75VfQLBdFfSPhXiNlwV7JjU4vls2/4Cz+SycxP8e7BdZbK15vdh7C7RZLxvvqRx8EwogCE78hVstyZxdwYjxC3dli80GWTrQtwxz/nZk3Od6RCTrfgEvFEr0bLYTrZK04z7UcnX5eb3DPJt6oefov4V5Xh61jtRMukqMHI5cY9ZvNVg+CAlN/gTM3AoxBXbqWRUHNPd3X0p/a+EmFjlQHxACSrVo30J8rcFAuUReFUtyfAEuMvGnt0t6A7SPuY7cS5KclpHMCg3ma9qMCryha6p50NMgHcn6m2Uxez/nkBD9194a1HHyfz8DE8LTMkcjPR4JpPIc1TLQjlZUhfQHcEQuPIVOoGRWb4oroQmivwkPJnKDeUtWSS/WnW1vQrv63BcpKOjIF/5tSnbCpD2mCslkzgp+63h5VScdJVcPuQrdAIjlOQLkZKaBbo9lQs0N5qAIbmc5atpb4dnxenZ1xizmV+bbuv/gFGLV+buUA1GvkCan+apGNLBZ6nT+yJYcisObsZ3wLRds+mjSzfCTBazu++qtgkJBLOZX6VcsbdT/0tjXafsmNgfqFGVVBVjKLxfNFY23BfldfAP3j6HQuu6K74v9PJ81wLPwWAiL8Ar7U2hlRhwMKy+P7P84u8HbLzl7w57FX4hf6zgrWbTbyYdxdx/WQJtxjeLYinNSfIP/wSvTWR3wscFuImUB7dh9zOPKQfXFJWBlfTkJP+PZPZaFDXj83pWoMCPUH9DwatPfwzae2n/2ox/GL3+HpLDZLx20HfwuILM4lvghOSuI7LEqn/OVIhX+dfo7Ex3Ae1nkJ+i/LDqHRLiy/h7dNbj61HZpHyylsQkEEL8Q71j8U0lJjqTvTLHtOIOREoYWw5PVm1fW/kV8APSrdKzN81y6VV95mzb79B1Xexz0u6zeMfKngRGXfQvky+Vxc4Lgiy/6LO4sMmS6hQreWOxb8GR8oqOW1G+SIt0/ug/XyWzLa0Unp4AAAAASUVORK5CYII=>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAExElEQVR4Xu2X22vdRRDHzyERivcLx9Bczv5OEowKSpMgeINqKabgHVp90Co+qMUWlVKQ4oNgK0oa2oc+WAsi8anYJlZFxNLbS7UiVLRUQfSlCHnoi5A/oH6+Z2faPZvzO+2DBSX5wvDbnZ2dnZ2dmd1fpbKEJVxRjI+PXzU8PHx9zl90kCOKongSmh4cHKzDquYy/zvU6/UHQwinoHnovH1/hn+W7xz0Fe3HEO3yOf39/XfBPwodgI5D+6FPkbspUd0CRRDju6A7s6GugYGBR+C/b/Q4Dl6WyVwOqswdx45t0iOdlcRmx8jIyHWMv4zcJLQ5H2+CgSnoLwy5N2F3MXG9OWUj/SqL9ML7QgsjuwL+dgnKYbTflkwy3yFDX2f8D81xpqJL86EtUAOZ5yUDHe7t7R1IFVwCVdkHHWg0GoHDupn2bmhSa7iQdLL+Ia0jh/NdnSppQt5i4ix0Ymho6NZ0DOU98E/6GN9Hof21Wu1adwZpcgPtz2h/zffGdL5gJ3ZGG02dQX8VY/v4Lk9k14UYnVN0u53fCWbHT+lB0i7M7lXG6pZOaK/aLrcAbOY2hE63E4Q3Cv0JHenr67uFNTbQPibHuDNIgRrfw9BMXlDVh78jxLDMnbEpxNTUxptQ5NH/MbQ5mDKgcyvyJ3VwzvMDxrm76FbNOSoHmy7ObAPk1iA0z8QX8rEQQ3heTjDZlfTPhRiGDwdLk0rMzzxFZMQGSyFtPHfGKGPfKhWdl0Riy+bKgL5l0HQur8gNsZY1ozWxu7MzENgWsnph+fxciBHzmueeFsf4T0I8UdFv0EadxEWNEfDHkH3HdC1wRjvIBtkCfay18vEcyabLnNHko2vC7C13hk/C6LPQQVNwLMRI+UDFKJ/T09NzDePvhlhYtYCopehZekzatesp0dEZcprCGrlfobF8vB3KIil3hq0vO8udUVIvvPrPYfxDiXgLtDHoIzkN2b+hLTak9HiV/H/CZc2Yjs6wdDqlkM7HymBF/cSlnFHEWtfZGYXVCwlnfBVHXXMXiptgXt5cRPjVqqvtPWhW6YLM3Z4ePk9GSF+ZMxgbg76BRvOxTsg3XcYvLidNQpt6IbCZtZoMf2vKTz2cOEN8LeY3zovM/yGj34M96KBZ3UCuM0RHfA41jNWN/Dpd2S7TAboy94ZyZzQPSPsLsRa1d0an90WITjqfT8bI1fB226bTR9da+tNFSdGTntAmMlRntJm03kg3vEkvyvYPVEsjLYXpPq2Ud57pOKJ9mMxy6HvvLwADd4RYrPL3hV6ee0LiDDbxJrTS3hQ6iYY7w9qHig71BX1vhPheuZAGlnIz0Jk0ikL8HdhTMZuUcmaL16QWaP0Q3yZPJ7z7pIe6dY+xVAffwsYv/S3UdK4JqgKr6GmRZvgiuMaV1WMxm5NR0DO0d/ipc8MM05+h/0s9/sPo9feUFvT5DjlQum0NrSWdB82pXuEXUJGkJ/KvwDvHd5/CP9XvCPFl/B0y65n7LO2jfF+qJDbZDad/qA/rMcJ3Jio6w16ZEzpxd0QKlN0PTZWF778JC/vtpNPV+ZhDzwCzd6Ldk8DQxfiKevwhbFvM//NQuIf4s7i4YTfDTk7y9nxs0UG3BGH9QM5fwhKuHP4BeoqhospHqnoAAAAASUVORK5CYII=>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE40lEQVR4Xu2XzWudRRTGc2mE4PcH19B83HlvEoyCQtOLolWIlmIKWlSsuqgKLhRpi0qJSBERbEWNoYJdWAMicVVsU6u1qCX9WFhtESpa1I1CKYUsuhHyB+jveedM7mTufW/vpouSPPDwzpw5M3PmzJkz83Z0LGMZlxW1Wu2qoaGh61P5koMckWXZY3B6YGCggqiU6lxxqFQqDzjnzsB5+J99f0N+nu8cPET5UVRXhD59fX13IT8G98MTcB/8Ar2bgo4chOxJdHvVF6d19ff334nOcyoHPbUhfxj5e8YNSXu7KNG3xpw7NI7G7IhsDhgeHr6O9hfRm4Db0vYcNEzCCxhybyReIePNKVuol5ikB9nXmhjdVch3SlEOo/ymdFSvVqv3UD/nvIMD/zYjcyi61B+OwypjPCsdONvT09Mf9NpASfbB/czr2ICbKe+GE5ojKGlMbD6ieeRwvuviQXLIW3Q8AE8ODg7eGrcxeDfyU6GN7yNwX7lcvjY4gyi4gfKXlA/zvVH9rE3Rc4JJf+D7usaKx0a2lra9fFcGGfWnnI/OSaqdkXohbK5f442knJnda03UqTHhlMpBrwEs5jaUzjZTRDYC/4FHe3t7b2GOlykfl2OCM0iiZb6zcCYk1NAWj5WC9q3OR4wWnkORR/0X12RjisBc29E/FTs7bDDO/YhqyZyjdLC13rMJ0FuP0jwdn0/bnA/heTnBdEepX3Q+DB9y9QXrfC4k0TadMaKo0VEMsigSFy2uCMzTBadTfUWu87ksj9bI7tbOQGGHS/KFnedNzkfM5nD2NDnGf+7qeeAvuEU7UR9xwRmfwY/hj/Q5zXdc/WO9FLJBtqjvpXSFaNFFzsjljDVm9hY7I3TC2PPwoA1w3PlIeV/JKO3T3d19De3vOJ9YNYG4KOmZMw7BquqW1L51SVKLIbnCGp0/4eq0vRmKIil1hqsfyWJnFOQLXVOvIJtjUQ9G6ougBcNP5TR0/4XjoU0LwzlXx/rovYrOOfLC3bE8oOJvpDOMOZq2FcGS+slLOSPzua61MzLLF1JO5NpZXXMLyU0wL2/LPEJe0NX2LjyQHpcYMkQGpXNZ22r4HRxJ21ohXXSRPGvnmLgm+UJglzaa4dtjeezhyBmSa7L8xrEjcRjO6qYJfdWnmUHOO+IrZ0cKdOqK1ZUd6xVAV+aUK3ZGvkFan/O5qLkzWr0vnHdSg+EYuQ7Zbrtm40fXRurTsCs6x4ucYcdEUbg+yJRnkE3F+UZjI5sIUWb/QOWiXCMb4Vkd+SCzMY5qHaazEv4c6g2g4Q7nk1X6vtDLc4+LnMECXoOj9qbQTlSDM6x8JKvnl07KHzBGLQyo9wd6M8j2hreIOW0G/oH8dKDzvwN7NI70KL9ttizkpBia3/m3yROR7D6NE+Un5cE3sOubMH/uXFPUzinpaZL8fyTeMUtmczIKPk35Q+262jgGQ9RnqP9e8f8wev09rglDf9txRd1bcBN638ODelQFHVc/Ng3MouNJv5eQXZQjFf5BHsP5l/FPFf/v8wzlY3xf6Ihssg3RP9QnFR/hu6IhWsNemWPa8eCIGAy2Bk4Wha+9VdYw8QYL4YYfp3ZhYb8zvaFiKFeZvWPNngQG/TSukk36po1XBBTuzv8sLm3YzbCLnbw9bVty0BEjrO9P5ctYxuXD//YcpmTYB5kuAAAAAElFTkSuQmCC>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAErklEQVR4Xu2X34uVRRjH38MmRJb9kNPi/jjz7g/chAplCSoFM6IVSiqQujCNLipJiRBFxIuiNYpc1FjohzexXUWpZOmN+CMwzUgNi5LAbiLYC28C/wD7fN95Zs+c8byH3QNeyO4DX2bmmWfmeeY78z4zb5bNyZzcVBkeHp43ODi4INXPOhEReZ4/Byb6+/trqCqpzS0ntVpthXPuIrgGrlt5Cf0/lJPge+rPYtoRxvT09DyE/iQ4AH4A34Avsbs3mjobGhq6C91r9H0EtjFuMCsnrUPkGrHtSAVfw/gZpfygt7f36SyKOUgS05a0vxA6xsC/BPRopO5g4HojZRPtCk660B2WY2yXot8lQxFGfads1MbuQZGEfjl291BuEMHUNwYb6reDEezeA+fBFc055X36UlF84EBfX5+D9Puoj2vBOsHBqKurq5f5jxHHy/JN+VQ8SSFii4GHwJmBgYH74z4m70R/LvRRPqNFVqvVOwMZ7Obd1L+mflQL1zjqo2CS9mq1pVc/+B37xaYrAhJh6Le6NsmwOH7No42knlvcT5rqNuc3fL/qwe4GUXAKspkhumXgb3Ciu7t7IT42Uj8lYgIZJNEq5XFwMCRUFviO85/cOrUjwv/SqYl9SNBvdu2TsYOx57RxQRf8EcdemhUjR+lgc31kE8FutQLXUU77nN+xayLBbFfSvur8MVzl7DPJ/Pc5lQ90PEWe6TXPEvCns1MV7IIoSNcGGbn/1CZcQoZ8yJez0xrF3ZoM5490Q77QYtCtc/7EvBm+PTmHtC+cT7bCZbBJO1GfsVFsl8YZ97OSb9ovUZCuDTKiRZeRUehzn5sUbzkZYZCSG/jWJjjl/En5UMkoHdPZ2Tnf+aSnxCoHwnElqNiO9h3oPxEJlGfAqqxJhpcoSNcGGVFOa0mGza84y8koyRe6pt5yPgE+EZk3iAIHn4s0bP8DW1ObIObnAhgXmWm/BTtjMiypi+iWZOQ+17UmI7d8IeNEr+R4BYzFemN5S+4lXK262t4Hh1p8LrJRnpGvV9JOBSl/MyUjXXSZPp/OZ+Ka5AsJu71Wg9HviPUiLUwakSG9nBU3jr1O3xDie15jbM6P6zM29M2YjMxfmftdORnFBml9Wqf8xIOnpNX7wnmSrqeD9S5AN27XbPzoWkt7IvfZPZyqhsWJBJtztD6jF/lJ7YPYP1A1JjYWGzv1fpEoPnQngi/KReCnZr4LcfXrLn1f6OX5mQVekEGQb4OV9qbQTvQFMqx+LLf8QiA96E4zx77w7rBX4RH5YwcfjnwVIj/Ov2eWpX32ZlEsTXOS/INfwAuR7jFwiTfNI6ZSHtxOjN+FmApyzVAZWElPTor/kdxei5Kaf15PihTwIvXd2nX16R+D9kHav+kWcv7197wcRuN1gn4EOxVk7t8Cl6UPNuG2AX9YHIJiuoD9u9Fcr6O7SvlVszeKxPmX8Vls1jP2JeonKV/NophEgvP/UJ9afHuiKVqLvTJHtOOBiFiY7HEwVnZ8NQany8Ea2ZbZTUfs2O8SgWlfEJ0+i3ek2ZPARD+ESxWTyrTzlhAdd+d/Fme32M2wh518IO2bdaJbQp9bqp+TObl58j8Kq5ZFIa2LJwAAAABJRU5ErkJggg==>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAFEklEQVR4Xu2X22tfRRDHz48oBO8XfgZz+e3JpUZBJRIUtULTUmxBRcV6gVpF8YYtoqUipYJgKoqGqkQ07UMlokW0LWrVh5K0BVutiEpbtAj1RQp56EvBP0A/37OzzWbzO4e89KEkA8Pufnd2ZnZ2zuyeLFugBTqrNDg4eH5fX98lKT7vSIHI8/xeeLynp6cBVEtlzjlqNBp3OOd+g/+F/7P2CPg/tFPwHvp3I9oS1nR2dt4Avg/eCR+Av4Q/Qe7ySHXW399/MdjTzL0Nv8y6vqxJ0MAXMf+q5JB/sK2t7cJUZg5UY+0gOoZp3+zq6rozi3wOlPi0Pp0viIkR+CQnfWsEt7BwjQVlLeMaRtrBvpZhZAfAN0tQAaO/STIaI3e9ggS+GLnLaB9TgOk/F2TCOniM7LpGulnzFPxde3t7V5CZA9XkH7yzu7vbEdwr6I9qw8rgICSd2N+LvUdpW2mXx0oKUrRYuBs+1Nvbe1U8h/I28MNhjvYubbJer18UgsFGLqX/hTahjWsd/WF4ivFKjYVrHj6mjQszfZ8qCJFJbewNeEOEVZL58Xt8kPRz83uZQec5f+Db1A9ys0jOyclmgmA3wX/Dkx0dHVfqZOnv10ZCMCiiddoJeFcoqET9Nec/udUaRwH/S1kjzNYfQLYnsbkOHomxKkLPRuQP6+ACFuyh+12GNQuOysG66ZVNCLmVclypnM6Bb9CcgmCySxifcj4Nlzr7TDL/fZ5Jf6Wngme49FwH/+ksq4RFDh7U5yRMwWS8Qz4FXVWEXCs87pJgyIZsOcvWyO/qYDif0jPqhTYDttr5jHk+fHsyjuMfO19sxcfhtTqJaY0zyU5plHU/q/hGU+FbVwad1inSbrfAzyq0zSjadFkwChydK8zf8mCERSpu8FemYL8cZPyWilG6RtWe+dedL6wyIJ5Iix7jC8A/VBBoD8FLs9kVviX3aV7ooX8UHsrmGIyoplUGw/lPTzbKg1FSL3RNveB8ARyKxGcQcwPwVgUN2dOuouiZnV/h0ejqVGY8Ce/A4Vtot5vDU+h8aIaCErIirEBXBkPZZrrLg5FbvbDUjHEVtxMuKWQW5fW5p3C1hhtgd8XnIhnVGdl6XADtEOMJakunybQwfsDsFkU6Wt+U0k2X4flcPhPXpF6IOJlVWgy+McYVtKA0CoZwGStuHHudPiuO73mtMZ3v21hX3XCYj+SWwX9IfzrXhHRlbnPlwSgOSPujf1I+xIvPUNX7Qk7K8XQxQVoONmrXbPzoWsV4PPfVPWTViXhDCoLpLAKgcZ4EW2SPr+/De8T+gepxYGOSjy56v4jkH9hksEV7NfxTGM8iN33dpe8LvTzHzPEiGDj9IrzE3hQ6ie4QDOvvza2+KO3BfkDHe+HdYa/Cb2WPE7zRdOoTnbR/m0A18EfAP8jMp4Z/s8iXpjVJ9uFf4Psj7Db4CIG92SDVwVfQ/U3wqQiuCaoCq+jJSPE/IueCsoZ/XquQjamY0X+H+VbN6R+D8S7GRxv+H0avv/tkMFqvDDoIb5KTuX8LHBceZDJfI3S1HmP+JcuurYw/i1Me/BmwU7SfhzdKSs6/jH9EZg06Hqa/j/aJLPLJ3jD6h/rI/NsSqagme2Wu0ImHQMSEstvhkbL01RqMLobvkWyZnLJGdiRX9jNnab9Z13U6FyjoETd7EhjpKh+QLbXp5DlBSndlUYrPO7KbYQsneW06N+9It4Q+txRfoAU6e/Q/CWCtQJLraT8AAAAASUVORK5CYII=>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE1UlEQVR4Xu2X3YvWRRTHn2ULlt5feFral2eefamtoNCWoCywQlqhVyHqokwKKkmpFEHEIGiNRJcV8aLyJrarSF2s6CKzDMQyAsOkgigIEfbCm2D/APt8f3NOzjP7+z0rhBey+4XDzO/MeZszM2fmV6stYhEXFaOjo5cPDw9fk/MXHJSIZrP5JDQ1ODjYgNWRy1xyaDQaD4QQTkCz0DlrT8I/TTsDfUH/MUQ7Xaevr+9O+N9C+6HvoH3Qx8hdn5hugXYQ47ugO/IxAZu3YOMtaEfu7wLRgd4o+uO07/X39z9SK7ExMjJyNeMvyw+0MR8vwMAEdIaVvjdhd6K42pKyju8OnPTA+0yOkV0Cf5sENQH6WyWT6DsU6OuM/ymddMB22AbGvtQY1ET2I5o1qdw86FB80P6BgYFAYm+gv0cTln0X6unp6cfuIew/T9tFuyI1UkDZQnEaOjY0NHRTOobxbvjHfYz2UWhfvV6/ypPBMbmW/qc2oetSfcFW7NeyZGjS8I/aUZPsCr5n4e9O5drB4vi5mSykkmpxP2ysy0Jc8L3qu9wcEMitCJ0qE4S3FPoL+qa3t/dGfKylf0SJ8WRwBOq0h6EDeUHVN/ydIW7LlmRgrw/eUWg8lUdmgxLovPmA/BZsHNfCOc8XGDu7+Oyw5KgcrD+vWQLkViI0i+IL+Rj8TRpTEkx2Od9nQ9yGDwU7JrV4PvMjoiDW2hFanyeD71Xm92n4XZqMdlyiPy+kB03lyZCdEGtZsVuTuNsnA4HxkNULnTV4z4W4Y17zsyfnOtMhFlvR79A6rcR5ixHw70b2bbNVlgz5PYfM5hCT+xL9r2i3pme9HZJJVyWj4ON3zOKtToYrEcRp6KAZOBLiim1XMcp1uru7r2T8nRALqxyIDqtAuYwdjx1eCxREyJJBf7fpFjVIPHwO8n1CO8rl2iGpaW2TYf7lqzoZFfXCq/8MQT2YiLdAE4M+VNKQ/QfaZEM6Hq9y8zzhshZMaTLS45lMoqhRzq+CFfVjPmnn58lQcuVLcaT6LWhavchXQkEreGgi5VuWNzYj/GrV1fYuNK3jgsxdfjxcT0HIXpoM2VaA8Macl0xizs1ThnzSVXz5kC/Fkeq3IJTUC0FFzQLdkvKVNDeaJEN8OfMbZw36P2b0R7AHHTStG8ht/Z9k1OKVuTdUJ6NYIM2P/hnFnSr/h3bvi2DFLVduxHfAHpt0+ujSjTAFdaXyDtnJJ8gxugfe39J1XtkxsX+gelVRNdundOSdJ13Z0DxM5mboB/+eAwZuh34Lc98Xenl+EJJkMIk3oeX2ptBKDHgyrH+o2aa+YO+NEN8rS52nxDXizaSjWPhvlBRQHTmLxWtSC+Qf+glalfDug04q4cZSHdyM3c/9LVQk1wRVgVX05KTYvgiudGON+DaYUVKgZ+jv9FXnhhnm+wDfvzTiP4xef0/Joes7lEDZNh/yJZsHlVSNWwHXf85kiFf514xvT3cB36/AP0v7SdU7JMSX8ffIrMbns7JJ+2IticluOP1Dvd+IO3wyMdEe9soc04p7IlJgbBk0UbV9LxT2DllGgI8r0bWSpNq238b1fUU+5tAzwOIdK3sSGDoZXyJfavPBSwJWX/SzuLBhRXWSlbwtH1twUF1hW9+f8xexiIuHfwFWjqni7qFC+gAAAABJRU5ErkJggg==>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE8UlEQVR4Xu2X24tXVRTHfz80kO4Xfg3N5bfPXGoKCoyhKAuskEaoKCnywUoKikiplAkRi6AxMhsmzIdKiJieIh2xTCgbUzC7EBgm1MsEgwjz4Eswf4B9vuesNb89+3cZIXyQmQVfztlrf9dae6+99zr7lEqLsigXVQYGBi7r6+u7OtUvOFEisix7HIz19PRUUZVTziUn1Wr1/hDCSTADztvzFPozPKfBQd4fhbrEbTo7O+9A/yPYB46BveALeNc5RwlC9yTcDtmStGVdXV23w3lW785zgXcz/DfBzjTeBUoZuwHsh3m+R6yHSw189Pf3X0X/i4oDNqf9udAxAs4y0Hsi9RIN3pKygXaZIO3ovlZguMvRbxdRE+B9mzhqd3d33017KhQJdkzaIGfFdtgm+g7JH8jw9TmP9TFvHilrfGAfcQOJvZ733WCn/Dupvb29C7+H8f+MFoTnqthJLsoWhvvBid7e3hvjPpy3of/V+3g+AvZWKpUrPRnsgmt4/8omdK3srE+75xhBv+f5hnzFvo23nr7jdtSU1FW0Z9DvSrnNxGL9kUULyXtm437IVEtDseB79O68OmEgt0A63YiI7k7wDzjS0dFxAzFe5v2oEuPJoIhWeE6AcS+o3hf7SgV/nXCOg2HXyR7bTdp5MbeVwN+qicfJ9gXGz4c0y5YclYONNcsGAm81pBkMn0v70A+pT0kw7kra50KxDR+MJqzzOVtELyQZ9K+xuE/BX6bJaMelvFYiOzCWJkN+QlHL8t0ajbt1MiAMh6Re6KyhWxeKHfOKnz0F15kOtTrwN9iglah5nE3GZ+Aj8BM2v/Eckr1zLO55+raEIrkv2JHaFp/1VhJNulkycj1xBxUrtEqGGzGIM+CAOTgaihXboWKU2rS1tV1B/zuhKKwKIEyoQDnHknEQdKttRe3bEBU1OLvMNq9B0hGzh/bJzHbifBLVtJbJ4LnRYjVPRpN6oc/Uq+imGdQDEX2OaMLgUyUN7r9gyPs0YZJzecyH9xqcKb4od6ntyYiPZzSJvEbVrBuLFfUTPmnXp8lQcudNRmb1Il0JW9lJMBLrLcubs0K8LujT9i7Ynx6XWDQQDchjybe1B50TTWJS/mvWjSWddDO9YiiWxhDbz5HQoF5IVNRsoFtjvSbiTqNkSK9g+WrakTgEJvSlcVvZxANyX/8nGaXik7knNE9GvkCaH+9nPXadtLpfBCtuqXG1uAfsts9sfOnSF2Ess6+CBheSZNgx0S5crbaOC+0p2Tqn0TGxf6BKs6KqMYLTOvKuk618aB7GuQn84u06oeM28Feov1/o5vlJmLuKr4OVdqfQSnR7Muz9cFarL0t5f78a3RV0f4A3ju7L6C7iXyYdxTx+owKK7m0by2xNikXxwe9gTaS7F5zy+lQq6uAW/H7j8fPkGlErp6KnIPn/iK+YpFpcr6eVFPA07x9o8OrjGPTRHqf9Z7X4h9Ht7wkFdHt9WUKx694C6+B9Bw7oOu8ciRVw3VRHxQM/wNsR7wLaL6E/p0Q2u4eE4mb8c7X491krnzyfL0VjsgXRP9TH1WKHj0YuWovdMge14p6IWHC2Aow02752V1lB4MdsC9f9OElinhJdiibgYtt+e/qFikW1ysY72OhKYKKfxuWKpWfaeUmI1Rf9LC5ssaI6ykremvYtONERY1vfl+oXZVEunvwH0iCupIZ0CaYAAAAASUVORK5CYII=>

[image20]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAExUlEQVR4Xu2X24vVVRTHf4cpkOxixWloLmf/5oJTUDExBJmBGdJI2Q3EHsyih1RSIkQRmTBojEIHSw5U+iLTU5RK1xfxEpQ6g1SYlAT6IsE8+CL4B9jne/baM3u253fmAj7IzILF3nvttfZav+9ee+39y7J5mqebSn19fbd3d3ffncrnHAmIPM9fhoc7OzsriEqpzi1HlUrlaefcH/A1+Lq155Bfph2Df6S/CtWmYNPW1vYo8hPwIfgX+Fv4K/TujZbOenp67kL2NnO74W3YdWdTgIbe8/D7qXwaVMJXH7aDtB+3t7c/l0UxB0pi2pLO14iJIfg/dvrJSNyE4ToDZRPjEk5akH0vx+j2It8lRQFGf0A6GqP3iEBCvhS9RbRvCGD6G4NOSsowbE6hsy+dm4JKig8+1NHR4QD9PvpVfbAyOCi1tLS0s/ZR4niddgHtiniRGgktDI8okK6urgfiORZvRj4S5mhf0EeWy+U7Axh8xD30v6H/sz5cdvQH4THGKzWWXPPwefQXxz5ECtr5Dbk2UzAsjj/jjaSfW9zPmug2W/+A+kHvBlJwCrKeIrLH4Uvw8dbW1vvxsZH+SQETwKCIlmmPwYdDQQX1D/Rh8FqNI8D/VdbEPkTIXjKbs7MAYwd2I9q4IAv+WPNThiUDR+Vg84RlHUJvpQJXKqdzyLdqTiCY7jLGV5xPw+XOjknmz+d4+munBZ7Jtc7D8D/Osiroiex47LZNGZkJGOgugIdlF4MhH/LlLFujuBuD4XxKT6oXlrZrnc+Yd8LZk3NAO+h8sRVfgDdpJyZWnEy2S1XsRlV84zmti3ynalA4kjMBI/roIjBqctbst3iLwQhGKm7wd7bASecz5RMVo9Smubl5IfMfOl9Y5UB8TAUq1mN8B/LPBQLtKXh5llR45lZZ1pVmA0ZU0xqCQbvZ4iwGo6Be6Jp61/kC+EykPomY64X3CzR0r8JbU51A5ud3uCowJRN4jPeEOjMbMKyoC+iGYAjwKcHIrV7Y7sRyFceL8FAst4C35J7C1aqr7SP4SIPjIh3VGfl6M/PVfUDHIyjMBoz0o4vk+XSOiatTL0QEuVrGyHfEcoEWFo3AkFzOajeOvU43iON7Xja25j67gVTtRwM7nzlX7ciOGmhTkUA94IrBqG2Qvk/fqRhi43Fq9L5wHqTrqTFBrkBWtWs2fnStZjyc++oesuqi+sFWINiagxMrTlBRZtg/UDkGNibF6JL3i+JDdjz4on0QPlPkO77u0veFXp5fWuA1MAjwPXiZ7ah2oiOAYf2judUXAmlD9itrfBbqgb0Kf5I/PvqxyNc46XXL/Fm4ynD8mq7494diqVuT5N/sXo1kS+BzrPmEiVQHtxPjDyGmGrimqAqsoicntf+R3F6LIlV5ZGMCBV5Df492XXP6x2B8mPFfSmnnX3+vyGFkrwz6DR5QkLl/C1yQPOgEim4draV4xH/ndkyQr2d8hfbr9I0SyPmX8Wl01mH3Gv0TtG9lUUwCwfl/qC8svr3REo3JXpn92vEAREws9hQ8VJS+ssHpUvhF6RbpTYcs7XcJuHQukLLP4u2v9yQwamK+VzGpTSdvCVK6O/+zOLfJboa97ORD6dycI90SOm6pfJ7m6ebR/ynzo4wWq0x7AAAAAElFTkSuQmCC>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEz0lEQVR4Xu2X24vVVRTHzzAG0d3iNDSXs39zqamoaBqCrMAKaQS7CVJB2Q0qSbsgQkiBkEYxDkZJVL7EFJg0F7ToRUzzwTK6YVJh2IsE8yBE4B9gn+/5rZX77PP7HccHH2TmC4vf3muvy95rr732/lUq85jHWcXw8PB5AwMDl6T8OQcFIsuyB6Hxvr6+Gqy2VOacQ61WuzOE8DN0Ajpp30Pwj/Gdgb6kfR+i7a7T3d19I/y90CT0DTQBfYLcwsh0A5RBjL8DXZ+OYe9q9F+HRlNfZ4A2dIexsZHvWz09PfdWCuwMDg5ezPiz8gWtTcfrYGAM+pudvi1it6O40oKymn4bTjrh7ZJjZG+Gv0mCWgTt1yQT6Ts00ZcYPyqdmE//Ucb2M7aos7Ozh+9W6D3450dyp0Ob5gdN9vb2BoJ7udkZVQa7kOxjdzf+Hpd9vktiI3UoWihOQwf6+/uvjMcw3gH/oI/xXQZNVKvVizwYHJNLaX9O+yu+l8X6gu3YbyEJhukfhZ6JeBn9n6DlzjsdzM4vWbSRZkfzvsdYC0K+4dvUdrkmsJhrEDpcJAhvCPoL+rqrq+sKfKyivU+B8WBwBKp890BTaUFVH/7mkKdlQzDob4ROwhtxnoIMbwLeeDbL7EBuPToHtXHO8w3W0azkGajgqBysOaVZAOSWInQCxSfSMfjrNKYgmOxi+sdDnoZ3Bzsmlfx8pkdEk1hlR2hNaM6Md8uCkS6uDAoYNJ7KR3bq2RrNu3UwQr5DDfVCZw3eYyHPmBf87Mk5i/tYizD6A1qtnThlMQf8W5DdYLbONBhHqE83OL8MZcFL+fJh8y0Phisx6WPQTjOwL+SZ8raKUarT0dFxIeNvhLywyoFojwqUy9jxGLVrV4FpCgb95fIDLXMe457OabEtRFTTWgbD/Gue5cEoqRde/WeY0F2ReAM0WegjBQ3Zf6F1NqTj8Tw7+4DL2mQaFmjX7Q6da8s8+X0RuX9S2TJYUT/gi3Z+Gowsr3Wtg5FZvZBwwvdKPxbzLcprtYMmo5qhq+1NaFrHBZmb/Hi4niZRtEDkFoa8/vxIez/jT9Ge8kXEskVIF13Gz2ZzTEJBvRCY2Aopw18f8xU0NxoFQ3w58xvnSfS/T+jPYA86aFo3UGzXIX3ZyWZ/m+jK3BbKg1HfIK1P69S8Y+X/0ep9EezaS5VZ1BJ4W23R8aNrRasFyE5IMkMPOHiT6D5Ht34Tmc0jIXpn2D9QNc60GGb7sI688zyoWofJXAV95/0mMHAd9Htofl/o5flhiILBJF+BFtubQjvR68Gw9u6sRX3B3sshf68MOc/0dRTfp7vAbh29R7ZrZyPdDTYXr0kNkH/ohxAFkPYi6BABv9VYqkev4vMLfwvVg2uCqsAqenJST18El7qxWv42mFFQoIdpb/Zd54YZoD9F/9da/g+j199Dcuj6DgVQts2HfMnmTgXVUvnTkP+T6Fhuhz5La4UyB/5xvjviIMUI+cv4W2RW4vMR2nv5Pl2J5mQ3nP6hPqjlGb4lMtEa9soc0Y57IGJg7HZorCx9ZwPLhiEmd7+CXCkIqGBpv4nr+4J0zKFngM13pOhJYGhXRsqfvungOQGle8h/Fuc27DhtYSevTcfmHHRLkNZ3pPx5zOPs4T8uz6o7xZ+U3gAAAABJRU5ErkJggg==>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE7klEQVR4Xu2X/YuVRRTH70WD6N1iW9qXO8++1BYUKJciLbBCWsGiJKnAigqKSHtBNkIqgtyobDFSohIitsCi3RXLhJLNF8gyesOEQthARNgfhAj8A+zzvc+Z3bOz97m7/eAPsnvgy8ycOXPOzHdmzjNPqTQv83JWpVqtntfd3X1Jqp9zIiKyLLsHDHZ2dlZQlVObc04qlcqtIYTfwGlwxsoj6E9QjoPd1O/CdEEc09bWdgP6fWAYHABD4BPsFkUbEYTuPmxbNRbSzm9vb78em4dVj3YSbK7G9mWwOY31P6TM2Co+NlG+Qaw7S3X89PT0XEz/E4oFNqT9NaFjAJxkojc79QJN3khZR7tMkBZ0XyowtovR98tQi6D+kmzU7ujouIn28ZATHDFmk4xSxseDjD1I39KWlpZ2ym1ga0rYDFLW/MAwcQPkXm5+NusERyP5x+9e4j0k/5QrvJOaiC0G7gSHurq6rvR9OG9Gfzj2Ua4CQ01NTRdFMjgFl1L/gvoeyss0zvp0eg4Q9FvKF+TL+zabMfC402W0fwWrvW0jMT+/Z24jzY/mfYepFoZ8w7erHu2mCYu5BqOj9QzRLQF/g+9aW1uvIMZT1PeLGJtEP0m0iXIUjMSEGvu8r1To3wTOYNsbdSIZ3RC6wWyWpwO7jYw57MmOG8xGvFPKT6DIUTpYPzmyjmC3EqPTDHwk7UPfpz6RYLbLaZ8K+TG83S1Y93Miic6GDGzeLSIjXVyRiDAwmNo7P7XT6ubdmIyQ79CUfKG7hm5tyE/M0/HuKTikfaxFGP4C67QTkx4nyPgIbAXfM+Ynyj6NdzaNyDimhBv1RVJEXqpXDJtvMRlxEJM9AXaZg/0hPylvKhmlY5qbmy+k/7WQJ1YFEEaVoKKNkbEbdKhtSe3r4JIa9dWKA1a5cfE4j8lH1BeJy2kNyaBcH2YioyBf6DP1LLpxJnSbM58imiz4UKRh+y/oi31aMORc4O2xew6b4+z4jWorv6D7XPfaCFLcZ7D5Z7ZkWFI/NBMZWZ7rGpORWb6QcaKPmX7A643lDdpBs1Fe0KftdbAzvS5eNBFNyMdi8YtCnn9+oX6Qvkepj8RF+PH1JF10kT6bzTUJdfKFhImtsYlv9HotJDp1ZEivYLUvjl2JPWBUX5o4VmNmmpDGy082+6+JPpnbQzEZtQ3S+qifLIzd6H0R7LOXDoakFei22WfWP7rWxAW4ezyFDLsmOoUr1dYDjvYw+idp1r5E5vNYcO8M+wdq8g8oL5ojOKorH3WRVK3DbK4CP8b2NKHjOvBnmP6+0Mvzg+DIYJLPg+X2ptBOdEQyrL43m8wvC6m/hY9qdKj8gN2IckTyFtFVfE9j7AumZ/IO7Wwcy5hXbS4TOcmL4oOfgyOQ+lJwJOanUp6PXiTmVzF+jVwz1M4p6SlI7X8k7pikkj+vx0UKuJ/629p19XENummP0P6jkv/D6PV3rwLG8fa01ql7BazF7huwS6ch2thR/jTk/yS6ljvAZ2mu0MlBf0pEepK8hPxl/EMl//d5gPo+ysdKbk62IfqHer+Sn/AtzkVjsVdmr3Y8EuEFZ8vAQNHxtZ1eRuC77QhP+3EymyWyEcklN3kvduz70y+UF+Uqm29vvSeBiX4aFyueyrTznBAd95D/LM5tseu0hZ28Nu2bc6IrxrG+JdXPy7ycPfkPqmGu/X4n1DIAAAAASUVORK5CYII=>

[image23]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEvUlEQVR4Xu2X34uVRRjHz2ELpLKsOC3tjzPv2d3aCgp1EfoFVogb/Y6kLsyioJJWMkQQMQjSKHRRwovKm1hvlNTFft2IrkFohlCoVBB2I8FeeBP4B2yf7zvP7M6Z876n3QsvZPeBh3fmO88z88x3Zp6Zt1JZkAW5qjI0NHT9wMDAzSk+70REZFn2PDrW19dXB6qmNtec1Ov1R51zv6JX0Cn7ngO/xHcS/Y7yM5h2BJ+enp77wSfQw+iP6CF0P3a3Rl03iXYQ7XvQ+9I2+rsL/w/QnehLELwotZmFVOl7CP/tfD/p7e1dXYliDjI4OLiY9rdsrE1pey40jKL/EMiDEdyB4zojZYR6lUG6wL7RwNguBd8hQxFGeZtsIv8gCvQ92i/KJ24wvwkRXKvVbqK+hfqBOR6/quJDDzcaDUdft1HeqwlrBwejrq6uXsY/xhivinC+q+JOchFbOI6jp/r7+++I2+i8E/xMaOP7NHpIgQcyOCa3UP6a8g98l8T+Elux31Myuru7e8B+on1NwOSvftA3A/Z/YnH8Fi8k5czifsKg65xf8H0qB7sWYTJ3Y3ShyBBsGfo3eoLgb2eM9ZRPiphABqtY43scPZKuqOrgu5zflk1kiIQUq/hV1qrmhEd4qeC/FfszWriAhQVmjD1Uq0aO0sGGGc8Cwe5JjK7g+FraBr5ZbSLBbFdSv2wBP+7smFT8+UyPiIJYb0dhQzpx6ttTTEL9MwWuCcR4kWCyCB1zCRki0vlclu/WKO72ZFhQTflCZw1srfM75t1w9jQ4k/vK+WQr/RMd0UrM9OgFfDm2H1pfLWTYpMvIaMGLJJp0GRk5Tl/DFm85GcGJoC+hR62Dk87vlE+VjFKfzs7OG2n/yPnEqgGkx5Wggo0dj5127YqYJjKiYFsmPRcyopzWlgwbX3GWk1GSL0L2nySgxyLzJlGw6JciDdt/0c3WpOPxDjfPc8HWgpmeIMTdgN/BoknPhQxL6qfCpAOekpH5XNeejMzyhYwTXMnxIjoa48bypsxLuFqV9D5Gx3VcsHkgHI/gpyDSCZZNugwvknTSZXg2m2PiCvKFxDL9FPjWGM8ihiMyhGuwcOO8jv8vif7l7EGHjusGUt+uYNJGxlm9aWK8RHRl7nPlZOQLpPlpnoo7dp6Wdu8L50maSp2Z1CqwvTbp+NG1hvpYVvJ6VD+udWdoV+ooroyw/HaI+7J/oFq802Kxvi/oyAdM8YGd0DzM5k7051BvERruRf9wre8LvTy/cBEZBPa+grY3hVaiEciw8rGsTX6hv43Ov1eWBcxeit+7mVyjmBroWfTFgOnIWSzTdrEU+VB+CD3H7lphkPLgFmL8NryFcnLNUBlYSU+D5NtXKxU6q/u3waRIQV+mvCusFJMYoH6E+vm6/4fR6+8FDRj8g4hA9W1jaCz1eVSkqt35R91pdAT8Wedfn9viXQD+NthlvgfLHmLOv4xPY7OOMV+hPMH3jUoUk91w+of63Hb47qiL9mKvzGGteCAiFjp7GB0t276zFV3VGoO+ntITPW2X2LbfoVsobQuinWbxDhc9CUw6aF8q4vVNG68J0XbX7knxeSd2M+xmJe9J2+ad6JZgWz+S4guyIFdP/gMWBqcXd8P/HgAAAABJRU5ErkJggg==>

[image24]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE6UlEQVR4Xu2X24vVVRTHf4cpGLpfOA3N5ezfXGoqKLSh6AaaSAbdyS5QFkUXSekiQkhBkEahgxIGjT4YEyWROlhRDzKjPmQZQaGDBWEvIsyDL4J/QH2+57f2zHKf8zvOS4HMfGGx92/ttdde+7v3Xnv/smwe8/hPMTQ0dOHAwMBlqX7OQUTkef4IMtrX11dDVUltzjvUarV7Qgi/IWeQf6w8gv4E5RTyHfUHMW2Lfbq7u29Gvx/ZjRxEdiGfY3elc30WtINo34LclLbh7zr6v4tspP2Jjo6Oi1ObWaBC3yF8rKf8sKen577MxRwxODh4Ke0vayxkTdpeBw3DyElW+g6nbqPjCiNlFd8VBulE940GxnYB+g0yFGHU35GN6x+hQF+n/bj6+Ab1Q0bYXdfLNzYvId93dnb2eLtzoKL4kN29vb0Bcq+ivlUT1g6ORvLJ+PsY71nKdsql3kkdYouOY8ih/v7+a3wbzjvQH45tlA8gu6rV6iWRDCZyOfWvNQnKK3x/wVbsWEqG+ftCJDhzTewDZK3TtYTF8btfSOq5xb3EVBeEYsG3qx7tGqBVwWiymSG6hcjfyERXV9fVjLGS+gFNJJLBEahSjiN70oSqb/SbQrEtzyLD+h+ErD7fB91qBe51rYCfddgf1sJFXVxgfG/hs2LkKB2snunZBNjdj9EZOj6XtqFfqzaRYLaL+D4Vim14b7BjkhXnMz0iCmKlHSFNMCUjBvgjNndLZ+TtVEzTXloAu3ZkNCRkaOeGIpfVd6uLuzUZGKwPSb7QWUP3TCh2zGvx7GlwAv8sFMlW8ieySisx47EA+luxfc98NZCRzZx1Je3TWkXKHSJQbc6uFG7SZWTU9fhcZvGWkxE7EcgJZK85OKAA+f5IySjto2xP+/uhSKwaQDLuk56t8Ea7duPWT8kQ2vJim9f9UD+KLM5mSYbLaS3JsPE1RjkZJfkiZv8pC6wpNDFkm0jD9nSYSXo6Hq+SGB+OthZMSoZ2xovITgK+nXKHBTyFzyedXSksCR8K5yBDu818l5ORW76wren1Sm7HQ5LIjOU1eYF4tcYbYEzHBZtb4vGI/RSE/HkyqC9GN05i7jZVG9+P27j1JB1ty5BOukyfz+aYhCb5QmAyy9UZ/TqvF2nRqSNDeg0Wb5zn6f9LIn8Fe9AhY3YDDWt8719AtwQ55olrAV2Z20M5GfUF0vyon1TcvvM0Wr0vFGRowiSTWopuq03aP7qW8z2KtHv7CPkJjTvj45RswR5fP+gI69v+gap+p3mY78loLyg+dBOah9lci/wcvxtAw43IH6HxfaGX50hwZBD0m8giW1GtRG8kw+r78hb5BX9vhOK9sjDq8uKITsQka1C+eRr9J5nFpCNnsTR9iGl85FfkMae7EzkCsbeZSnnwbXx/G99CdXLNUBlYSU+D1LevgovOasXbQIlsRMmM+qa46twwA3zv4ftorfiH0evvUQ0Y+0eIQPm2MTSWfO4VqVmRI3S1TmL3lu2ubXx/6bc8+lfQnaL8StvfuZ9GKF7GP2GzAh9PUd9P+ULmYrIbTv9Qn9oO3+xctIa9MpdpxSMRHji7Cxku276zha5vjUOAD4norAmptu03cH1flLZFRD+SZk8Cg67yBRpLZdp4XkDbXbso1c852M2wmZW8IW2bc9AtUbN/l3nM4//BvwDJo/X9fyMQAAAAAElFTkSuQmCC>

[image25]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAFAElEQVR4Xu2Y24vVVRTHz2EKovuF09Bcfvs3l5qCAmUIyiIrpJHsJkk9dKOgiDRREWSYIGimkhomRKLyJaYnyQtl+aBpCmIJgWFBERiECPPgSzB/gH2+v71W7fnN+Z0jhA8ys2Dx23vttdZe67v3XnufU6st0iJdVBoeHr58cHDw2rJ8wZGAyPP8SXi6v78/Q1Qv61xylGXZ/SGEk/AsfN6+p5Cf4TsDf0P7MVQ73Kanp+cu5N/Du+Gj8C74C/RuSFwXBFhXMPY0/AHtUWy7yzoi5Lei85b0yvNdINWxG8Z+nO/7vb29j9Sa+BgaGrqG8Vc1D7ypPF4QA5PwWQK+JxF3YPiCgbKWfp1JupB9rYnRXYJ8QopKgPaYdNyYHXMb8gPwetnBT6DzLUer4Tq2wzYi3y9/cI7+53xecp0LoLrig3f39fUFgL2R9nYlLP+u1NXV1Yvfg/h/XovEd0XqpCChheFe+PjAwMDN6RjOO5Gf8DG+q+BdjUbjageDpK+j/aUldL3slDD9QwKCbp1ArqS9E9lp2bl/JY3smB01gbqC/izyba7TjiyOn/NkIQWqxf2wiS4LccF3qO1680griNKvzRSRLYX/hA93d3ffxByv0z4iYBwMTxze4wWV9jr5lG/3BbAPkOybWhX18deDzjF43HVkz/hG7TyXtSP0R/FxQgvnMl9g/HxEt27gqBys+8+yCaG3EqVZDF8sjyHfrDGBYLrL6Z8LcRs+FOyY1OL5LI6IJbSPsf3asmI7GnPOMOOrbd41AkjJaMelOu1IdvB0GQz5CbGWFbs1ibs1GCiMh1K90FlD9lyIO+YNP3uaXGc6xGIr/h1eq5VwW99pAgTd9/huoD8BH1bxdT2b9zw6W0IE9xXaB/iOpWe9FSVJV4FRyIlhxOKtBsONCOIM/JU5OBLiim3VqpZtOjs7r2L8nRALqyYQH1KB0ngej8/pEFdilZmpyI3Jt4qp6W0z26IGScac/fRP5rYT21FS01qCEeKx1VzVYFTUC11T65HNENSDifocUtLwZwIN3b/hzS4PEYyiziT6xer4cXQw0uOZJDHHtoqsqB8PbcAQuJortAIjt3pRXokkoclUbihvyiP51apVfxfeq+PCyt9J+w8Fk9YAB0MgqC/f1h9xnSSJObdOFZWTrpL73KEVGKFJvRCpqFmgo6k8TxBOwPBEi9VMVqslGO7r/4BRi1fmjlANRrFAyo/2WcWdGv9Lrd4XwYpb2TiL74Dtds2mjy7dCNN5vDYV4McheXeIHAw/Fuygu+n/JVvXaXZM7DdQo6qoKsZQusZlKx/Kw3RugX/0/jxi4A74tzD/faGX56cKXBNJQCIb4OX2ptBK9DkY1j6YJ/VFbfgX6ZioWQH1m0lHsZi/WQFF9rbFUtSkMml++Cd4dSK7Fz4lwE2kOrgFv/v8LVSAa4qqwCp6mqT4PYLiSneWxef1jECBn6H9oYLXGDfMIP09SjaLv2H0+ntKE7p98sz+IYtPeoGmgJe6jsgKuH7nTIV4lX+H/tZ0F9B/Dfk5vjvTY5dSiC/jYi7mfVY++b5cS2ISCCH+hvokizt8KnHRmuyVOWKrXACREs6WwZNV21dkr8xH5UNXcnlcZG+aZQT4uICuJQk42baf0LO+POakZ4DFO9LsSWDUwfgSzaVvefCSIKsv+rG4sMmK6hQreXt5bMGR/RVwX1m+SIt08egfdxS4M8FiRQ4AAAAASUVORK5CYII=>

[image26]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE9UlEQVR4Xu2X22vdRRDHf4dEKN4vHENzOfs7STAKKkmDoFaoLcUIWlRo9aFG8cELtoiUllL6UGgqSgxVCWgNiMSnok29I5ZeBK1WxIqKFqG+FCEPfRH6B9TP9+zsOXs253fMSx9KMvBld2dmd+Y3Ozu7vyxbpmW6pDQ6OnrF4ODgtSl/yZECkef5I2C2v7+/AquU6lx2VKlU7nPOnQYXwEVrf4V/jnYefE7/YVQ7wpze3t474B8Hh8A34CPwAXo3REtnQ0ND18B7Ftkk2MG8wWxh0Dr6+voeQO9VwwYCvCLRWQyVmDuKnQmtozWzyOdAiU/bUnmNEEyBf3Dk7ojdwcRxC8oWxiWMdMP7VIbRHYa/T4oKGP3d0tEYvdsVJPir0bue9ilwjv4LQUfZpflgO6gif5L2LDja3d3dV/fi/6kk/8CharXqCPqN9KfBpGwEJa2J/SOyo4DTro8XqZGixcTD4OTAwMDNsYzFu+CfCjLah/SR5XL56hAMjsl19D+k/6U+XPPoT4B5xg9qLL7k4Hf0bzGddTh0kHZlsMd4k/PZOcWwM/DbkfnxS7yR9HPze52xOrUmmFE/6C0gOScnWynCGwF/g2M9PT03aWfpn1BgQjAoomXao2AuFFQ+ao/zH7VZ4yjgfylrbO2tzh9NfXiNlHmMf3ItNqaI8GMX+qe0cYEX7OHHGwxLFhyVg62NmS1IuyfHlcqpzPkUvqAgmO4axuedT8O1zo5J5s9nvR4oPRU842ud28CfzrLKeCPY/BqMh3lRJjZ9XBHhzwowm+rLhmw5y9bI7/bBcD6lm+qFnefNzmfMi+HsyTjOv+/8jgpnwBbtRGPFZrJdmmbejyq+qTwm+SBfwHuylcpTij66KBg1PmuNmb/FwQiTVNzAJ7bACecz5TUVo3ROV1fXVcj3Ol9YZUBYUPQYXwn/bQWB9iRYm7Wo8IEUcKW18xm0KpW3oqJMSoPhGkeyOBgF9ULX1EvOF8D7I/UmQjYM3lXQ0P0XbE91Apmdn8G0gpnKRRV/I51WSqeyIrKirkC3DUbua137YORWL6Sc8FUcdc3Vi5vIorwt9xSuVl1tr4DDbY6LdFRnZOvpVAh/FfgKjKSydpR+dBE/X8wxcS3qhYhd2qjJ8HfF/DjCUTDEl7HajWOv0+eF+J7XHFvzrcaK9UB8DKrG6sT+Jl3ZsV4B6cqcccXBqG2Qvk/fKR/iyXVq975wPkgX08k4uR7etF2z8aNrI+PZ3Ff3kFVn1Q9zFQRbcyLwVGcYz8T1RmvDmwxZZv9A5TiwMclHF71fRLbGsWCLdiX4IbbdRK5x3aXvC708D5jjtWDwIS+DNfam0E5UQzCsfyS3+oIjvfC+ZY03w7vDXoVfyB47eKd4duTmwB8qsgHO/w4cyMynin+zyJeWNUn2nX+bPBbx7tE6vFvuMpbq4E58/Cz4VAuuKaoCq+jJSO1/JLfXosiK2bycAo/Tf127Lpn+MRjPMf6t4v9h9Pp7VAaj+cqg78BuOZn7t8AZ8YOOa1T4Bcij48mc5+Cdpz0Y3igpOf8y/h6dceY+Qf847TNZ5JOC4Pw/1Dvm3/5oifZkr8wx7XgIREwsdi+YKkpfzcHoarBBukV6iyFL+326rlNZIGWf+TvW6klg1IF8WD6pTYWXBSndnf9ZXNpkN8N+dvLWVLbkSLeEjlvKX6ZlunT0H4Mhqu2qvwO3AAAAAElFTkSuQmCC>

[image27]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAFAElEQVR4Xu2X64uXRRTHn2UNorvFr6W9/ObZS21BxcoSZAZmSCtYlCAVmN2gkrQIMUIMgnajsMWypZtvwgKT3JWub8Q0KcvohgWJYG8i2BdCBP0B9vk+c2Z3fuPz/Pz1wheye+AwM2fOnHPmO+c5M0+WzdM8nVUaHh4+b2Bg4JJUPudIQOR5fje8s6+vr46oLdU556her9/qnPsZ/hc+Ze1R5H/STsOf0b8T1fawpru7+wbkB+BJ+Ct4D/w+egsj09ng4ODFyB5jbiv8LOsGshLQkF/N/PPSS339D2pj7TA2Rmlf7unpuSMrsZPEtDGdL4iJcfgvTvrmSNzOwrUGynrGbTjpRPaJHKM7hHxMitoE/S3S0Ri96wUS8iXoXUb7oACmvy7oqGV8P/JD6C7u7OzsoZ2A30B+vum0Qm2KD57s7e11gHu52dmqDA5Kso/dffh7QPZpl8dGChJaLNwLH+7v778ynsN4B/IjYY52pTZZq9UuCmDwmVxK/yP6X2jjWkd/FJ5mvEJjyTUP/4b+NSbT+hPwo8EfspzxT/CqIDsTmZ1f8uggzY7ivt1EC5w/8B3qB73TSMEpyDJFZIvgP+Avu7q6rsDHOvoHBYwFMUYRrdHuh6dCQQX1F5z/5NZoHAF+XFljtgXYKeyMBH8CGdkeZDvzFrMDvc2sOaKDC7Lgjzhey3wGChyVgw2zK0sIvRUKXKmcziHfpDmBYLpLGZ90Pg2XOftMMv99ztQDpafAM7nsXAf/ro1qw5Jha7urAMMlm6siASbgUv3ITpGtUdzNwXD+hBrqhTaDbI3zGfNk+PbkHNDe0yaMj8HrdRKzFhvJTmmCdd+r+Ab5GcCYyaBmVAVeKpcPi7cajLBIxQ3+2AwcdD5TXlExStd0dHRcyPyLzhdWORDvV4GK9RhfgPwtgUB7GF6WRRWe8Sr5gVcGGUGHdD5BdyjIqyiqaU3BoN1gcVaDUVEvdE097XwBvC1SbyAFC78r0ND9B96U6gQyPyqMEwJTMtUX1u7Wd22ZJ79PofO3axEMK+oCuikYua91zcHIrV5IOZGHSj8eyw3ljTpB01HN0NX2Ery3yeciHdUZ+XooCNn8QpP/SP8Qcw/TnwqbiA2UUbrpKnneymfiSuqFiMBWazHyzbFcoAWjERiSy1lx49jr9AlxfM9rjdncPmuxkbRedvLWbxNdmTvCpoMwAqM4IO1P+1QM8eIZava+cHbtpYsBaTmyCbtm40fX6rABkyurGlJdIJjNUY31gKM/ydrHGRY3ka097qJ3hv0D1WJgY1KMLnq/iAKowRftVfB3YXwaudnrLn1f6OX5jgVegEGQz8BL7U2hk+gNYFh/X271hUC6kX2NjdfDu8NehZ/LHyd4o9kMoL3JcIHdYHom7wrXr6ju3yyKpbQmyT/8g4sApL8YPgrgN5lI9eg5fH4aYirANUVVYBU9OSn+R3J7LYrq/nk9LVDge+m/mlva6h+D8RTjX+v+H0avv3vkMFqvDPoG3qIgc/8WOCZ50LFU/sD5fxJ9lrvgD9NaocxBfpJ2dwxSTM6/jL9FZy2+7qN/gPaRLIpJIDj/D/W2xbctMtGc7JU5ohMPQMSEsVvg8ar01RqcLoHvkm6ZnmXDIulU/ciJLO3HdF2nc4GUfRbvSNmTwKid+SH5U5tOnhOkdHf+Z3Fuk31O2zjJa9O5OUe6JfS5pfJ5mqezR/8BN2azhgv5QewAAAAASUVORK5CYII=>

[image28]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEn0lEQVR4Xu2X22tfRRDHfz+iELxf+Bmay29PLhgVldYgeIOqFFPwDkEftBUf1NIUlVKQ4oNgKmoaKtKHahEkPoltQ1VEKLXtS60iKLWoKPWlCHnIi9A/IH6+58ya6eack7z0oSRfGHbPzOzs7OzO7J5GYxWruKgYGRm5fGho6JqUv+KgQGRZ9iQ0PTAw0IbVTHUuObTb7QdCCD9D56F5a0/DP0c7C31N/zFUO+KY3t7eO+Afgw5CJ6AD0GfoXe9MXwCdIOQfQLdFXqvVusp4Y319fd39/f1dngjytd7GEmhiZwQ/Jmjfxd4jDedzxPDw8NXIX0JvEtqeynMgmIL+YafvcewOBm6yoIzz3ZTT8L7UxOiuhb9LigoY/Tel48ZHyNFXkZ/VmMjUguH9EIpNKKMJb6QGTXTHoYPYDGzWDfT3QpM6wVGpu7u7j/mP4MvztJ20G7yRHIoWA2egk4ODgzd5mXM4l9E+Ch3QrsZgaAfpf0H/G9rr/HjBduy3kATDxn8rpz2h/yntd3Le26mC2fnFbyT9zPx+2FiXhWLD96sf9RaBxdyM0pkyRXjroL/lXE9Pz43MsYX+cQUmBoMUaNEehQ6lBVXf8HeHYqFpMEZZ+Gavb7XofehBz68Duju1cG1c5MUNVhry2bTgqBxsWxhZAvQ2onQ+dUyAv0MyBcF01/M9F4pj+FCwNGkU+ZmmiJzYYim0LQ2GbcIap69TtBne1sZiW6XAXic0nQZDJzcUtSw/rc7v+mCgMBGSeqEdgvdcKE7M1ph7mtyO8bzRH9C4dmLBYgH4d6H7ltlaFIwULOZOdD5JT1cd3KKrgpHzmXfU/K0ORhyE0+egw2bgeChOynsqRumYrq6uK5G/HYrCqglER32OW3pM2rWrwNQGQwFjvn3oPJ3K6uBqWm0wbH75WR2MinoRq/9sVpO7Whj0sYKG7r/QDhMpPV7h5nki6i4VDHTvRn5K/qSyOlhRP7lUMLKi1tUHI7N6IeWEr+J4FpryfIvy9qxAvFp1tb0DzShddNxjesRxckL2KoIRx5feRnVIF13Fz5aTJqGkXggsZkyD4e/0fAUtGnXBEF+TxRvnBcb/mNBfwR500IxuoGhTYzQ22JW9MNuyoCtzf6gORr5BWp/WKb/94P9R974IRZDm08EsagO8vbZo/+ga43sa6vT6EbITKk4GKXI7sj9DydUu2D9Qy580D7N9xqeYC3D+cKNdA52K34uA4Fbo9xIn9PL8KLhgsIjXofX2ptBO9MdgWP9IVlNfsPdaKN4r61KZ7MKfo/0wlQlKOfMl1qQLoPmhn4IrvvTvhU6rFhlLdfAN5vgq3lZ5cE1RFVhFT5PkxxfFjdFYu3gbzCoo0DP0d8dd54YZ4vsQ37+2i38Yvf6e0oRxfIQtVKkR/31k87BPEzttqltVwXgZ+Rzt51VpFIqX8ffobMLOs/SP0b7YcD7ZDad/qH025x5noh72yhzVjsdAeGDsPmiq6vguF3at3u9zPoUd+11c31eksgg9A8zf0bIngaED+Vrme1xtKrwkYFevfhZXNuxm2MNO3pLKVhx0SyiNUv4qVnHx8B99w5XqzN3wJwAAAABJRU5ErkJggg==>

[image29]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAExElEQVR4Xu2Xy4tcRRTGu0mEwfeDdsg8unoeOApRIo2iUYhKcAIqKg66iAouFMkElTAiQURwIpo4RDSLaFBkXInJhGgMapg8FsYoghIDihAhhMAsZiPkD4i/795T3cea7pt2kUWY+eCj6p5zqurUqapTdUulJSzhoqJer182PDx8dSpfdFAgarXao3B6cHCwiqic2lxyqFar94YQfoXn4HkrTyA/QzkH91N/GNNlsU1fX9+tyA/DPfAo3A0/x+66aKMAIXsC2161JWhd/f39K7F5RnXZVCqVK/l+H46h6xkYGOj2pI9rYn8doEw/dcacpHyH/h4sOZ8jRkZGrkL/PHbb4KZUnwHFFDyLo3c58TI5b0EZ57ssp5F9pYGxXYV8iwwVMOqvy0bfTOZOvk+HPMCRp8zJDJowsp8SG8/JaHsBlLEdh3voM7AA11PfAbdpB0ejnp6efnw+iK9Pa0Eo1/pOMihaNNwLjw0NDd3odc7hTEf5ENytVY3B0ApS/5L6Acpr1c502j1HGfR7ylfVl+/bbL6V057Yf0Z5SM57+3awfn7zC0m9FnK/HzDR8pAv+C7Vo90CMJmbMDrZyhDZ7fBvOdfb23sDY7xI/YgCE4NBEq1QzsKZmFCjzveVAptRJv6sl1ku2grv8/IiYLtZE/fBjgusY8hn2YKjdLCx2bIFsFuH0bnUMQH5hHQKgtmu4Xs+5Nvwfjdhnc9GEu0kGLYIK7xMPiDbUHJ9FYFxuuB0Ggzt3JDnsmy3Or+Lg4HBZEjyhVYI2fqQ75gN8expcNvG541/wnGtRLPHRjA+hR/CH2jzM+WE2ns7DyZzGzaf/J/r2k26XTAyOeOOmr/tgxEb4ewZuM86OBLynfKuklHapru7+wr0b4U8sWoAcdafcQvGfjigb0tq34QkqUVIxng70T+e6orgclphMCg3mp/tg9EmX+iaegnZXK3g7GrC8GMFDdt/4ETUaXIE53Jvj93L2JzmRrnDywXJ0B2XP6muCJbUj10oGLU81xUHo2b5QsaJXCt7Ck55uUV5Uy1HzAu62t6Ge9Pj4iFH5FA6VqnZvnEbdYp00u3ktU6OSWiRLwRWccwc3+zlmkjs1AVDcg2W3Th2JA7AWd00sa3atHJIbdQ22JXtdR1AV+au0D4Y2QJpftTPpmM3UPS+CHmQFjhOkNYi22HXrH90jfE9DbvcOf5PMOyYaBeua/aYHZGVyP8KLa52wf6BKq1yjSAf4Ul/xFyAs4cb5Qp4PH4vAIpb4B8tnNDL86PggsEEXoFr7E2hlRiIwbD6wVozvyynvpU+6rFD3RDYzSD7Ir0t1C+6ecoPvDyCNm+aL42c5KHx4S/BJV/qd8MTLj8pD77GGF/H8bPgmqFWTklPg2T/I37Fqvnzek5BgU9Sf0+rLh3HYJjvGb5/r+b/MHr9PaYBY3vdLCHfdW/A9dh9B/fpOR9tImy3ace0C8YL6OcVyHbHKOQv4x+r+b/PU9QPUz5Xcj7ZgugfaqeNud11UQx7ZY5qxWMgPOhsNZxqt33trbKagR+xLbzgx0mwa/Uef+ZT2Lbfkt5QHspV5u9oqyeBQT+Nq+STylR5ScCuXv0sLm7YzbCdlbw51S066IjpGKXyJSzh4uFf+VWarHR7VVYAAAAASUVORK5CYII=>

[image30]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE5klEQVR4Xu2X22tdRRTGzyEKxfuFYzCXM/skwSioVIOiVqiVYoqXWqFVpLbig1psKVIqUvogmgSlhqoEL82LxCexF9RahNKLoNVKaaWWWoSKIEIe8iL4B9Tft2fNyWRy9qYqfSjJgsXMrFmz1ppv1l4zu1KZp3m6oDQwMHBpX1/fVal8zpGAyLLscXiip6enjqia6lx0VK/X73fOnYD/hs9ZexL5H7ST8F76j6LaFtZ0dXXdhvwQvAv+Bt4Jf4LetZHpSn9//5XInmduG/wK6/oqCWjd3d3LG43G3bVa7QrNkWk11qySj1jvPKjKugH8DNG+id2HKlHMgZKYNqXzOTExCv/JSd8TidtYuMZAWc+4ipMOZF/IMboLkQ9LUYDR3yodjdG7VSAhX4TeNbRrBTD9dUHH7H/k/CE0GZ0d//Lzqyo+eBfAOoC8jv4YvE0ZHJQ6Ojq6sb0fn8/QLqBdGhvJSWixcA98pLe394Z4DuPtyI+GOdpH4J06yQAGn8nV9D+jv08b1zr6Q/Ak42UaS655+BT6NwX7zh/CAQL7kXa86ETLyOL4KT5I+pnF/aCJLjFf4+oHvVmk4BRkK0Vkd8C/wQc7Ozuv18nSPyxgAhhKbW0I3h1OlM295vwnt1rjCPBflTWR/WHZCeP/Qqzfgp2jOrggC/6I4x2GVQNH5WDD9MoWhN4yBa5UTueQb9acQDDdxYynnE/DJdqMqeo0m/VA6SnwTC47t8C/OMuqoPd/wWDtAngiBUM+5MtZtkZxl4PhfErPqBfaDLLVzmfMS+Hbk3NA+9hNf+Nn4PU6iWmLM8lOaUyfQloYkY9g83Xar+Fjqkds6vZYp4yiTReBkcvxMWjxFoMRFqm4wZ+bgcPOZ8pbKkbpmvb29suZf8P5wioH4gMqULEe48uQf2D14Ai8pJLUA6UxvDHI6a9C7zR8Z6xXRFFNKwWDdoPFWQxGQb3QNbXR+QL4QKQ+g5Te8A6Bhu5f8OZUJ5D5OQ6PCcwgt4xqAqTbCp1j8PuVskJnZEVdQJeCkflaVw5GZvVCyolcxfEsPBrLDeVNmadwtepqG4H3lHwu0lGdka9n08lA0UnPutlaUbrpInl2Pp+Ja1EvRJz2Si1GviWWxwhHYEguZ/mNY6/TF8XxPa81ZvM9W/M046kYnKK0LyFdmeOpfgRGfkDan/apGOLFTSp7XzgP0rl0MSAtRTZm12z86FrJeCLz1T1k1Vn1w1qBYDaHNJZtl2RK9Jk0bx37B6rFwMZkdma8XxQfsoORrxvhH8J4Frnp6y59X8QvwxwMAn4ZXmxvCp1EI4Bh/f2Z1RcC6UL2LTbeDe8OexV+JX8Nuy3Y+F2MR+JNYmMFst/r/hcgp7p/syiWljVJ/p0H8IlIdi98Uj5MpDr4Kva/DDHlfk1RqaiiJyf5/0hmr0WRgkE2KVDgJ+m/rVPXnP4xGO9m/HPd/8Po9bdCDqP1yqDv4K0KMvNvgTOSBx3pI1+X+derrnFl4ynGz2kuKLHmBeRTtJ/Gb5SYnH8Zf4/OGtY/Rf9QakcgOP8P9aHFtz0yUU72yhzUiQcgYsLYffBoUfpqDU4XwY9Jt0jPMulh+Sn6J7G0H9Z1nc4FUvZZvIOtngRGbcwvVExq08mLguyT0s/i3Ca7GbZzkjenc3OOdEvoc0vl8zRPF47+AScapvwAbv+0AAAAAElFTkSuQmCC>

[image31]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAE2ElEQVR4Xu2Xy2vdRRTH7yUKwVd9EIN53Ll5aHygtAbBF1SlmGJ9QtVFreJCLbaolIJEQaGpKG1okeKrG4kLEduEqnQT0tZNtSIosbSC1E0pZNGN0D+gfr53zumdO7m/m2y6KMkXDjO/M2fOnPnOzJn5lUrLWMYlxfDw8JWDg4PX5folBxFRrVafQSb6+/srqMq5zWWHSqXycAjhD+Q8csHKWfRnKOeQn6g/iWmb9+np6bkb/RHkAPIzsh/5BrsbEtcN0A6ifQ9yZ9ZURjdM/zHKj3t7e5/u7Oy8OrNZDHI/j5eSmB1DQ0PX0v4adjuRrXl7DTSMI2dZ6fsTdRsdNxopm/kuM0gXuh80MLYr0e+QoQij/r5skv4OBfoW7afVJ9FfgW47ulHz28/3JDLT1dXVm9gthLLiQw709fUFFutG6ns1Ye1gN5JPxppmnJco2ynXpE5qEFt0nEKODQwM3Jy24bwT/XFvo1yH7O/o6LjGyeCYrKD+PfVDlNen/QVbsZMhI4N+t6E7gXwrf2a7PsQdOlb30BoWx5/pQlKvWtyPmUrEa8H3qe5285AENc8Q3SrkX+Rwd3f3TYyxifpREeNkcAQ6KGeQyTyh6hv9rhC3ZQMZrOCtIU5iWqspXYhkX0DG615ag/6j2B/XwrnOFxhy9/BZNnKUDrbUezYBdmsxOk/Hl/M29NvUJhLMdjXf50Lcho8GOyaleD7zI6IgNtkR2hLmHxMtxArfFbLH5iPzvy61KwL+2pGJkJEhnyHmstpuTeJuTQYGYyHLFzpr6DaEuGPe9LOnwZnc1yGunuRvZLNWou4xAv292H5ovpqSkUBEiNyT9PkgPeutkEy6iIyannFHLN5iMrwTAZxBDpqDoyHulE98+6ZQtqd9e4iJVQNIGpKeHY+ddu2KmEIytGqM9Rvts+qj45jbFCHJaS3JsPEVZzEZBfnCs/8cgT6SmDdAE0O+EmnY/odssyYdjzd0TbqtBdOUjARt2LyHnBJBeWMzWFI/5pN2fU5GNea61mRULV/IONMrOZ4OWSIzlrdWI/xq9bM+peOCzT1+PLyfgpC/BchIE/aMEnPeniOfdJG+uphjEprkC8GvOPSjqT5lOCFDeg3mN84r2vaZ/BPsQYdMaaLo7tL4Kt1/su0XJM6gK3Of+hSQUVsgzY/6WcWddr6IVu8LBRmaMEnga9DttUmnj671fE8g7am9Q37yCVL/VGOoTHS+I0/oCEtn/0AdRUnVfF+0FxQfusOah9ncgvzq3/NAwx3IqTD/faGX55cKVANJQZDvIKvtTaGV6HMyrD5dbZFf8Pd2iNt/levkmz5/hfrDSHbPB0veJYtJR85i8ZzUAI2P/I48l+geQGbJW/eZSnnwXcb70d9CNXLNUFtRSU+D1LYvhmvdWSW+DeZECvIC9V2+6twwg3xPaiKV+A+jh9OzGtD7O0SgfNsYGks+D4pUu3E+4/s7yg3V+CbRcfo8fbyhex3dOdklb5IGhPhY+wWbjfh5kfoRyldLSUw2nv6hvqjEHb47cdEa9soc0Yo7ESlw9iAyXrR9F4myrl/8PCFhe/fkBoJt+x1c31flbQ49AyzekWZPAkMb7Ssh4ymVeeNlAW33EH8WlzbsZtjNSt6ety056JZgWz+U65exjEuH/wEXkaMJNPV69gAAAABJRU5ErkJggg==>

[image32]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAFAklEQVR4Xu2Y22tdRRTGzyERxPuFGJrLmZMLRkGhaRC8YbQUU6xXbPVBK/igiK2lloKEPgi2XoihIkWsAZH4VGxTtVqkxbS+VCtCRUVF0Jci5KEvQv6A+Pv2rJVMJmcf8tKHknzwsWevWWvNmjUza885lcoqVnFRMTQ0dFl/f/81uXzFQYmo1+uPwcne3t4aomquc8mhVqvdG0I4B2fhnD1/QX6e5wz8ivbDqLa4TVdX1+3IT8Ej8Dt4GH6K3vWJ6wIk63L6noRjtEex7cxUWrq7ux/E9m3jI7LJdJaDKrZDjLNXfuSzksTsGBgYuJr+FxQP3JX3F6BjHP5LIHcm4hYMt1pStvFeZZAOZF9qYHTXIt8nRSWM9h7puDE75mbkJ+AO2cFH0fmao9Wmfu0u2cPdsAe9Z3n+Db/t6Ojodj/LQFXxwSM9PT2BhN9A+wAc0xiuJJ/EfFLjKOE8N6ROCihbGB6FZ/r6+m5K+3Dejvys9/HcBA+3tbVd5clg0tfS/oz2cZ7XyU4T1qSUCF6rBHIF7UOarOykQ3u9ydb4eLxvCXF3jvPa6vJmsDh+TheSdt3iXm+iVvmEE2q73hJoBVH6rZEiskH4D5zu7Oy8kTFeon1aifFk+MThlBdU2tvlU77dF4m9j8m+olVJdOYUpOtoB/H+U2iwMGXA3yj6Z7VwLvMFZrz3eK1aclQOti9YNgB6G1GaxfC5vC/ELTyrJJjuMO8XQtyGDwQ7JpV4PosjooSgd4y+49qyoh2NRWeY/kE7RltdluzERZMrgxILJ3N97dwQa1mxW5O4mycDhb0hqxd2np8Jcce87GdPgxP8JyGuqPgn3KaVcFvfaUoIum/x3BlibZhW8XW9RlAMigV+rLHy/hzJpMuSUcjxNWLxlifDjQj6PPzCHJwOcae8o1XNbdrb26+k/40QC6sGEOeLXj0eHxVCrcQmM1OR2yPfOgqJu3ko4drW6PwB1+X9jVC2k/JkhIUjWZ6Mknqhz9QOZDNM7P5EfRE0afiRkobuf3C3y0NMRlFnEv1idRodR6EWv0jn0BvO+8pgRf2MT9rleTLqsdY1T0bd6oWUM7lPaL64CZblXfUI/7Rq1d+ER3VcWPnbaP+lYBSU23oyeL6fuCyAfB38Bg7mfc2QT7pM7mOHZskIDeqFwCpttsBHU7mS5k6TZPhEi52QrNaykhFiIj6HPSZqZfwt+mSneiXQJ3MilCejWCDNL8Ra1DgZze4XISZpLjcmyA3IDthnNr10beZ9sh6LngL8ICT3DsGTkR4T1RlkE+klS76RjXlRtt9AbekFKoViDNln3HxMax6mswb+4O9LQMetIRar/H6hm+dBBa6BJGAiO+Gw3Sm0Ej2eDGufrCf1RW34q3RMtKSA2pGbgr8z3o/OEH8OHKxYTLRft1iKmpRD44d4N3kikd0lP4x1h4lUB18jnmN+FyqSa4qqwCp6GqT4PYLiRndmxWxGQcGnaL9bt08dX5h+3qc02Vr8DaPb3+Ma0O3th9yr9H1fi1d6JU0Bz9eEsFDhl7CeHE/sX0R2geeh9NilCPFmXIyF7dO0T/F8vpLEpCSE+Bvqw1rc4fsTF81ht8wRW+Ul33yc3Q3Hy7avwHbtQuch+dAnOe9fLmzb79O1Pu9z6Bpg8Y40uhIYWuhfW4s/CH3XXlrQdg/xx+LKhn0Z9rOSt+R9Kw72V8A9uXwVq7h4+B+bEK/zN4IIMwAAAABJRU5ErkJggg==>

[image33]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAXCAYAAABaiVzAAAAEDUlEQVR4Xu2X24vNURTH54SacqcxNZezf3NhIoRJIYWSkbvcHoTyQkZIShOlXCKmpHnBi8aLcplc8iK3FyJFCCVKUvOgpPwB4/M9v7XHnu2cw8wLTbPqe377t/Zaa+/v3muv/TslJQMyIHmlsbFxSH19/YhY369EJJMkWQnaa2trs6gysc1/Jdlsdq5z7jn4Abrs+RL9Z56d4BbtZZgO8j5VVVVT0N8HV8FDcAVcxG50ELqHaOfpPw0mxX1/EhazlPhrwElwkPHHxzZIhtiN9B/heby6unpRbJATDFrBF4LOCtSDcNpkhJt5zxCgAt0NBcV2GvqjMtRi0D4gm8Dfiyaxi/4P8ok7i4kWCL9L+O8vKysb5hfZFt9LRvMDV2tqahw2Y2i3Bf2pNDQ0DKejAzyqq6sbF/bhWI7+ie/juRRc0aCeKKk7kvZl2rd5jgr9JbbSb/pCFJ+dcVzirUX3wM/V5vEi3CTaiW93CxOdgOFrcJ7XwWEfuungI7hXWVk5Fv/tfhBPlFUv43kXXIuLk+3IKZemXa+IipyRPBPqNSfIvke/2Oxa0D3Rpngbbd4vDxM5YPgD581xH/p96hNBs53H+1fQBhaIqJnqDMdpm5GfpbV2pldE/QbERBXDYrWAUtAeE1XGhT45weiIi86nqiq6jRoI7NC79ArMxC+4tHAJ70BzvhVEPwPbQxar10QDQoWInhEhlxbD4kS9IRP6DK6b0wOX7vAJHeweDkh5eflQ+g+7tEh1Ge5WVFRUextL2ZN29fiz1luiTYpdjGhQQ4oTLXA+fZXsJNj8wLyHaEBwTguC7Xewz7qUstuo0Cu8bV+IEnehS49NQaJWIB/9kWhi5zOxMxjoc8FAa6i3FdybpOKvF5X3Y6BDKYzNVJ+y3q8vRENChfR/nbouz/mUWAlX2rSE+iStul2aeEBUeqWZr8xb8H8a4b2zjxHQoUodxs0nxEmwfV6IKDF38zqY9vmiRIvdny5dgByhUG/p1GaEuolqYXhvB6WhvRfF0eTkE+rtI0B1IK7Y3fUjjkt7nmqKnnq32K91DL2N5ufbMpgI3rrf7099EZ0NiRJ0jwLbnakVrPFErX0nKXKetfouvY+ne50Iyg/dJ87zzNDeC37rlBHsljOV6sd+/G76O1vjg2dgtfejPTv349JKpQLS5SylEruAJdn07usUYbCe9im/qkywnvdrvL/Syrr0q2RVSZ5d0eIoto2hsRTzuhbMduwi+AZ2xL4SnXPsTyTpl9cSkeR5T5+CoZ1Lv9ge078J2w2074f9RcW+fpq0U55kKASbA1rDotMXscXYGusDyWhxIbFcYxYazzJE823Kdy3+c2HyzYVSt98IBCcrK/JlTL8SpZn++sX6ARmQ3+Un2/9mNZikmYoAAAAASUVORK5CYII=>

[image34]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAXCAYAAABaiVzAAAAET0lEQVR4Xu2Wy2tdVRTGc2kLxUd9EQN53H1uEg2CgiUIKtIqiBHrE1+DogNH0tRapVBCHdmqpWZSgqCdSDpR7AONOlD6cFKpFCq2oCgVpAgZCCL0D4i/7+y10tWTe24CDpSYBd85e6+91trr2++urhVZkbYyOjq6Znh4eF1Vv6xEJIuieAJMDw4ONlE1qjb/KWk2m/ellM6CS2DO/j+gv8h/FnxO+VFMV7lPf3//HehPgMPgG3AIHMTuhhC6FAZiLW1Pg32UJ/Dtq9osJjEGeIMYt1RtkAb9j9K+m/87AwMDD1UNSsFgEvxO0LuDehVOLxjhceoNAvSi+0xBsb0T/R4ZajAo75KNOzPTt6L/CmyTH3gcmy9Y7t1us5hoa+DzETF2dnd3X+ODbIPv0lB+4HCr1UrY3Eh5KrRnGRkZuZaGo+DU0NDQzbENxx70p72N/yZwSJ06UQhdR/kTyl/yv15+IkP9mEhSbfT29l5F+WN0F+QX++gk2G+NcSXEeQbdSc/V8vg+ThLlwsvzopHH8Dw4QHV1bEO3HvwKjvf19d2E/8veiRN1UuCIH06W4HnF9lgM2gaSfEVL8XIP9SJyRnJ/1Csn4vyC/mGzm0B3WpPiNpq8yx4mcsDwEs4vVtvQ71CbCJrtRup/gCnwgIiaqfZwuWxFFrsZJallJNhynd/nSxGfgCpRG2CtjAmwFkxXiWrFRZ9SMNqdKvtTpyq6zeoIbFFdegVmQD5M+eASfgLjcQRDgjPYvs1/O/U94Lj2mNstJoFQHdH9IpTyYdiZqBuS0EXwqTmdTHmG92o2rnBAenp6rqb9zZQPqTnDMfbhgNo9kZRnfpO56cDYpdg6mEK4WiHOmGJ3IhrOkM5Ea/anjupt6GYJdn8wv0LUIfhAA4LtX2CH641oua+DfZl4uy3STrB7MOVtU0vUDshTixItbH8WtgeD3pOdjHobwdeLLH69aLbeAke1hJmx2yn/nOx0dl8nWk28TiKhOv2Sl25qsz8ldoQrqYmoL/KpOwe2BqJOopzBMMr/lGiB/dmqvfV7gRxfpbqa8oGORDvdnykPQEko6m05TdlVM09UA0N9ushXhzp/L1XuPycal649AnQOLHhC+myFuKVQ3qgzRX/VlWOqXGVxy8jgNvBjWnh/6kX0fiRK0O0KbHemRrDlRK38dRH2s8rgnGxMteAwEkH5ofsN3V3uG4U8ngXfMVvJVDo/duI3E+7sFjgDnnI/yveUn5RPKh0gc8net4VdwJJmftLNijB4jvK7hY0qCQ5TPyIiGtmUXyVPdoVZsUf/a7R928zPSA2IklnvNjZjB8GfYIvroygO/nuL/PJ6RCRTm2sq5Rdb2Re2z1M+Eds7ir1+xmx2FrxmCHYvmPQ7tp2whPqVoGLoWqq2S4r8CHmpqg/S0OBC4jH1WdefrRDlO9buWvzXheTH65bushG7iibbrZhlJVpmS30prcj/Xf4G6PF0hgWYZ6wAAAAASUVORK5CYII=>

[image35]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAXCAYAAABaiVzAAAAEJElEQVR4Xu2X24uNURjG9w4l50Njag57fXNgUhRNCilERg4hpwuNC1cyQpqSuDJkYm6YFFPSuCGnHHIjpxunFDFFiZKUCyXlD+D37LXWnjVr9rdnXNE0Tz19a7/rXe9az7uOO5MZxjCKorGxcVR9ff2E2D6kIJFJkqyD3bW1tTlM2djnv0Iul1tkjHkFf8Hf7vsG+xe+3+AdymtwHeHbVFVVzcb+EF6Dj+FVeBG/yUHcZdhOw5k1NTXlIevq6qYpUd53IJDM0cTZCE/Aw/Q/PfYBWfpspL6N7/Hq6uoVsUMeOHTArwSdH5hH0KjZCW7hd5YAFdhuKSi+c7AflaOSQfmQfFy83cYmrhh7WAUzgn5Soa2B/yXiHygrKxvnk+yS75HF1gKvkUiDzxTKnUG9RUNDw3gqbsAnynZYpxnA/tzX8V0Nr6pTL5RBT6R8hfJdvpPUztjEnTd2FjxPwmfGJS3sJw3GJqwQV0DkJmyP/FjdOF6Hk0Q58eUClF0ce2AXP0eGddjmwk/wQWVl5VTa7/SdeKFkvYzvfXhdM6AkMJh2+Yex3NLq1FIM7WmQOCfyVGjXmIj1AftK53cQ23NNivfR5PW2cFADHH/ReHtch71VdRLofBfz+7sGDJdKqHPVHs7PkoRIVCZImktGV0VFRbW3DQQ/AbHQxCb4owSqL9gdC1WywzZ54NRmov2pwwLbNnUEd/nDw4m4YHr323vYUjSDvRipPmi7Pq4ohUBQmtBTEmTsYVhaqHdk8F/gTdfokbEz3K6N3acBKC8vH0v9EWMPKYkV76fNFnUL4KW/vXMR0qTYpYQGZ0hpoSn7U0f1Hgkh2JLAvQ/UITynhOD7E7bGPhk7m2dgW1wxEIi73NhtkyrUHZBPBhSauP2ZuD0Y2PPBYEdodxncn1j460XH+zF4I17C2GbCdzopQ/tgEApKsw966Zoi+1NwR7iWzcHQnthT9zfcHQiVXcssfzKH/jrgXJym0D4Y0Cah7as0ocTem7Erpquk0FL3p0tAXlBod8up0101BaFKDL+7k+jqMMUfIgW4R4DOgX73qp+tOC7lxTpT9NVvjdFEj5A+CTduWZn+96deRGdDoQTdp8D+moA1Xqgr30ui/azBaZDGLrM5YZ0ggWpH/WdeXPPieoFxbIYv9OJxJp0fB2h32x9u6h++hBt8O8oL/Cmok0oHiMTk37eJu4CFnH3SfZNguIXySQ1cdQywnt/X+f1WmTX2VaKro8+scAqPof6ySRHqZuwi/AF3xfWCrjVitCf25bVKIvk+0FMw9DP2xfaU+mZ8t1J+GNaXhHv9NGmmvMgQBFsIO0o90HXlJHbZFv4UxEjsI2RHbA+QVXIRsVZ9pvXnVojG21TsWvznYPAtaUt3yACBs7Qqiq2YIQUtM/31i+3DGEZ//AH53V/FypwELQAAAABJRU5ErkJggg==>

[image36]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEkElEQVR4Xu2X22tdRRTGzyEKxfuFYzCXMzsXjQpCJSjeoCpipCoqFn3QChUUMUWkFEqpINiKoqFS8qD2ReKLl17w+lLbVJBWIdBSCwpSX4rQh74I/QPi79t7TbIye++T5KEPJflgMTNr1sys+Wb2mrUbjVWs4qJidHT08uHh4WtS/YqDiMiy7GlkanBwsI2qmdpccmi32w+GEE4gF5BZK0+hP0t5DvmB+pOYdsUxfX19d6KfRvYjvyD7kC+wu95NPQeRRf+zqT6C+W6h/23kQ+Q5CF6T2iwBTdYfZfxOyvf7+/sfazifI0ZGRq6m/1Vba0van4OOCeRfHLnXqbsYuNFIGafdZJEedN9pYWzXot8lQxFGfYds1IaAW+nfhHyt8ZR73LxzsHHTIrjVal1FexvtL5f5+TXlH7J/YGAgMNcN1Ce1Yd3gaNTT09OPH4dY4yURTvmonySH2GLgQeTY0NDQTb6PybvR/x77KJ9A9snxSAYbv5b6N9R/orxO40QG7fWMv4dypoqM3t7ePvp+xakNUafxmgd5xdt2gvlx0h8k9cz8fsRUl4XiwPeqHu1KMMdPVxmiuwv5BzmC8zeyxuvUj4qYSAan2KI8jBxITzSSWUWGSKDvjOZxap2yTjUn3OlrwfjtWkNrRV08YNb4mGbTyFE42Dw/sgLYPY7RBQa+nPah36o+kWC262ifN4cfDvaZNIrvsxREO5GBfmcok6E19shxbcDrq4DJGmQqJUNEhiKW5bfV+d2ZDHNqQbzQt4buxVDcmDfit6fFIe3zUARbyV/IuE5ifsZ5dCLDNl1HRklfBbfpOjJyPXONmb/1ZMRBbPAs8q1NcDQUN+UDBaN0THd395X0vxuKwKoFJIcVoFLbOjKcs6VNL4cMF9M6kkG52fysJ6MmXuiZejMUr8BDznwB5CzymUjD9j9ka2pTRwbEXcG4r6o2vRwyLKgfW4yMrIh1ncnILF7IONErOJ5BJrzeNrclKxCfVgW995CD6edSR4ZQt+k6fRXSTdfps6V8JqEiXggW6WfRb/f6zDHsyJBei+UvjrdfhAy9AqVNGxkzymm8vgZ6MvfGTUelIyM/IO1P+5TffvAcOuUXoSBpNh2sRAXdpD2zPunaQHsqS7LHRcjQrdSnuM7p8tfBz2X/QC2fQHnIR+S0Pvmok3/ojmgfZnMz8ltsl0DH7cifoZxfKPP8NDgycOwtOW05hU5iIJJh9UNZRXxxAW6S5oKn1zLFH4OLNZoLmQkufceXd8yXUkwSqsZQvw85xe2621SKg9vw8fuYC+XkmqEcVNDTIvn/iE4qTtYu0uRzIgV5nvpH8aTYxDDtA7T/0CsUiuzvGS0Yx4s4c3DuxcH2b8qfKe+IdqFI6o4j4+ifCkX2ucPfAvSvoTuvgFuXiIUiMz6OzUbWfoH6NOWmhvNJJITiH+oTu+G73RSdYVnmmE48EuHBZPcjE3XXd6nQU601mGu9UvS0X7Brv0uvUNoXoZtm/o5VpQSGLvrXiniVaeclAV133Z5Uv+JgL8NuTvK2tG/FQa8E1/qBVL+KVVw8/A+Fppes1pmSVwAAAABJRU5ErkJggg==>

[image37]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAXCAYAAABaiVzAAAAEX0lEQVR4Xu2X7YvVRRTH72UVhCx7cF3Yhzu/u7u1CAbFIqQIKkQbPZCR2YuwF74Kd9EIQaReZaHYvln2jYooK1GQuvRAEKFrQYYSKCUYiEIsgS8CEfwD7PO9c87uOHvvr6UXEsseOPc3c+acM+d7ZubM3EplkRapKQ0ODi7t7+9/JJcvKBLIoihegyd6e3triKq5zv+KarXahhDCZfgufM++vyGf5nsL/pb2K6i2uU13d/fTyKfg0/CP8Cn4JHqPJa4rJGEZ8jfgQ/CH9Xp9oPIfEpL7Yf4ncx2oyvyDjO/ne6Cnp+eFXKFBKIzCf+H0uUTchtF2AzxMv4qDTmRfyym6zyD/WIpKBu0PpKO+tjT9Y8i3AbADuzX0z2DzruvMh8zPF/jZ297evtyTbMl3qio++DRzBXQepz2ejEcaGBh4mIFJ+EJfX9+qdExBIr/oY3xfhk9pUgfK1l1B+0va3/F9VHa0dxDM7tQXstXIvlcwqbyMsBlJ/YrwsRXZeY/V4riSLhLtwtszRKBPoXgVPkp3STqG7Fn4Jnyuq6vrCa2IT+JAyXo737PwGS9OjI2FZIVFSpqAanVnJighgTOQY6lcMeHnOvIXTW8fsovy7zpavFkLIxmgeBfjd/Ix5Hs0JoCmu5H+3/A4vFlATVVneAaUTX4H3t/R0fGQybbAE9oNrldGvgA50CIm+IbmgJfJZw606RwKJmTnU1UV2duaCN6pvuRyTEJOhFi4xH/Aw3kGOzs7e9D7yXR+NuCTkqd6ZZQAagV0TIBCLIblQF2RoKbhr8zofIgrfFAH+z4DSCvE+EchFikBEZ/NQWhF8HHJxrUrxvKElBH6Q7ItA5rUkHKgLc6nSvUuAcHZpkT9PtKE8BElJMRtusfHVJ3pT+o4wNsUmIJWMpslrxmh+7wnKJWnQK1AXvhXoIWdz8LOYCJvOINHU7ll8P0ikl8vKu+fCJhWrJjd3iNuB7gu+scFFt6RuGxJKaBW8nlv3dDkfIpqsYRr2+xL5UWsugp2JAEqubZZozKrqup8ardktrr4P8sDb0XoFehfzvVt3hu1eH0toX20FGjZ/WkJaABK5badxu2qmQGqxNCfEBiTTynQ1Nb0dsu39+0RoK085xHhq+V+XU57I36m9VVfMcJX08QqPm83LnD4Wph7f+pFdDgFitP35NjuTGWw7kCt/UNh59kC/FznvJIAoFitVOCs+Fr1BVB2yP50WU74eBO+VJ99ZKh+7MXuG7+zNT/8K/y629Fe1/gJsVKpgNwL9r4t7AIW1eKT7pYA12Ix+dSzSoD9IT7nfldmQ3yVbKkkoDS5gRDgrQJN+5x8uZ4l5CR8G97ptinpWsPmYBFfXi8JpPzoKZjqhfhi+4Xx7ei+RXsqHS8le/0MaaUcZEo4Ww+P+h3bhNq06kz+qnz4wyGnIj5CygpUVcmVH83Zaj7bIYp3aL6V/YESwQ+32roLhuxfzWizHbOgSNtMj4tcvkiLNJf+AbsHb8tG0hWUAAAAAElFTkSuQmCC>

[image38]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEbUlEQVR4Xu2XyYtdRRTG36MVGuMsz8YeXt0esE1AaGkUJ4hKsEMcA0EXGkMWETFBJAQkRBRMREmaiDQ4ZCPtSs2AA25iBjdRQ1CJQQOimyBkkU2g/4D4+26d6i7r3eEtzCJ0f3CoqlPnVJ36qu6puo3GEpZwWTE5OXn12NjY9al+0UFEZFn2FDI7MjLSRtVMba44tNvtB51zvyBzyCUrT6M/R3ke+Yb645j2BJ/BwcE70R9DDiDfI/uRT7G7KRp6HiKL/rWpvgjYrUFeT/VdoMn8k/jupHxnaGjo0UYUc8D4+Ph19G/CbjeyNe3PQcc08g87fW+k7sFxvZGymXaTSfrRfaWJsZ1Av0uGIoz6DtmoDQG3078R+Vz+lO9H4xbCSDvRjW2CpuJDDgwPDzs262bqM1qwTnAw6u/vH2Lsw8T6PGUv5ap4kBxiC8dDCmR0dPTWuI/B+9D/FPooH0P2t1qtawMZLOIG6l9Q/5byRvmJDNpr8L+H8lTdAhW08xsyV2ebwuL4Nd5I6pnF/YiprrLx96ke7DpggZ8pMkR3F/I3cnRgYOAW5niJ+nERE8ggibYojyAH04QayKxbICfuSXbqTdcFcSmw3645NFfQhQ1mzPdoNo0cpYMtC54FwG41RnM4vpD2od+mPpFgtitpX3D+GD7s7DNp+O+zI4l2Q4Z9HrttUyptU2Dbi8ymZOjkOp/L8tMaxV1NBgY7XZIv7Ng+5/yJeTl8e5oc0j5xPtlKziKbtRMLIy6gjgyNy3hvKAfV2RYhWnQZGbmeMacs3nIyghPBnEO+tAGOO39S3lUySn36+vqW0f+W84lVE0iOKEGltnULVOLN/Klr1tkWIfhIqsig3GJxlpNRki90Tb3i/C3wUGT+H9A3gXws0rC9iGxLbaoWKPLo2xPyTJVtGSypn6gjQ4TXkpFZvrDdifVKjn8h07HeAt6aeYSrVVfb28ih9HOpWKCy+w59HkFRYVuKdNFl+qybz8QV5AuBINfJGf32WC/SwqARGdJrsvzGie3LFmg3kLL9ySC0f0Yu2id7Ep8NsU8JROo+zVFCRr5BWp/Wqbhj53lUvS+cJ+lS6kyQq9DN2DUbP7rW0Z5FemP7MjKKUGZr/0Ct+AEVQzEiZ/TJB53iQ3dU6zCb25AfQ7sDdCxH/nCd7wu9PD9yERkE+Cqy0nZUOzEcyLD64awgv4QFIjM0O67eGHrdYncqtW3794di6chJguY3v7WR7j7kNGPebSrlwdeI8euQo3JyzVABKulpkvx/BMPVYTBleXTnRQryDPU9Yde5YcZoH6T9m46086+/pzVh8BdxFuD8jYPtn5TfUa4IdgKJ9Br0H9hYuS3ye2afCfoXaV+g/EzHP/YNcP5l/AM26/F7lvoxyo2NKCaR4Pw/1Id2wvdGQ1TDXplT2vFARAwGux+ZLju+/yfs2O8ScWlfgJ4BFu9U0ZPA0EP/BGQ8oTLtvCKg4+78z+Liht0Me9nJO9K+RQfdEhzrB1L9EpZw+fAvkPyK1oIm5jsAAAAASUVORK5CYII=>

[image39]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAXCAYAAABQ1fKSAAAEn0lEQVR4Xu2X24uXRRjHfz+2YLGz8XNpD79595BrQmAsSlmghbTSgRKiLtTEoIiUSBFEDILWSGpZkb3wcBPbVeWBDnSRWQZiBYKhQkEYhAReeCPsH2Cf7zvP7I7ze993F8QL2X3gYd55jjPfmXlm3lptnubpltLQ0NCdAwMD96byOUcCIsuyl+CJvr6+JqJ6anPbUbPZfMo5dw6ehK9bex75Zdor8Hd8v4BpW/Dp7u5+FPnP8FH4F/gI/Dl2D0Shp0hgoV+XymMi5sPYvA9/kuabJdXxG8J/hPbjnp6eZ2sFMQYHB+9B/6bywNtTfU4oRuH/WOnHI3EbjhsNlC306yTpRPaNEmO7DPkeGWoCfO+WjfoAsBj9ZvhL+dPuj+JOke2wbdh8r3hwRqzPaDalthVU1/jgo729vQ5gF/I9rgkrfjDq7OzsIe4J4m+gbaddEwfJSWjheBw+09/fvyjWEbwD+e9BR/s8fKTRaNwdwGDi9/H9lU3ofvkJDPrP4b+C9mwZGJo0+tN21ATqGvqTZfZFZOP4I4sWUqDauJ8x0R3OL/hhfQe7FrKBXywyRPYY/A/8U1dX14PkeJvvUwImgEERbdCehI+lBTWAWTQ54nWjOw2PBJn8sd2mnRfbVhH2u5RDuYIsLDBx9tGtGzgqB1unPQsIu7UYTeL4eqpDvkM6gWC2q+hfdX4bPu3smNT8+WwpolVgIF9neV9B3y5b7bjUrorkB0+kYCiO87Us363RuKvBwGDEJfVCZw3Zeud3zDvh7Cm5zrTzxVb8F7xFKzEdcZpmAEN5rxNvp/PgvsH3D7S747NeRdGky8DI5eQftvGWgxGcGMRl+GsLcMr5FdurYpT6dHR03IX+Q+cLqxKIT6pApbZVYEhmvnkNkoycffTPZbYTZ6KoplWCQbvVcpWDUVIvdE296/wtsDoyv4EyX/0PCTRsr8E7UpvZgBEfz2gSeY2K7YvIivqZMOkgT8EQuDOCkVm9SFdCE0V+CR6N5Ta57ZmncLXqavsIPp4elyowFFsDRDccZNEkLil+bF9E6aTL5MqhXK4KDFdQL0QqajbQXbFcoIWgERiSK1nLalaBEWLdDBg1f2UeVo4SMPIF0vw0T407dp6iqveFs+KWOts7YNyu2fjRpRthAm6P7avA4AG3HN2/8g2yomNi/0CNsqKqMcIXdeSDTL6KoXmYzUPwb6HfQigegf90re8LvTwPuggMJvMevMreFFqJ3gCGfZ/ICupLVODG6d5w9Qo4u5l0FPP8RQUU2Qc2lpaaJFJ++KyLnvx8PwGfF+AmUh3cSdxvw1soB9cMNUAVPSXJ/0cwXBuCNf3z+opAgV/l+9Ow6twwA/SP0b/Q9P8wev29rITBX8DZAKduHGz/pv2RdmmwswKu/5wx569y6ffGu4D+W8iv0n5R9g5x/mX8KzYbyf2aYtJurkVjEgjO/0MdaPodPhaFqCZ7ZQ5rxQMQMRFsJTxatn1nS/amWckAXxTQtWQHiWzb7+H6XpDqAukZYOMdLnoSGLWhX6ZcalPlbUFWX/SzOLfJiuoYK7kk1c05Ul1hWz+Zyudpnm4d/Q/GLpp3m6hg9QAAAABJRU5ErkJggg==>

[image40]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFIAAAAaCAYAAAAkJwuaAAAE2klEQVR4Xu2YzWsdVRjG5+IVREWrGIP5uGduEiULFUNANC4qKm2xfrR+dFPpQlCiEatQaIvVhXUhYhEtBduCECwoRl1YqyLaFoqtErRYcaF0UbrJQihC/oD6e+68JzmezFxmLgiK88DDzHnf95zznueer7lJUqNGjQhpml7W19d3ZWyvUQESET7jnNszOjp6fez/3wEhNsNf4UXjn/AnuNBqtc7zPASnCG34OsPDw2uwnYKfwC/gl8S+LnGDppOhoaEb8e2Cb+Cbbrfb/aG/LMJ24KNxP4Js8lnMLtWJY/5xDAwMXI4QH0pAEkq93WbdDhP1AdkQ41bKh0dGRlr41vL+HOYGz2eJ2eLrKh7bQUS/meedlL+yH2a9jykDa+cowtyibYTydsofjI2NXeVj9C6bfIpRrOr4nHuClpl+FYkT+4rAYAeoMy8x43qIdRu+s97Hcyu2t83XERK2lTg8gLlpOXyKf3ViM9lifoQnBgcHh8I+iqA4xdPnY95Gm6uwHYFPepvlcEQ+b1MdbMd63na0fDTQKoeABkynf/DcGfuwr4cX8c2m2fJ5Ex7SuxeS5zg8w/s7VGmmJj78LhiIZu1euMgg7wv7KIKJcVbtBWbfzpzG6IXVmIMY5T1B/d+xrwvtpdGLkBLDZUJqBoVoYt8HF3xCJLfFxNASe0R1LfaSxGafLbWDxLwV5qG8XPajrPW2biB2d46Qvp3ONsQWcxPvv8RCqo7VXTE5SqGqkGk2s2Z9Yt7e399/BbZtluSGZFmkPmzfSBDj9wi2Se34unlIl5fk6bIHgcbRRciOXbT3IiH/Zi+NqkLS2Q0uO4F/gx/DOYT5gecFns9L0LiO+sD3rstOeIkpvh8eADHIaQMxC3AmCW4ARVD+ysXE6CakthfN8t6FZFpfrUGF1ClJ5f000o59eeKmOfvj5OTkpVqW2M7A8TA+hA1iD3wPXoAb4xiBQ2oY3zG4TW3H/jwEN4muQmq/5X0xFqy0kOqIoBdcdm8KqY34pITI8W2O23HZ/rjiADCR9EtPh3aW5Ri2F+n/OovRYaNDSPfNvUk02zRL8c/S/lNJto+WRihYkb1IsCJ7aVRZ2hJAg3TR/mi+nRJSJ2dod9mp3TkwRAlpdgk6qzZ9rBcxDfZY4qZ0z/Mx3WA5FAk5r2ub8rb8c4Uk/62hvTSqCFl0f5QYEsALFtahPA13aO+UzwuZZoPe7eO0hCm/6qILuOpim/BlbU9iGONB7DqX3RiWbhM+N2PnW5+YOV8O4lYzrvNh3UqoIiQJ3ONy7o8aGPbDgZC6Br2mqwblcd73keQ18klI+ryd51H5VN9E1Il/TgeXJ+V5eIq4VHH26XdadtpwYQ7mvxbf52rL21x2sVc7S/sxbT+u9oM2GpS3081n3Q7ArigjJJ1sIpGf4aJb/r4+kS4vIV16Z8z/MvFPm9id5Un5Lspfu+wb/Rw8LptvX+1g04Vcbcdc+gKxpal29GPm3i3xTcCTcIY+HlR9+FJ4aNnhqG/9j/DdLxF5flt2C8lFGSFLoqHvaSVGe3ckKw8Kib3RZbMl9lUCA3+i1eVrx7aRu5VLl8/Lhg5CE3uq7O2gEBKQX/ohXpux71+KJoN/JW9p16gARLxXSzWxbaNGb9AfHA/3fCDUqFGjRo0a/wX8BU2tp4+XM83sAAAAAElFTkSuQmCC>

[image41]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIMAAAAZCAYAAAASYJ1DAAAHbElEQVR4Xu1Z/4tVVRC/jzXoe1FtS/vlnbvrmokV2ZJlEq7RF7EMRbcviIZiuJQZlmW2aX5po2xBV7HSMNpQrCQpUxTSRGpDMQ0SjaQwIvAHIQL/APt87pl5b95h375925d1635guPfMmXPumTlzZuadF0UpUqRIkSJFihRlYPjw4Zdls9knnHOrQM/X1tY2gp2xMnV1dQ/V19ePrqysvJR9jY2NlRjTAtmbrFwcxxdijqky18voH2b7BzOgfxV0epa6Qc/WmpqaWttP3WGTh9E/gu9gVUD/GvBmNDQ0ZK0s7UL7iJ2mivzAApt8IxazDQseiwVdiedM0K9UNso7RAV470DunCXIbIBTXK5z8R38rZBdRKeho6D9JdoPqsxgBXS9H7p8AF1GVldXX0Md0T4FekBlsOFXoP15YKezkF3a1NR0gcrRHrQL7UM7yVxbrS0HBFjEStBpKDuBbToE2rtAx6Dc9UauA7QXCz+E50Y40X1gV+Qm8jLzOJZzKA/y08DbP3To0Gut7GACTy2oC3qcQHS4WXgx2kdB+xAhriaPGytye0Hd0H0NqCkyUZbRBH1f0S7KMzafrbwBARb1ChZxFjSdbaYMvG8H/ciooXJov4pF35IfWQhVCM9OywdvFL5xMhZn+xeRkdBckO4scDKvqqqquiTkh6AzQI9NoNPQZSx5sE012oe56ero4gydTCeFM+Qhh+OnwJYZ8NaBtkkaHhgwfIlnJ6ccCxoBOhEurJQzMIpA5ljoDBwjyi+mUWkoGlROTAXH4X1SUKdkuFGUVeJYrifkmU+FGIJ550NmbtSDQ/C76OtCyK8L+3oCv8U1RTIXdLobdAbUgeYQ8vriDM5H4tAZOH8n+EfxjJluuK7Yp6br+G3ajG1ZQwLuHR1R7cE6LvJ1Ss52yst/qY+QqLCOqSAsDMFvx2KW47kbdBgyn9VLyCSonChZzBk65Z0h9A9JN9tAc/A+g+1YahBR/gX0fet81PoZNAb8xzgWdBr0Beez3wpBY0FuCejJyDhEuY4QgkUh5vwEtIsRQvmS/9/G3MtET67/PVs80g6uuDMkfNBcvH/nfM2xE7RJIspLlHE+nSSRj/Oj7yRl8fzUeefZIG3y36Jz2W/1ChjlYg6SDeoGjY8Cb0Lfap405eO9BXLHQbeyHXsvZlFZ1BnYpsGcL1j3iNcmAG8M6BfQikg2jpsp3z3AjcOzgWNB9TquFEKH+CuOwPU6n0KZHnZLGs05mei2BfNPFn4Ga16k61fdxR5FnUHaid0wdmmU34tkPudrvGYdK07BfVtFfdH3KN474t4jZ2lIuD8CWmfzKaNGZBzE5Mz1kQ/J9+D9bF+dgWTTEBcO3mYnoVL54gQHxFhrsz69lAXjEG/G/XSEEND/Lucj1kLzSyEjdso5CPpHqRwPHdb/odijT84AmmflXD6Nb4wkPRFZ/wuFzjMfz/V/1y8TLWa4sY+HnQrmI8gcdFJAhZuuCPnFnEFkaZDf8Lwj4Dc7fxreiIyhy4Hzm3IEcyyI+jmHhSm0C05pCNWfTkBnEB377QzG7gW/2iK/bytAv+Nb9xp+3yAhZS7J/g7mApwJ+bHP1Wdi4xxmUQf5jr7kp5aOUahSWOAzbPfBGXiKRlm+8ynkG+dPRJKWyoHcd2yRNPOcC2qIUpD7k4VZ/3MwN07We87JhuHZ5rwzNxsZ3dREX7QXs02+yogc5zqsNYgZV8wZtksUUmQwZgHH0PHKjgzmgwWLM0quZJsLckGkMGkiUVI3GTJdsclVeB+X9ZdY49gu5gxSOO5wwZ0EQ7rzRdJICbE7bUVdCuoImhokZZTlELHUQ04cnzyjBwu1mSJHuxVECidpAjKrI79hE0QmsYeMS+4xrO3iIs4Au9/mfG3VHpn1S5rgL77b8TyB9iLbXxLmAmSNehIN7XwFm7tgkQW02+iBj04G7xQXoTy8t4AOYZwTVlLwQHaHzm+M2B1U2ZyPRso5nKnak1s+l8+XSaGkcsVAR8D33w9rhHIdQjbmOJ4v6nfRrne+ttqvpxnvU/C9p6P8nNSfOTwX0Yx9F4qMzsWDNUV56gx0Iv2mFtTo+x50g4gyPYwHf49Zx2zn70TKu/nN+sLva+dD3JTY36D9QL4Ro0e3gj5G33TnfyvzTmEW+1RIFvu6yE2kI+C5z/5MNc7Ab26GbCc3TOZLqnCp2vnT7Bwpm8+3rYbHaLNM5w2Bb14EuSWhIxhUoH8OHHd02NEDqP8s6sLNBU2j8amD1U30fw38dyH/CJ5rqVdgS40WTHtPoW+S87ePbcFh01rrIzy3Ov8fBm3CyMg7GcoktZQTm9A+pkhNeM47cS4KlUQslxqysDuLnTqJJBO5iF5yEi+MGovNFaYJ/gZmWgjlzkdIKmumbtysqOfLnJz+tCltGwoQ/KUmmzkx/MOLUGdwPk1U8IBIeiwZyQYNQmcI+1N4BM7w3wNPCbx7GEMsie/FTs7/GYyWsS9a+ctkeb+vlM9nSGXP3Jcjm3NTeDhfl1k7tZV1pZwiRYoUKVKkSPEP4U9leZVV5h7a0gAAAABJRU5ErkJggg==>

[image42]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAZCAYAAACy0zfoAAACzUlEQVR4Xu2Wu2tUURDG96KC+CIq68I+7r370EVQiSwWmiIIYkS0CGoViCL4AIMPRIIYsEgjEkQRbIM2ggsWooVIYqEWFtoEIoqF2PgH+Afo78ueWc6uu24ios0dGM6Zb76ZM2fuOWc3lUokkf8k1Wp1bRiGp6IouoleyefzFeCgnSfBtxnOhLjEHAJa5vvjOF6J74jLNSF+ux89i+8Bellr+/4WKRQK2yDVWWiAoD7GUfSrEqS8Amu12gqwS3CfMfajMbxphuPGqVQq6/A/BB9Pp9NrKGw79qzbhCRgfhotyWBcT/xFFWw5WoTgSfQbhAOyVaAKQOdKpdIW46kIsFdgoWwS78P+Dn7HyzXmiu8zDN5RsJflcnlTLpfbiH3efC5mxF+nRSBf1yIiyVabmT9GP6qrwkiaV2HopMWpS+ok8TXZtim/WAnYTjiftHl1E/ucvoJzB+AnVLgf0xQRtaOUOzsEb0Xn0bqSOWxYG1AX9AmKxWLGfCbaPZy59uKw+8E/M16VzXw3es2tM0YD9vv8ruK6dpci3uq8GK6OoT90luRHTzJ/rkWsC14R3Ypr4t022FGy2ewqEtxTUYxv0L0p7xYqsYqLvG7qUGO/jxsXR5whcRZT3B+L+zzv1KFMJrNamBVHQaPGc+enjs64g/7LBXGxf684JFBhbqGFZ4L5lOvKkJG84rSwnpaORXTDe4p7u85IvRtkT0LzE8WNR7NXcXHU+Mwdi6OzF3y8p1igLeDhdsYWng5u1C7mX3RbjdP+Wc0m9n7sParMB8PGoz5o2KLE3i+Cb+vdEsYt3QD2FJ3nRu0QpsXgTINNYS4X1n4hHHZMl4q4yEH6RRiH88TyL0ncQX4dNd6eYe2c8YNwn+cuyix6Cx1BX8C54R8HzYWR4xH+gyqMccZ/lpYsrjMD6GGS7fEX9EW4/OL95s9BIF+vXIkkkkgi/0B+AvnO3Uk6jAd6AAAAAElFTkSuQmCC>

[image43]: <data:image/png;base64,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>

[image44]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAZCAYAAACy0zfoAAACYElEQVR4Xu2Vu2sUYRTFdzGChU9kDe5rZnZXFwOCcUHUJiCiEkwhaqWCNiIYYiBCEC0FJQgiNiJYaOMLEQQR8ZEqoAiCiBaSSoT8AfkD1t9J7rhfZmdMpkmaOXC4c89373xnv9m5k8tlyLDCqNVqVc/zjkV1w6pKpXKoWq3eMA75vr8mWiSNexyHE/BauVzeFl2HF1h7BMeazeY6d30BMLSd4nPwKcUzxDvRmlartZq16/AyDDB2mjgN3xeLxUpY12g01qM9Zn28UCisxdhO8o/kR60kz/V5WFNC3MR+o3E/cg4yxw0GgyDYQ/wSZw79ADd6QtwaauQnyWfhLdIeqxuGr7nHRqfuBNpkvV7fUiqVNpOPhGvWc0oeXK0LmOul8FOCOW3aNiNz4BEX9WPglDaWITO2oB+tH0O/0I/oNMkv6knYch79rPrdni4sYk4bvIVnQi2sF3VtT+B7tJ98F/o08YpyrvfBq3AHHNb/2K2Pxf/MxYG6vdT/gQ/0n3FMJJn7p6te++kk3dpEpDGnx8Ip3qb+J9wtjb7DXLej/XHmUiONOb191H6ldsDRDqLNRvuX1ZxOCr6B/a6eZCJJT4WlmDNjL2FgUo9GCi/DBvp8O81Yc9RdcvVUWMychi3r992hq7mFNqEpb2PiOf0PfWeocj2Asd+KoZYazmi4S5qPWXsBf7DR55Dk34j3cjaEdYrSqfesVV+EcYy90tejc8clQr/Imx+mM978oG1raBLfEftU43WGcBd9m1+CvcU30Z6xNihjxA/6jHV2XFnkMdPA2BDG9jtfgwwZMmRYbvwFfAq8Uy3vI+YAAAAASUVORK5CYII=>

[image45]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAADc0lEQVR4Xu2W7WuNYRzHz9qUZ6Lj5Oyc3fe2wygkI08vLMTkhRReeHozyRDR3izymJqa1kgyRSSJIstSK09JpsXerSbKOy+89A/4fHeue65z7T5n55AzZd/6dt/39f1dv+v3+11PdyQyhn8Q0Wh0su/74932YuGPxk8kEgsrKiraUqnUVFcrFuLxeNLzvA49XS0nkslknMwfwHmuVmyQwEp4s5BCltDhHGxyhVGC4rkAD7tCKDCcD1/p6WqjBVbEMuJ5WVlZ6bnaMChTls7t3948fwHEMp24utiT21wtAwpawWN41NUClJeXJ6jIBj31zWafgf16qhNzbXOhtrZ2HEGtYrzFfJZaUokCdtpU2FZ4RbrdngEFgVEPDja6Gigh0P2wBe7A7gU8CS/DQ/ANycxxO4VBG1LBME6j8bMr0PC9mu9+LRu7j1YGfFRTUzPFbs+AqoFRH88VIVodPBYxFeC9HdveqqqquZo13j+bao4Igtyr5UCf2fCdZx0Y+GiWX52Edh8VlfaenDOtAHD8PiwQOu+jwim9cy5PxO4+bR18lmG/nPdNEWfas6AU2+NmtrfCL0G1fbOEDTP2oEngI0/fbs9ArgRsyImcefkebeEoo/9VXHUGZ3zgN2wPmgQGSHaBqw2hgATqcfbVD1lq+cIzywcfzUGbDgPavtG2xrYVTAIjLiFV4IMcOZIuk53IF/V/wvt5Da4gJFLBKNpZltiEoAN7Y5r4y0UmVCQvvW+GDgwloxlQHJbpIMyeeVtdXT3L1YbA0TgTo+faZHa7Oqkzfrt10vD+DD5UMpF0cgc1QGBvbPpgb7bLR0sBfSBIQP87+Hjth6x/Qcsqm2ZDR2WbKmw36symYzvaLbS7sAF2wQ54g/Yjsgnszb9UN9p3u8I2ZE+/Fmxewkte+vb/4YXvK+0XjRWmZcJLnwxP/fRlYqPULJWgAu73MBDg7pDlOAidZEpCy0x+GHOzZ51INjSLSjRMGwbdrBg/hmtdrUCUEfypsCVE2yL898NWfZt9dU8zHFYQ2rfDa/Ys5wRO6uH1MGf5ggHXEdSJSMjVr1mBn/RLojHgGc26e3kJpqB34BJXy4XBjSnq3RXzgC63Ldn+4WOx2CQSOA2fYNfJOA1ZiqU4mtAO6N0Vc8Js3EaqstTVigXGryPJPZFCgx/DGP5D/AQ8AtOFN7FMyAAAAABJRU5ErkJggg==>

[image46]: <data:image/png;base64,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>