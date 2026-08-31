export type RouteHistoryItem = {
  id: string;
  origin: [number, number];
  destination: [number, number];
  originLabel?: string;
  destinationLabel?: string;
  city: string;
  timestamp: number;
  originalRisk: number;
  alternativeRisk: number;
  recommendedRoute: "original" | "alternative";
  savings: number;
  distanceMeters: number | null;
  extraDistancePct: number;
  shadeSegmentsCount: number;
};

const STORAGE_KEY = "thermax_route_history_v1";
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "thermax-c1847";

// Firebase Realtime Database URLs to try
const FIREBASE_URLS = [
  `https://${FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
  `https://${FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app`,
  `https://${FIREBASE_PROJECT_ID}.firebaseio.com`,
];

export function getLocalHistory(): RouteHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read route history", e);
    return [];
  }
}

export async function fetchFirebaseHistory(): Promise<RouteHistoryItem[]> {
  for (const baseUrl of FIREBASE_URLS) {
    try {
      const res = await fetch(`${baseUrl}/routes.json?orderBy="$key"&limitToLast=30`, {
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          const items: RouteHistoryItem[] = Object.values(data);
          return items.sort((a, b) => b.timestamp - a.timestamp);
        }
      }
    } catch (err) {
      // Try next endpoint fallback
    }
  }
  return [];
}

export function saveHistoryItem(item: Omit<RouteHistoryItem, "id" | "timestamp">): RouteHistoryItem {
  const newItem: RouteHistoryItem = {
    ...item,
    id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  // 1. Save locally
  const existing = getLocalHistory();
  const updated = [newItem, ...existing.filter((h) => h.id !== newItem.id)].slice(0, 30);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save local route history", e);
    }
  }

  // 2. Real-time Firebase Sync to project thermax-c1847
  syncToFirebase(newItem).catch(() => {});

  return newItem;
}

export function clearHistory(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  clearFirebaseHistory().catch(() => {});
}

async function syncToFirebase(item: RouteHistoryItem) {
  for (const baseUrl of FIREBASE_URLS) {
    try {
      await fetch(`${baseUrl}/routes/${item.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
    } catch (err) {
      // Non-blocking sync
    }
  }
}

async function clearFirebaseHistory() {
  for (const baseUrl of FIREBASE_URLS) {
    try {
      await fetch(`${baseUrl}/routes.json`, { method: "DELETE" });
    } catch (err) {}
  }
}
