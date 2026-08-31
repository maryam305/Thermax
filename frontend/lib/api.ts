export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/backend";

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
};

export type RouteMetrics = {
  total_distance_deg: number;
  multi_factor_risk_score: number;
  segments_count: number;
};

export type RouteAnalysis = {
  decision: {
    selected_route: "original" | "alternative";
    risk_score_savings: number;
    extra_distance_pct: number;
    original_route: RouteMetrics;
    alternative_route: RouteMetrics;
  };
  routes_geojson: GeoJsonFeatureCollection;
  thermal_overlay_geojson: GeoJsonFeatureCollection;
};

export type RouteId = "original" | "alternative";

export function routeDistanceMeters(analysis: RouteAnalysis, id: RouteId) {
  const feature = analysis.routes_geojson.features.find((item) => item.properties.type === id);
  const distance = Number(feature?.properties.distance);
  return Number.isFinite(distance) ? distance : null;
}

export function displayedRecommendedRoute(analysis: RouteAnalysis): RouteId {
  const originalRisk = analysis.decision.original_route.multi_factor_risk_score;
  const alternativeRisk = analysis.decision.alternative_route.multi_factor_risk_score;
  if (originalRisk !== alternativeRisk) return originalRisk < alternativeRisk ? "original" : "alternative";

  const originalDistance = routeDistanceMeters(analysis, "original");
  const alternativeDistance = routeDistanceMeters(analysis, "alternative");
  if (originalDistance !== null && alternativeDistance !== null && originalDistance !== alternativeDistance) {
    return originalDistance < alternativeDistance ? "original" : "alternative";
  }
  return analysis.decision.selected_route;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Backend request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function analyzeRoute(payload: {
  origin: [number, number];
  destination: [number, number];
  city: string;
  user_preference: string;
  humidity: number;
}) {
  return request<RouteAnalysis>("/api/v1/routing/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function askThermax(prompt: string, systemInstruction?: string) {
  const result = await request<{ response: string }>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, provider: "groq", model: "openai/gpt-oss-20b", system_instruction: systemInstruction }),
  });
  return result.response;
}

export type FortyGuardThermalSummary = {
  tiles_count: number;
  avg_temp_c: number | null;
  min_temp_c?: number;
  max_temp_c?: number;
  avg_shade_pct?: number;
  risk_level: string;
  data_source: string;
};

export type AiGuidance = {
  provider: string;
  model: string;
  response: string;
};

export type MeetingPlanResult = {
  fortyguard_data: FortyGuardThermalSummary;
  ai_guidance: AiGuidance;
};

export type InterventionAdviceResult = {
  fortyguard_data: FortyGuardThermalSummary;
  ai_guidance: AiGuidance;
};

export function planMeeting(payload: {
  location: string;
  meeting_time: string;
  city: string;
}) {
  return request<MeetingPlanResult>("/api/v1/meeting/plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adviseIntervention(payload: {
  place_type: string;
  location: string;
  city: string;
}) {
  return request<InterventionAdviceResult>("/api/v1/interventions/advise", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type BackendHealth = {
  status: string;
  groq_configured: boolean;
  gemini_configured: boolean;
  fortyguard_configured: boolean;
};

export function getBackendHealth() {
  return request<BackendHealth>("/health");
}
