import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateHaversineDistance } from "@/lib/geo";
import { saveDriverActiveRoute, getDriverActiveRoute } from "@/lib/driver-active-route";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const driverId = session.user.id;

  try {
    const { driverLat, driverLng } = await request.json();

    if (driverLat === undefined || driverLng === undefined) {
      return NextResponse.json({ error: "Coordenadas do piloto obrigatórias" }, { status: 400 });
    }

    // 1. Busca configurações de Depot (sede) e Cidade
    const configs = await prisma.systemConfig.findMany();
    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    // Coordenadas default de Depot (inicia em Recife se não configurado)
    let depotLat = parseFloat(configMap.get("vroom_depot_lat") || "-8.05");
    let depotLng = parseFloat(configMap.get("vroom_depot_lng") || "-34.90");

    // 2. Filtra pedidos na bag do piloto que estão em rota
    const orders = await prisma.order.findMany({
      where: {
        driverId,
        status: "EM_ROTA",
      },
    });

    if (orders.length === 0) {
      return NextResponse.json({
        orderedIds: [],
        steps: [],
        routeGeometry: [],
        summary: { distance: 0, duration: 0 },
      });
    }

    // Filtra pedidos válidos com coordenadas preenchidas
    const validOrders = orders.filter((o) => o.customerLat !== null && o.customerLng !== null);

    // --- ALGORITMO TSP (VROOM vs HAVERSINE FALLBACK) ---
    let orderedOrders = [...validOrders];
    let isOptimized = false;

    // Tenta comunicar com contêiner VROOM local (perfil bike)
    try {
      const vroomJobs = validOrders.map((o, idx) => ({
        id: idx + 1,
        description: o.id,
        location: [o.customerLng!, o.customerLat!], // VROOM usa [lng, lat]
      }));

      const vroomPayload = {
        jobs: vroomJobs,
        vehicles: [
          {
            id: 1,
            profile: "bike",
            start: [driverLng, driverLat],
            end: [depotLng, depotLat],
          },
        ],
      };

      // VROOM localmente escutando na porta 3000 ou 5000. Vamos tentar localhost:5000/com_vroom ou similar, timeout de 4s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const vroomRes = await fetch("http://localhost:5000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vroomPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const vroomData = await vroomRes.json();

      if (vroomData && vroomData.code === 0 && vroomData.routes && vroomData.routes[0]) {
        const routeSteps = vroomData.routes[0].steps;
        // Mapeia ordem calculada pelo VROOM
        const jobSteps = routeSteps.filter((s: any) => s.type === "job");
        const orderIdMap = new Map(validOrders.map((o, idx) => [idx + 1, o]));
        
        orderedOrders = jobSteps.map((s: any) => orderIdMap.get(s.id)).filter(Boolean);
        isOptimized = true;
        console.log("[VROOM] Otimização TSP via Bike concluída com sucesso!");
      }
    } catch (vroomErr) {
      console.warn("[VROOM] Falha no VROOM local. Acionando Fallback Geodésico (Haversine Distance)...");
    }

    // Fallback Geodésico (Haversine) se o VROOM falhou
    if (!isOptimized) {
      let currentLat = driverLat;
      let currentLng = driverLng;
      const unvisited = [...validOrders];
      const sorted: typeof validOrders = [];

      while (unvisited.length > 0) {
        let minIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
          const dist = calculateHaversineDistance(
            currentLat,
            currentLng,
            unvisited[i].customerLat!,
            unvisited[i].customerLng!
          );
          if (dist < minDistance) {
            minDistance = dist;
            minIndex = i;
          }
        }

        const nextStop = unvisited.splice(minIndex, 1)[0];
        sorted.push(nextStop);
        currentLat = nextStop.customerLat!;
        currentLng = nextStop.customerLng!;
      }

      orderedOrders = sorted;
      console.log("[Haversine] Otimização geodésica concluída!");
    }

    const orderedIds = orderedOrders.map((o) => o.id);

    // --- INTERPOLAÇÃO OSRM (Traçado das Ruas com Fallback) ---
    // Monta coordenadas OSRM: [driver] -> [cliente1] -> [cliente2] -> ... -> [depot]
    const waypoints = [
      [driverLng, driverLat], // OSRM usa [lng, lat]
      ...orderedOrders.map((o) => [o.customerLng!, o.customerLat!]),
      [depotLng, depotLat],
    ];

    const coordsString = waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
    
    let routeGeometry: [number, number][] = [];
    let stepsMetadata: any[] = [];
    let summary = { distance: 0, duration: 0 };
    let routeLoaded = false;

    // Tentativa 1: OSRM Bike de Alta Fidelidade (routing.openstreetmap.de)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const osrmUrl = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
      const res = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data && data.code === "Ok" && data.routes && data.routes[0]) {
        const route = data.routes[0];
        // OSRM retorna coordenadas GeoJSON como [lng, lat]. Invertemos para Leaflet [lat, lng].
        routeGeometry = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        summary = {
          distance: route.distance || 0,
          duration: route.duration || 0,
        };
        stepsMetadata = route.legs || [];
        routeLoaded = true;
        console.log("[OSRM] Roteamento de Bike carregado com sucesso!");
      }
    } catch (osrmErr) {
      console.warn("[OSRM] Falha no servidor de bicicleta OSRM. Tentando fallback para servidor secundário...");
    }

    // Tentativa 2: OSRM Standard Fallback (project-osrm.org)
    if (!routeLoaded) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const osrmFallbackUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
        const res = await fetch(osrmFallbackUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (data && data.code === "Ok" && data.routes && data.routes[0]) {
          const route = data.routes[0];
          routeGeometry = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
          summary = {
            distance: route.distance || 0,
            duration: route.duration || 0,
          };
          stepsMetadata = route.legs || [];
          routeLoaded = true;
          console.log("[OSRM Fallback] Roteamento de Carro carregado com sucesso!");
        }
      } catch (fallbackErr) {
        console.error("[OSRM Fallback] Falha no roteamento OSRM público geral.");
      }
    }

    // Fallback de Linha Reta Geodésica se ambos os OSRM falharem (evita travamento do mapa)
    if (!routeLoaded) {
      routeGeometry = waypoints.map((w) => [w[1], w[0]]); // Apenas linhas retas ligando os pontos
      summary = {
        distance: 0,
        duration: 0,
      };
      console.log("[Geodésico Fallback] Desenhando linhas retas como última contingência.");
    }

    // 3. Salva rota ativa no Cache do Banco
    await saveDriverActiveRoute(
      driverId,
      orderedIds,
      stepsMetadata,
      routeGeometry,
      summary
    );

    return NextResponse.json({
      orderedIds,
      steps: stepsMetadata,
      routeGeometry,
      summary,
    });
  } catch (error) {
    console.error("Optimize error:", error);
    return NextResponse.json({ error: "Erro interno ao otimizar rotas" }, { status: 500 });
  }
}
