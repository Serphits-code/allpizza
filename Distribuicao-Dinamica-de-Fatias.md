# Funcionalidade: Distribuição Dinâmica de Fatias

## Objetivo

Adicionar uma etapa de distribuição de fatias após a seleção de sabores,
sincronizando em tempo real a visualização da pizza.

## Regras por tamanho

  Tamanho     Fatias
  --------- --------
  P                4
  M                6
  G                8
  GG              10

A soma das fatias dos sabores deve ser exatamente igual ao total de
fatias da pizza.

## Fluxo

1.  Escolher quantidade de sabores (1, 2 ou 3).
2.  Selecionar os sabores.
3.  Exibir a seção **Distribuição das Fatias**.
4.  Ajustar a quantidade de fatias de cada sabor usando um **Step
    Slider**.
5.  Atualizar automaticamente:
    -   Pizza em SVG;
    -   Contador de fatias;
    -   Quantidade por sabor;
    -   Subtotal (quando aplicável).
6.  Habilitar **Adicionar ao Carrinho** apenas quando a distribuição
    estiver completa.

## Interface

Cada sabor deve possuir:

-   Nome;
-   Botões **-** e **+**;
-   Step Slider (uma posição por fatia);
-   Quantidade atual de fatias.

### Exemplo

``` text
Calabresa

[-] ○──○──●──○──○──○──○──○ [+]

🍕 4 fatias
```

## Contador Geral

``` text
Distribuição

7 / 8 fatias
```

Quando completo:

``` text
8 / 8 fatias
✅ Distribuição completa
```

## Visualização Dinâmica

A pizza deve ser desenhada em **SVG**, onde cada fatia representa uma
unidade.

Conforme os sliders forem alterados:

-   os setores aumentam ou diminuem;
-   a pizza é redesenhada automaticamente;
-   utilizar animações suaves (\~300 ms) com Framer Motion.

## Tecnologias

-   Next.js 14 (App Router)
-   React
-   TypeScript
-   TailwindCSS
-   Zustand
-   Framer Motion
-   SVG (não utilizar Canvas)

## Componentes

``` text
PizzaPreview.tsx
PizzaSvg.tsx
PizzaSlice.tsx
FlavorDistribution.tsx
StepSlider.tsx
PizzaStore.ts
```

## Objetivo Final

Criar uma experiência premium, moderna e intuitiva, onde qualquer
alteração na distribuição das fatias seja refletida instantaneamente na
visualização da pizza.
