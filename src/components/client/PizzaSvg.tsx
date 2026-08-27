"use client";

import React, { useState, useEffect, useMemo } from "react";
import { animate } from "framer-motion";
import { getOptimizedImageUrl } from "@/lib/imageHelper";

interface PizzaFlavor {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: {
    name: string;
  };
}

interface PizzaSvgProps {
  size: string;
  flavorCount: number;
  selectedFlavors: (PizzaFlavor | null)[];
  slicesDistribution: number[];
  onSectorClick: (idx: number) => void;
  activeSectorIndex?: number | null;
  isFullPizzaSelected?: boolean;
  toppingsCountBySector?: { [sectorIdx: number]: number };
}

export default function PizzaSvg({
  size,
  flavorCount,
  selectedFlavors,
  slicesDistribution,
  onSectorClick,
  activeSectorIndex,
  isFullPizzaSelected,
  toppingsCountBySector,
}: PizzaSvgProps) {
  const safeInputSlices = useMemo(() => {
    return slicesDistribution && slicesDistribution.length > 0 ? slicesDistribution : [8];
  }, [slicesDistribution]);

  const [animatedSlices, setAnimatedSlices] = useState<number[]>(safeInputSlices);

  // Sincroniza e anima fatias
  useEffect(() => {
    if (!animatedSlices || animatedSlices.length !== safeInputSlices.length) {
      setAnimatedSlices(safeInputSlices);
      return;
    }

    const startValues = [...animatedSlices];
    const endValues = [...safeInputSlices];

    const controls = animate(0, 1, {
      duration: 0.3,
      onUpdate: (progress) => {
        const next = startValues.map((start, idx) => {
          const end = endValues[idx] ?? start;
          return start + (end - start) * progress;
        });
        setAnimatedSlices(next);
      },
    });

    return () => controls.stop();
  }, [safeInputSlices]);

  const safeSlices = animatedSlices && animatedSlices.length > 0 ? animatedSlices : safeInputSlices;

  const totalSlices = useMemo(() => {
    return safeSlices.reduce((a, b) => a + b, 0) || 1;
  }, [safeSlices]);

  const radius = 45; // raio útil
  const cx = 50;
  const cy = 50;

  // Calcula os caminhos SVG de cada setor
  const sectors = useMemo(() => {
    let currentAngle = 0;

    return safeSlices.map((slices, idx) => {
      const angle = (slices / totalSlices) * 360;
      const isFullCircle = angle >= 359.9;

      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      if (isFullCircle) {
        return {
          idx,
          isFullCircle: true,
          pathData: "",
          centroid: { top: "50%", left: "50%" },
          dividerLine: null,
        };
      }

      // Convert angles to radians and adjust by -90deg so 0 starts at 12 o'clock
      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;

      // Pontos do arco
      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;
      const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      // Centroide para posicionamento do botão
      const middleAngle = startAngle + angle / 2;
      const middleRad = ((middleAngle - 90) * Math.PI) / 180;
      const labelDist = radius * 0.55; // 55% do raio
      const labelX = cx + labelDist * Math.cos(middleRad);
      const labelY = cy + labelDist * Math.sin(middleRad);

      // Linha divisória
      const divX = cx + (radius + 2) * Math.cos(startRad);
      const divY = cy + (radius + 2) * Math.sin(startRad);

      return {
        idx,
        isFullCircle: false,
        pathData,
        centroid: { top: `${labelY}%`, left: `${labelX}%` },
        dividerLine: { x2: divX, y2: divY },
      };
    });
  }, [safeSlices, totalSlices]);

  return (
    <div className={`relative w-64 h-64 xs:w-72 xs:h-72 sm:w-80 sm:h-80 md:w-88 md:h-88 rounded-full bg-brand-bg shadow-2xl flex items-center justify-center transition-all ${
      isFullPizzaSelected ? "ring-4 ring-emerald-500/70 shadow-emerald-500/20" : ""
    }`}>
      {/* SVG da Pizza */}
      <svg
        className="w-full h-full filter drop-shadow-xl"
        viewBox="0 0 100 100"
      >
        <defs>
          {/* Sombra */}
          <filter id="pizza-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
          </filter>

          {/* Gradiente da borda (crust) */}
          <radialGradient id="crust-grad" cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor="#dca153" />
            <stop offset="93%" stopColor="#b4782b" />
            <stop offset="97%" stopColor="#875113" />
            <stop offset="100%" stopColor="#552c00" />
          </radialGradient>

          {/* Gradiente do queijo/molho base */}
          <radialGradient id="cheese-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3d1" />
            <stop offset="70%" stopColor="#ffd875" />
            <stop offset="100%" stopColor="#e2a63b" />
          </radialGradient>

          {/* Clip Paths para cada fatia */}
          {sectors.map((sector) => (
            <clipPath key={sector.idx} id={`clip-sector-${sector.idx}`}>
              {sector.isFullCircle ? (
                <circle cx={cx} cy={cy} r={radius} />
              ) : (
                <path d={sector.pathData} />
              )}
            </clipPath>
          ))}
        </defs>

        {/* 1. Sombra e Borda Externa (Crust) */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 3}
          fill="url(#crust-grad)"
          filter="url(#pizza-shadow)"
        />

        {/* 2. Queijo Base (Molho + Mussarela de fundo) */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="url(#cheese-grad)"
        />

        {/* 3. Sabores (Setores da Pizza) */}
        {sectors.map((sector) => {
          const flavor = selectedFlavors[sector.idx];

          return (
            <g key={sector.idx} className="group">
              {flavor ? (
                /* Setor preenchido com sabor */
                <g>
                  {/* Fundo do sabor (efeito avermelhado/recheio) */}
                  {sector.isFullCircle ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="#e31837"
                      fillOpacity="0.08"
                      className="cursor-pointer"
                      onClick={() => onSectorClick(sector.idx)}
                    />
                  ) : (
                    <path
                      d={sector.pathData}
                      fill="#e31837"
                      fillOpacity="0.08"
                      className="cursor-pointer hover:fill-opacity-15 transition-all"
                      onClick={() => onSectorClick(sector.idx)}
                    />
                  )}

                  {/* Se houver imagem do sabor, renderizamos com clip-path */}
                  {flavor.imageUrl && (
                    <image
                      href={getOptimizedImageUrl(flavor.imageUrl)}
                      x={cx - radius}
                      y={cy - radius}
                      width={radius * 2}
                      height={radius * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-sector-${sector.idx})`}
                      className="cursor-pointer hover:scale-[1.02] transition-transform duration-300 origin-center"
                      onClick={() => onSectorClick(sector.idx)}
                    />
                  )}
                </g>
              ) : (
                /* Setor vazio */
                sector.isFullCircle ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="rgba(42, 42, 42, 0.2)"
                    stroke="#2a2a2a"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                    className="cursor-pointer hover:fill-brand-mediumGray/10 transition-colors"
                    onClick={() => onSectorClick(sector.idx)}
                  />
                ) : (
                  <path
                    d={sector.pathData}
                    fill="rgba(42, 42, 42, 0.2)"
                    stroke="#2a2a2a"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                    className="cursor-pointer hover:fill-brand-mediumGray/10 transition-colors"
                    onClick={() => onSectorClick(sector.idx)}
                  />
                )
              )}
            </g>
          );
        })}

        {/* 4. Destaque Visual em Verde para o Setor Selecionado */}
        {sectors.map((sector) => {
          const isActive = activeSectorIndex === sector.idx;
          if (!isActive && !isFullPizzaSelected) return null;

          if (isFullPizzaSelected) return null; // Já destravamos a anilha externa

          return (
            <g key={`highlight-${sector.idx}`} className="pointer-events-none">
              {sector.isFullCircle ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius - 0.5}
                  fill="rgba(16, 185, 129, 0.12)"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  className="animate-pulse"
                />
              ) : (
                <path
                  d={sector.pathData}
                  fill="rgba(16, 185, 129, 0.18)"
                  stroke="#10b981"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />
              )}
            </g>
          );
        })}

        {/* 5. Linhas divisórias (para 2 ou mais fatias) */}
        {flavorCount > 1 &&
          sectors.map((sector) => {
            if (!sector.dividerLine) return null;
            return (
              <line
                key={`line-${sector.idx}`}
                x1={cx}
                y1={cy}
                x2={sector.dividerLine.x2}
                y2={sector.dividerLine.y2}
                stroke="#3f2302"
                strokeWidth="0.8"
                strokeLinecap="round"
                opacity="0.85"
                className="pointer-events-none"
              />
            );
          })}

        {/* Borda verde para pizza inteira selecionada */}
        {isFullPizzaSelected && (
          <circle
            cx={cx}
            cy={cy}
            r={radius + 0.5}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            className="pointer-events-none animate-pulse"
          />
        )}
      </svg>

      {/* 6. Rótulos/Botões de Sabores flutuando nos centroides */}
      {sectors.map((sector) => {
        const flavor = selectedFlavors[sector.idx];
        const isActive = activeSectorIndex === sector.idx && !isFullPizzaSelected;
        const toppingsCount = toppingsCountBySector?.[sector.idx] || 0;

        return (
          <button
            key={`btn-${sector.idx}`}
            onClick={() => onSectorClick(sector.idx)}
            style={sector.centroid}
            className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full border transition-all text-xs font-semibold tracking-wide shadow-xl cursor-pointer max-w-[130px] flex items-center justify-center gap-1.5 ${
              isActive
                ? "bg-emerald-950/95 border-emerald-400 text-emerald-300 ring-2 ring-emerald-500 scale-105 shadow-emerald-950/80 font-bold"
                : flavor
                ? "bg-black/75 backdrop-blur-md border-brand-red/50 hover:border-brand-red text-white hover:bg-brand-red font-medium"
                : "bg-black/70 backdrop-blur-md border-white/20 text-neutral-200 hover:border-white hover:bg-brand-red hover:text-white"
            }`}
          >
            <span className="truncate">
              {flavor ? flavor.name : "Selecionar"}
            </span>
            {toppingsCount > 0 && (
              <span className="bg-emerald-500 text-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black flex-shrink-0">
                +{toppingsCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
