# AllDelivery — Relatório da área do entregador

**Autor:** Manus AI  
**Escopo:** análise da área operacional do entregador, com foco na gestão da fila de entregas e da **bag**, atualização de status, GPS, mapa, modo rota e otimização de percurso.  
**Versão analisada:** branch `main`, commit `2b8cb1e`, publicado em 27/08/2026 [1].

## 1. Resumo executivo

A área do entregador está disponível na rota `/entregador`. Ela funciona como um painel operacional mobile-first no qual o entregador acompanha os pedidos liberados pelo restaurante, escolhe quais deseja assumir, monta sua própria bag, calcula uma rota otimizada, navega até os endereços e marca cada pedido como entregue [2].

A implementação separa claramente duas situações: **pedidos disponíveis**, que estão em `em_rota` e ainda não possuem entregador, e **pedidos na minha bag**, que estão em `em_rota` e possuem `driverId` igual ao usuário autenticado. A mesma tela exibe os dois grupos, mas apenas os pedidos da bag podem ser roteirizados e concluídos pelo entregador [3].

> **Conceito central:** a bag não é uma tabela independente. Ela é representada pelo conjunto de pedidos cujo `driverId` aponta para o entregador atual. Remover um pedido da bag significa definir `driverId = null`; colocar um pedido na bag significa atribuir o ID do entregador logado.

A solução tem quatro partes integradas:

| Parte | Responsabilidade |
|---|---|
| Fila e bag | Exibir pedidos `em_rota`, permitir assumir ou devolver pedidos e ordenar a bag. |
| Mapa operacional | Mostrar posição do entregador, paradas, rota e base. |
| Roteirização | Enviar a bag para VROOM, usar fallback Haversine quando necessário e solicitar geometria de ruas ao OSRM. |
| Sincronização | Atualizar pedidos a cada cinco segundos e enviar GPS ao servidor quando houver deslocamento relevante ou heartbeat. |

## 2. Estrutura da área do entregador

A composição visual é dividida entre um layout específico e a página operacional. `src/app/entregador/layout.tsx` fornece cabeçalho fixo com identificação “Painel do Entregador”, nome da sessão, botão de sair, conteúdo centralizado e rodapé [4]. A página `src/app/entregador/page.tsx` concentra o estado da bag, a coleta do GPS, os controles da rota, o mapa e a lista de pedidos [2].

O mapa é carregado dinamicamente para evitar renderização no servidor e é implementado por `src/components/entregador/DeliveryMap.tsx` [5]. Essa separação é importante para a replicação: a tela de negócio pode ser renderizada mesmo quando o mapa ainda está inicializando no navegador.

A autorização é baseada no papel da sessão. A rota visual `/entregador` e as APIs `/api/entregador/*` são permitidas para `entregador` e `admin`; usuários sem esses papéis são redirecionados ou recebem `403`, conforme o tipo da requisição [6].

## 3. Modelo operacional da bag

### 3.1. Estados que formam a fila

O pedido precisa estar em `status = 'em_rota'` para aparecer na área do entregador. Dentro desse status, o campo `driverId` define a posse operacional:

| Situação | Condição de banco | Aparência na tela | Ações permitidas |
|---|---|---|---|
| Disponível | `status = em_rota` e `driverId = null` | Selo “Disponível” | Colocar na bag. |
| Na minha bag | `status = em_rota` e `driverId = session.user.id` | Selo “Minha bag” e posição na sequência | Remover da bag, otimizar, abrir rota e marcar entregue. |
| Na bag de outro entregador | `status = em_rota` e `driverId` de outro usuário | Não é retornado para o entregador atual | Nenhuma ação. |
| Finalizado | `status = entregue` | Sai da lista operacional | Nenhuma ação de bag. |

O endpoint `GET /api/entregador/orders` filtra pedidos `em_rota` cujo `driverId` seja nulo ou pertença ao entregador autenticado. Ele inclui dados do cliente, endereço, telefone, coordenadas, pagamento, itens, adicionais e zona de entrega, ordenando inicialmente pela data de criação [7].

### 3.2. Como o entregador coloca um pedido na bag

Na lista, cada pedido disponível possui o botão **“Colocar na bag”**. Ao clicar, a página envia `PATCH /api/entregador/orders/:id` com o corpo `{ "action": "claim" }` [2] [8].

O backend executa um `updateMany` condicionado simultaneamente ao ID do pedido, ao status `em_rota` e à condição `driverId = null` ou `driverId = session.user.id`. Se a atualização afetar zero registros, o servidor retorna `409 Conflict` com a mensagem de que o pedido já está na bag de outro entregador [8].

Essa atualização condicional é a proteção contra concorrência: dois entregadores podem tentar assumir o mesmo pedido quase ao mesmo tempo, mas somente o primeiro que satisfizer a condição consegue atribuí-lo à própria bag.

Depois de assumir o pedido, a rota ativa persistida do entregador é apagada. A tela atualiza a lista e, como a composição dos IDs da bag mudou, o efeito de sincronização pode disparar novo cálculo de rota [2] [8].

### 3.3. Como remover um pedido da bag

O pedido na bag mostra o botão **“Remover da bag”**. A página envia `{ "action": "release" }` para o mesmo endpoint. O backend só permite liberar se o pedido estiver em `em_rota` e tiver `driverId` igual ao entregador atual; caso contrário, retorna `409 Conflict` [8].

A liberação redefine `driverId` para `null`, remove a rota ativa persistida do entregador e faz o pedido voltar para a fila pública de pedidos disponíveis. O status permanece `em_rota` [8].

## 4. Fluxo completo da tela

A experiência da tela pode ser resumida desta forma:

```text
Administrador despacha pedido
        |
        v
Pedido em_rota + driverId nulo
        |
        |  entregador clica em "Colocar na bag"
        v
Pedido em_rota + driverId do entregador
        |
        |  rota recalculada automaticamente ou manualmente
        v
Bag ordenada por paradas
        |
        |  entregador entra no modo rota / navega
        v
Chega ao endereço e confirma entrega
        |
        v
Pedido entregue + deliveredAt preenchido
        |
        v
Pedido sai da bag e rota ativa é limpa
```

A página lista primeiro os pedidos da bag, respeitando a ordem otimizada, e depois os pedidos disponíveis. Um pedido da bag recebe um número de sequência; um pedido disponível recebe o símbolo `+`. O cabeçalho da tela mostra quantos pedidos estão na bag e quantos estão disponíveis em rota [2].

Cada cartão pode ser expandido para revelar telefone com link para WhatsApp, endereço completo, referência, observações, itens, adicionais, subtotal, taxa de entrega, total, forma de pagamento e instruções de troco. Pedidos na bag também exibem o botão **“Marcar como Entregue”** [2].

## 5. Conclusão da entrega

Existem dois caminhos de conclusão:

| Caminho | Regra de interface |
|---|---|
| Lista expandida | O botão “Marcar como Entregue” aparece para qualquer pedido que esteja na bag. |
| Modo rota | O botão “Concluir e ir para próxima entrega” aparece quando o GPS está a até 80 metros da próxima parada. |

Em ambos os casos, a página envia `PATCH /api/entregador/orders/:id` com `{ "status": "entregue" }` [2] [8]. O backend verifica que o pedido pertence à bag do entregador. Se não pertencer, retorna `403` com a mensagem para colocar o pedido na bag antes de entregar [8].

A transição usa `getOrderStatusUpdateData`, que grava `deliveredAt` quando o status muda para `entregue`. Em seguida, a API limpa a rota ativa do entregador e envia notificação de status ao cliente [8] [9]. A página remove o pedido da memória local e, se a bag ficar vazia, sai do modo rota [2].

O entregador não possui na própria API uma transição geral para `novo`, `em_preparo` ou `pronto_retirada`. O endpoint específico do entregador aceita apenas `entregue` ou `em_rota`; o pedido deve chegar à área já despachado pelo painel administrativo [8].

## 6. Atualização de pedidos

A página chama `GET /api/entregador/orders` no carregamento e repete a consulta a cada cinco segundos [2]. Esse polling mantém a fila atualizada sem exigir que o entregador recarregue a página.

A lista retornada pelo backend contém somente pedidos em rota disponíveis ou pertencentes ao entregador atual. Por isso, quando outro entregador assume um pedido disponível, ele deixa de aparecer na próxima atualização do primeiro entregador.

| Evento | Efeito no frontend | Efeito no backend |
|---|---|---|
| Pedido disponibilizado pelo admin | Aparece como disponível no próximo polling | Deve estar em `em_rota`, sem `driverId`. |
| Outro entregador assume | Desaparece do primeiro entregador | `driverId` passa para outro usuário. |
| Pedido assumido pelo usuário atual | Passa para minha bag | `driverId` recebe o ID atual e rota anterior é apagada. |
| Pedido devolvido | Volta à fila disponível | `driverId` vira `null` e rota é apagada. |
| Pedido entregue | Sai da lista após a confirmação | Status vira `entregue`, `deliveredAt` é gravado e rota é limpa. |

## 7. GPS e localização do entregador

### 7.1. Captura no navegador

A página usa `navigator.geolocation.watchPosition` com alta precisão, `maximumAge` de cinco segundos e timeout de 15 segundos. Há também uma leitura de fallback a cada dez segundos para reduzir o efeito de throttling de abas em segundo plano, além de uma nova leitura quando a aba volta a ficar visível [2].

O sistema calcula direção a partir do movimento entre pontos GPS e usa a bússola do dispositivo quando o entregador está parado. A direção é suavizada antes de ser exibida no mapa, evitando rotação brusca da seta [2].

### 7.2. Quando o GPS é enviado ao servidor

O navegador atualiza a posição visual localmente em todas as leituras, mas só envia `POST /api/entregador/location` quando o ponto mudou de forma relevante ou quando passou o intervalo de heartbeat. A regra implementada é aproximadamente:

| Condição | Ação |
|---|---|
| Deslocamento relevante | Envia posição quando o entregador percorreu pelo menos quatro metros desde o último ponto transmitido. |
| Heartbeat | Envia novamente a cada 30 segundos mesmo sem deslocamento suficiente. |
| Retorno à aba | Busca posição atual e envia de forma forçada. |
| GPS indisponível | Exibe alerta para ativar localização e mantém o estado sem posição. |

O endpoint recebe `{ lat, lng }`, valida que ambos são números e grava `driverLat`, `driverLng` e `driverUpdatedAt` no usuário autenticado. Ele também atualiza os settings globais `driver_lat`, `driver_lng` e `driver_updated_at` em uma transação [10].

Na replicação, a posição individual no registro do entregador deve ser a fonte principal do mapa administrativo e da tela operacional. Os settings globais podem ser mantidos apenas se houver compatibilidade com outras telas legadas.

## 8. Mapa do entregador

O mapa é implementado com Leaflet e tiles de satélite. Ele recebe a posição atual do entregador, as paradas da bag, a rota, o depósito, o passo ativo e o estado de seleção [5].

| Elemento visual | Comportamento |
|---|---|
| Marcador do entregador | Mostra a posição atual e pode indicar direção. |
| Marcadores de pedidos | Numerados conforme a ordem da bag; o pedido selecionado fica destacado. |
| Marcador da base | Exibe o estabelecimento/depot quando configurado. |
| Rota real | Linha contínua baseada na geometria OSRM. |
| Fallback de rota | Linha tracejada entre waypoints quando a geometria real não está disponível. |
| Trecho ativo | No modo rota, aparece em laranja até a próxima parada. |
| Trecho restante | No modo rota, aparece em azul para as paradas restantes. |

Fora do modo rota, a tela permite girar o mapa manualmente em incrementos de 15 graus e voltar para o norte. Dentro do modo rota, o componente pode acompanhar automaticamente o entregador, centralizando o mapa em zoom mínimo 17 e aplicando a direção da movimentação [5].

Ao arrastar, ampliar ou girar o mapa durante o modo rota, o auto-follow é desligado para permitir inspeção manual. Ele pode ser reativado pelo controle de bússola [5].

## 9. Modo rota

O botão **“Modo rota”** é habilitado quando há pedidos na bag e localização GPS disponível. Para entrar, a tela exige pelo menos um pedido da bag com coordenadas e uma rota existente ou calcula uma nova antes de abrir o modo de navegação [2].

Ao entrar no modo rota, a página tenta solicitar permissão para orientação do dispositivo, ativa tela cheia e solicita `Wake Lock` para manter a tela ligada. O modo também apresenta uma barra superior com a próxima entrega e uma barra inferior com duração, distância, número do pedido, saída do modo e controle de auto-follow [2].

A próxima parada é o primeiro pedido roteável da bag final. O indicador de progresso usa o formato `posição/total`, por exemplo `1/4`. Se o entregador estiver a até 80 metros da parada, aparece o botão para concluir e avançar para a próxima entrega [2].

O modo rota ainda oferece o botão **“Abrir navegação externa”**, que abre o Google Maps com o destino da próxima entrega e modo de deslocamento `driving` [2]. Isso é uma integração complementar; o mapa interno continua funcionando mesmo sem abrir o aplicativo externo.

## 10. Otimização da rota

### 10.1. Pré-condições

A função de otimização exige posição do entregador, pelo menos um pedido na bag e pelo menos um pedido da bag com latitude e longitude. A página envia para o backend a posição atual e uma lista `{ id, lat, lng }` dos pedidos roteáveis [2].

O backend repete a validação no servidor: cada ID enviado precisa estar em `status = em_rota` e com `driverId` igual ao usuário da sessão. Se algum ID não pertencer à bag, a API retorna `403` [11]. Essa validação impede que o cliente tente otimizar pedidos de outro entregador ou pedidos que já não estão disponíveis.

### 10.2. VROOM

Quando disponível, o serviço VROOM recebe jobs com coordenadas em `[longitude, latitude]` e um único veículo com perfil `bike`. O ponto de partida é o GPS atual do entregador. Se a base estiver configurada, ela é enviada como ponto final de retorno [11].

A resposta do VROOM é convertida para uma sequência de passos no formato Leaflet `[latitude, longitude]`. Cada passo contém o ID do pedido, a localização, a distância acumulada e o horário estimado de chegada retornado pelo motor [11].

### 10.3. Fallback Haversine

Se VROOM estiver indisponível, exceder o timeout de cinco segundos ou retornar erro, o backend usa `fallbackSort`. Esse algoritmo ordena os pedidos pela distância em linha reta a partir da posição atual do entregador, usando a fórmula de Haversine. Depois calcula a distância acumulada entre as paradas e, quando existe base, inclui o retorno ao estabelecimento [11].

O fallback garante uma ordem operacional mesmo sem o motor de otimização, mas não representa necessariamente o melhor trajeto de rua. Por isso, a interface identifica o serviço usado como `fallback` e avisa quando não há geometria real disponível.

### 10.4. Geometria de ruas com OSRM

Depois de obter a ordem, o backend solicita uma geometria de rota ao OSRM. Ele tenta primeiro um endpoint orientado a bicicleta e, depois, um endpoint OSRM público geral. A resposta GeoJSON em `[longitude, latitude]` é convertida para `[latitude, longitude]` antes de ser enviada ao Leaflet [11].

Se ambos os endpoints falharem, `routeGeometry` fica nulo. O mapa então desenha linhas tracejadas entre o entregador, as paradas e a base, permitindo continuar a operação com uma indicação visual simplificada [5] [11].

## 11. Retorno à base

O retorno à base é opcional e depende de `vroom_depot_lat` e `vroom_depot_lng` configurados no modelo `Setting` [11]. Quando configurado, o resumo da rota contém distância e duração de retorno. A tela exibe três cartões:

| Cartão | Informação |
|---|---|
| Ciclo total | Distância e duração estimada de toda a rota. |
| Volta para a base | Distância e duração entre a última entrega e o estabelecimento. |
| Disponível novamente | Horário estimado de retorno, quando o motor fornece chegada. |

Sem base configurada, esses cartões não aparecem. Ao portar a funcionalidade, o depósito deve ser uma configuração por loja ou filial, não um valor fixo no código.

## 12. Persistência da rota ativa

A rota calculada é persistida em `DriverActiveRoute`, que mantém uma relação única com o entregador e armazena `orderedIds`, `steps`, `routeGeometry`, `depotLocation` e `summary` em JSON [12].

A rota é apagada quando o entregador assume um novo pedido, libera um pedido ou conclui uma entrega. Essa estratégia evita que a sequência antiga continue sendo usada depois que a composição da bag foi alterada [8] [12].

Na implementação atual, a página refaz o cálculo em memória quando os IDs da bag mudam. A persistência é especialmente útil para o painel administrativo e para recuperação de uma sessão, mas o novo sistema deve decidir se a rota será recalculada automaticamente, recuperada do banco ou ambas.

## 13. Contratos de API

| Método | Endpoint | Corpo ou filtro | Resultado |
|---|---|---|---|
| `GET` | `/api/entregador/orders` | Sessão autenticada | Lista pedidos `em_rota` sem entregador ou atribuídos ao entregador atual. |
| `PATCH` | `/api/entregador/orders/:id` | `{ action: 'claim' }` | Assume pedido disponível; retorna `409` em conflito. |
| `PATCH` | `/api/entregador/orders/:id` | `{ action: 'release' }` | Retira pedido da bag; retorna `409` se não pertencer ao entregador. |
| `PATCH` | `/api/entregador/orders/:id` | `{ status: 'entregue' }` | Finaliza pedido se ele estiver na bag; limpa rota e notifica cliente. |
| `PATCH` | `/api/entregador/orders/:id` | `{ status: 'em_rota' }` | Permite manter/recolocar status em rota conforme a regra geral do endpoint. |
| `POST` | `/api/entregador/location` | `{ lat, lng }` | Grava GPS e timestamp do entregador. |
| `POST` | `/api/entregador/optimize` | `{ driverLat, driverLng, deliveries }` | Calcula, persiste e retorna a rota ordenada. |

## 14. Dados mínimos para replicar a funcionalidade

| Domínio | Dados obrigatórios |
|---|---|
| Usuário | ID, nome, papel e sessão autenticada. |
| Pedido | ID, número, status, `driverId`, cliente, telefone, endereço, coordenadas, pagamento, totais e timestamps. |
| Itens | Produto, quantidade, adicionais e observações. |
| Mapa | Latitude/longitude do entregador e dos pedidos. |
| Configuração | Coordenadas da base/depot e URL do motor de rota. |
| Rota | Ordem dos pedidos, passos, geometria, resumo e timestamp de atualização. |
| Notificação | Canal para avisar o cliente quando o pedido for entregue. |

O schema atual já contempla esses dados em `User`, `Order`, `OrderItem`, `DeliveryZone`, `DriverActiveRoute` e `Setting` [12].

## 15. Requisitos de replicação por prioridade

### Prioridade 1 — Bag funcional

Implemente os pedidos em `em_rota`, atribuição por `driverId`, listagem filtrada por sessão, ações `claim` e `release`, proteção de concorrência e conclusão como `entregue`. Sem isso, o restante do mapa não possui uma fonte confiável de paradas.

### Prioridade 2 — GPS e mapa básico

Adicione captura de GPS, persistência da posição, marcadores do entregador e dos pedidos, endereço completo e atualização periódica. Nesta etapa, a rota pode ser uma linha simples entre pontos conhecidos.

### Prioridade 3 — Roteirização

Adicione VROOM ou outro motor de otimização, base de retorno, OSRM ou serviço equivalente e persistência da rota ativa. Mantenha fallback para que a operação não pare quando o serviço externo estiver indisponível.

### Prioridade 4 — Modo rota mobile

Adicione tela cheia, auto-follow, orientação, wake lock, próxima parada, progresso, distância, conclusão por proximidade e navegação externa. Esses recursos melhoram a operação na rua, mas não são pré-requisitos para a bag funcionar.

## 16. Pontos de atenção técnicos

**Concorrência na coleta.** A atualização condicional do `claim` deve ser mantida. Nunca faça uma leitura separada seguida de um update sem condição, pois dois entregadores poderiam assumir o mesmo pedido.

**Autorização no backend.** O middleware protege as rotas, mas os handlers também devem validar a sessão e o entregador atual. As APIs existentes já fazem isso na maior parte do fluxo da bag e da otimização [6] [8] [11].

**Pedido sem coordenadas.** O pedido pode aparecer na lista da bag sem latitude/longitude, mas não participa da otimização nem do modo rota. A interface informa essa limitação. No sistema novo, convém destacar esses pedidos para o entregador e oferecer correção de endereço.

**Status e atribuição.** O pedido só deve ser concluído pelo entregador que o possui na bag. Ao marcar como entregue ou cancelar, o vínculo com o motorista precisa ser limpo conforme a política do sistema.

**Rota obsoleta.** Qualquer alteração nos IDs da bag deve invalidar a rota antiga. Caso contrário, o entregador pode navegar para uma sequência que não corresponde mais aos pedidos reais.

**Fuso e timestamps.** `sentAt` é gravado quando o pedido entra em `em_rota`, e `deliveredAt` quando é entregue [9]. Padronize timezone e relógio do servidor para que métricas, rastreamento e estimativas não apresentem horários inconsistentes.

**Serviços externos.** VROOM e OSRM podem falhar, sofrer limites ou variar em disponibilidade. O fallback geométrico deve ser tratado como contingência operacional, não como substituto equivalente ao roteamento de ruas.

**Fallback geográfico.** O componente mantém coordenadas padrão de Recife na inicialização do mapa [5]. Esse fallback deve ser trocado pelas coordenadas da operação no novo sistema.

**Escala do polling.** A consulta da lista a cada cinco segundos é simples e previsível, mas gera tráfego proporcional ao número de entregadores conectados. Em escala maior, considere SSE, WebSocket ou polling adaptativo sem remover a atualização de segurança.

## 17. Critérios de aceite

| Cenário | Resultado esperado |
|---|---|
| Entregador abre a tela | Vê somente pedidos `em_rota` disponíveis ou pertencentes à própria bag. |
| Dois entregadores assumem o mesmo pedido | Um consegue; o outro recebe `409` e o pedido não é duplicado. |
| Entregador libera pedido | O pedido retorna para a fila sem perder o status `em_rota`. |
| Bag muda | A rota ativa anterior é invalidada e uma nova rota pode ser calculada. |
| Bag possui pedido sem coordenadas | Pedido aparece, mas não entra na rota; a interface informa a limitação. |
| VROOM está disponível | A bag recebe ordem otimizada, passos e, se possível, geometria OSRM. |
| VROOM falha | A tela recebe ordem por Haversine e continua com rota simplificada. |
| Entregador entra no modo rota | Tela cheia, próxima parada, auto-follow e rota são exibidos quando há GPS e paradas válidas. |
| Entregador chega a 80 m da parada | O modo rota oferece conclusão e avanço para a próxima entrega. |
| Entregador conclui pedido | Pedido vira `entregue`, timestamp é salvo, rota é limpa e cliente pode ser notificado. |
| GPS fica sem atualização | O sistema não deve apresentar a posição como atual indefinidamente; deve sinalizar ausência ou defasagem. |

## 18. Conclusão

A funcionalidade da bag é uma combinação de **fila compartilhada**, **posse temporária por entregador**, **roteirização baseada nos pedidos assumidos** e **confirmação protegida da entrega**. O desenho é adequado para uma operação em que o administrador despacha pedidos para `em_rota` e os entregadores escolhem quais fretes transportar.

Para transportar essa experiência para outro sistema, a ordem recomendada é: primeiro replicar a atribuição segura de pedidos, depois o GPS e o mapa, em seguida a otimização e, por fim, o modo rota avançado. A parte mais importante de negócio não é o mapa, mas a consistência entre `status`, `driverId`, bag e rota ativa.

## Referências

[1]: https://github.com/Serphits-code/alldelivery/commit/2b8cb1e64760b902c2362a759278b6ac6c2f7625 "Commit analisado do AllDelivery"

[2]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/entregador/page.tsx "Página operacional do entregador"

[3]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/orders/route.ts "API de listagem da bag e da fila"

[4]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/entregador/layout.tsx "Layout da área do entregador"

[5]: https://github.com/Serphits-code/alldelivery/blob/main/src/components/entregador/DeliveryMap.tsx "Mapa interativo do entregador"

[6]: https://github.com/Serphits-code/alldelivery/blob/main/src/middleware.ts "Autorização de rotas por papel"

[7]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/orders/route.ts "Listagem de pedidos em rota"

[8]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/orders/%5Bid%5D/route.ts "Ações sobre pedido do entregador"

[9]: https://github.com/Serphits-code/alldelivery/blob/main/src/lib/order-status.ts "Efeitos das transições de status"

[10]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/location/route.ts "API de localização do entregador"

[11]: https://github.com/Serphits-code/alldelivery/blob/main/src/app/api/entregador/optimize/route.ts "API de otimização de rota"

[12]: https://github.com/Serphits-code/alldelivery/blob/main/prisma/schema.prisma "Modelo de dados Prisma"

[13]: https://github.com/Serphits-code/alldelivery/blob/main/delivery.md "Documentação técnica de entregadores e roteirização"
