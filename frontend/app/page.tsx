"use client";

import {
  ArrowRight, ArrowUpDown, CalendarClock, Check, ChevronDown, Circle, History, Info,
  Layers, MapPin, Moon, Route, ShieldCheck, Sparkles, Sun, SunMedium, Thermometer, Trees, RefreshCw,
  Droplets, School, Bus, TreePine
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MapboxRouteMap } from "@/components/mapbox-route-map";
import { LeafletRouteMap } from "@/components/leaflet-route-map";
import { analyzeRoute, askThermax, planMeeting, adviseIntervention, displayedRecommendedRoute, getBackendHealth, routeDistanceMeters, type BackendHealth, type RouteAnalysis, type RouteMetrics, type MeetingPlanResult, type InterventionAdviceResult, type FortyGuardThermalSummary } from "@/lib/api";
import { getLocalHistory, fetchFirebaseHistory, saveHistoryItem, type RouteHistoryItem, clearHistory } from "@/lib/history";

type Mode = "home" | "route" | "meeting" | "interventions";
type Theme = "light" | "dark";
type RouteId = "original" | "alternative";
type CityId = "Phoenix" | "Houston" | "Miami" | "New York" | "San Jose";

const supportedCities: Record<CityId, { label: string; bounds: [number, number, number, number] }> = {
  Phoenix: { label: "Phoenix, AZ", bounds: [-112.35, 33.2, -111.8, 33.7] },
  Houston: { label: "Houston, TX", bounds: [-95.7, 29.5, -95.0, 30.1] },
  Miami: { label: "Miami, FL", bounds: [-80.4, 25.6, -80.1, 25.9] },
  "New York": { label: "New York, NY", bounds: [-74.25, 40.5, -73.7, 40.9] },
  "San Jose": { label: "San Jose, CA", bounds: [-122.0, 37.2, -121.7, 37.4] },
};

const pageCopy: Record<Exclude<Mode, "home">, { title: string; subtitle: string }> = {
  route: { title: "Heat-safe walking route", subtitle: "Compare standard and heat-optimized paths powered by FortyGuard." },
  meeting: { title: "Meeting planner", subtitle: "Find heat-conscious times and locations for outdoor events." },
  interventions: { title: "Urban cooling advisor", subtitle: "Get actionable cooling recommendations for specific locations." },
};

const modes = [
  { id: "route", name: "Heat-safe walking route", description: "Real-time thermal risk path comparison", icon: Route },
  { id: "meeting", name: "Meeting planner", description: "Heat-conscious outdoor event scheduling", icon: CalendarClock },
  { id: "interventions", name: "Urban cooling advisor", description: "AI urban heat mitigation guidance", icon: Trees },
] as const;

function formatDistance(meters: number | null) {
  if (meters === null || !Number.isFinite(meters)) return "N/A";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function ThermalParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles = Array.from({ length: 32 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.5 - 0.2,
      opacity: Math.random() * 0.5 + 0.2,
      color: Math.random() > 0.5 ? "#f3d094" : "#e56b58",
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width; }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
      });
      animId = requestAnimationFrame(render);
    };

    render();
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.5 }} />;
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("home");
  const [city, setCity] = useState<CityId>("Phoenix");
  const [theme, setTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("thermax-theme") as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }
  }, []);

  async function checkHealth() {
    setHealthError(false);
    try { setHealth(await getBackendHealth()); }
    catch { setHealth(null); setHealthError(true); }
  }

  useEffect(() => { void checkHealth(); }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => menuRef.current && !menuRef.current.contains(event.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setMenuOpen(false);
  }

  function changeTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("thermax-theme", next);
  }

  const selectedMode = modes.find((item) => item.id === mode);
  return (
    <main className="app-frame">
      {/* Dynamic Thermal Background Waves & Microclimate Grid Overlay */}
      <div className="thermal-bg-animation" aria-hidden="true">
        <div className="thermal-wave-1" />
        <div className="thermal-wave-2" />
        <div className="thermal-wave-3" />
      </div>
      <div className="thermal-bg-grid" aria-hidden="true" />
      <ThermalParticleCanvas />

      {/* Show navigation topbar ONLY when inside a tool (not on the landing page) */}
      {mode !== "home" && (
        <header className="topbar">
          <button className="app-brand" type="button" onClick={() => changeMode("home")}>
            <img src="/thermax_logo_new.png" alt="ThermaX Shield Logo" style={{ width: "36px", height: "36px", objectFit: "contain" }} />
            <span className="app-brand-copy">
              <strong>ThermaX</strong>
              <small>Urban heat intelligence</small>
            </span>
          </button>
          
          <div className="top-actions">
            <button className={`live-status ${healthError ? "status-error" : ""}`} type="button" onClick={checkHealth} title="Click to check again">
              <i /> {healthError ? "Backend offline · retry" : health ? health.fortyguard_configured ? "Backend online · FortyGuard active" : "Backend online · FortyGuard fallback" : "Checking..."}
            </button>
            <button className="icon-button" type="button" onClick={changeTheme}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>

          <div className={`mode-switcher ${menuOpen ? "is-open" : ""}`} ref={menuRef}>
            <button className="mode-button" type="button" onClick={() => setMenuOpen((open) => !open)}>
              <span>
                <strong>{selectedMode?.name ?? "Choose a ThermaX tool"}</strong>
                <small>{selectedMode?.description ?? "Urban heat intelligence"}</small>
              </span>
              <ChevronDown size={18} />
            </button>
            {menuOpen && (
              <div className="mode-menu">
                {modes.map(({ id, name, description, icon: Icon }) => (
                  <button key={id} className={`mode-option ${mode === id ? "selected" : ""}`} type="button" onClick={() => changeMode(id)}>
                    <span className="mode-option-icon"><Icon size={17} /></span>
                    <span><strong>{name}</strong><small>{description}</small></span>
                    <Check className="mode-check" size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
      )}

      <div className={`page-content ${mode === "route" ? "route-mode-content" : ""}`}>
        {mode === "home" ? (
          <MainMenu
            onChoose={changeMode}
            theme={theme}
            onToggleTheme={changeTheme}
            health={health}
            healthError={healthError}
            onCheckHealth={checkHealth}
          />
        ) : (
          <>
            {mode !== "route" && <PageHeading mode={mode} city={city} onCityChange={setCity} />}
            {mode === "route" && <RoutePlanner city={city} theme={theme} onCityChange={setCity} />}
            {mode === "meeting" && <MeetingPlanner city={city} />}
            {mode === "interventions" && <InterventionPlanner city={city} />}
          </>
        )}
      </div>
    </main>
  );
}

function MainMenu({
  onChoose,
  theme,
  onToggleTheme,
  health,
  healthError,
  onCheckHealth,
}: {
  onChoose: (mode: Mode) => void;
  theme: Theme;
  onToggleTheme: () => void;
  health: BackendHealth | null;
  healthError: boolean;
  onCheckHealth: () => void;
}) {
  return (
    <section className="main-menu">
      <div className="home-hero">
        <div className="hero-logo-container">
          <div className="hero-logo-glow" />
          <img src="/thermax_logo_new.png" alt="ThermaX Logo" className="hero-logo-img" />
        </div>

        <span className="eyebrow"><Sun size={14} /> FortyGuard Microclimate Platform</span>
        <h1>ThermaX</h1>
        <p>AI-Powered Urban Thermal Intelligence & Navigation</p>

        <div className="home-top-controls">
          <button className={`live-status ${healthError ? "status-error" : ""}`} type="button" onClick={onCheckHealth} title="Click to check status">
            <i /> {healthError ? "Backend offline" : health ? health.fortyguard_configured ? "FortyGuard Active" : "Backend Online" : "Checking..."}
          </button>
          <button className="icon-button" type="button" onClick={onToggleTheme} title="Toggle light/dark mode">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>

      <div className="feature-grid">
        {modes.map(({ id, name, description, icon: Icon }, index) => (
          <button className={`feature-card feature-${index + 1}`} type="button" key={id} onClick={() => onChoose(id)}>
            <span className="feature-icon"><Icon size={24} /></span>
            <h2>{name}</h2>
            <p>{description}</p>
            <span className="feature-action">Launch tool <ArrowRight size={17} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PageHeading({ mode, city, onCityChange }: { mode: Exclude<Mode, "home">; city: CityId; onCityChange: (city: CityId) => void }) {
  return <div className="page-heading"><div><span className="eyebrow"><Sun size={14} /> U.S. supported cities only</span><h1>{pageCopy[mode].title}</h1><p>{pageCopy[mode].subtitle}</p></div><label className="city-control"><span>Coverage city</span><select className="city-select" value={city} onChange={(event) => onCityChange(event.target.value as CityId)}>{(Object.entries(supportedCities) as [CityId, { label: string }][]).map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}</select></label></div>;
}

function parseCoordinates(value: string): [number, number] | null {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
  const [longitude, latitude] = parts;
  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90 ? [longitude, latitude] : null;
}

function isInsideCity([longitude, latitude]: [number, number], city: CityId) {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = supportedCities[city].bounds;
  return longitude >= minLongitude && longitude <= maxLongitude && latitude >= minLatitude && latitude <= maxLatitude;
}

function ScoreCounter({ value }: { value: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 600;
    const stepTime = 20;
    const totalSteps = duration / stepTime;
    const increment = (value - start) / totalSteps;

    const timer = setInterval(() => {
      start += increment;
      if ((increment >= 0 && start >= value) || (increment < 0 && start <= value)) {
        setCurrent(value);
        clearInterval(timer);
      } else {
        setCurrent(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return <>{current.toFixed(2)}</>;
}

function RoutePlanner({
  city,
  theme,
  onCityChange
}: {
  city: CityId;
  theme: Theme;
  onCityChange: (city: CityId) => void;
}) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [selected, setSelected] = useState<RouteId>("original");
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RouteHistoryItem[]>([]);
  const [syncingHistory, setSyncingHistory] = useState(false);

  async function loadHistory() {
    setSyncingHistory(true);
    const local = getLocalHistory();
    setHistory(local);

    try {
      const fbItems = await fetchFirebaseHistory();
      if (fbItems.length > 0) {
        setHistory(fbItems);
      }
    } catch (err) {
      // Keep local
    } finally {
      setSyncingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function analyze() {
    const originCoordinates = parseCoordinates(origin);
    const destinationCoordinates = parseCoordinates(destination);
    if (!originCoordinates || !destinationCoordinates) return setError("Enter each point as longitude, latitude (for example: -112.074, 33.448).");
    if (!isInsideCity(originCoordinates, city) || !isInsideCity(destinationCoordinates, city)) return setError(`Both points must be within ${supportedCities[city].label}. ThermaX currently supports U.S. coverage only.`);
    setError(""); setRequestFailed(false); setLoading(true); setAnalysis(null);
    try {
      const result = await analyzeRoute({ origin: originCoordinates, destination: destinationCoordinates, city, user_preference: "balanced", humidity: 45 });
      setAnalysis(result);
      const rec = displayedRecommendedRoute(result);
      setSelected(rec);

      // Save to Local & Firebase Realtime Database (thermax-c1847)
      const distance = routeDistanceMeters(result, rec);
      const saved = saveHistoryItem({
        origin: originCoordinates,
        destination: destinationCoordinates,
        city: supportedCities[city].label,
        originalRisk: result.decision.original_route.multi_factor_risk_score,
        alternativeRisk: result.decision.alternative_route.multi_factor_risk_score,
        recommendedRoute: rec,
        savings: result.decision.risk_score_savings,
        distanceMeters: distance,
        extraDistancePct: result.decision.extra_distance_pct,
        shadeSegmentsCount: rec === "original" ? result.decision.original_route.segments_count : result.decision.alternative_route.segments_count,
      });
      setHistory((prev) => [saved, ...prev.filter((h) => h.id !== saved.id)]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The backend request failed.");
      setRequestFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function loadHistoryItem(item: RouteHistoryItem) {
    setOrigin(`${item.origin[0]}, ${item.origin[1]}`);
    setDestination(`${item.destination[0]}, ${item.destination[1]}`);
    setHistoryOpen(false);
  }

  const recommended = analysis ? displayedRecommendedRoute(analysis) : "original";
  const equalRisk = analysis ? Math.abs(analysis.decision.original_route.multi_factor_risk_score - analysis.decision.alternative_route.multi_factor_risk_score) < 0.01 : false;

  // Calculate insight micro-metrics
  const savingsPct = analysis ? Math.max(0, Math.round((analysis.decision.risk_score_savings / Math.max(1, analysis.decision.original_route.multi_factor_risk_score)) * 100)) : 0;
  const shadeCount = analysis ? (recommended === "original" ? analysis.decision.original_route.segments_count : analysis.decision.alternative_route.segments_count) : 0;

  return (
    <section className="route-layout">
      <aside className="surface controls-panel">
        <div className="route-header">
          <span className="eyebrow"><Sun size={12} /> Climate routing engine</span>
          <h1 style={{ fontSize: "22px", marginTop: "4px" }}>Route Planner</h1>
          <p className="helper" style={{ margin: "4px 0 0" }}>Compare standard and heat-optimized paths powered by FortyGuard.</p>
        </div>

        <label className="field" style={{ marginTop: "14px" }}>
          <span>Coverage city</span>
          <select className="city-select w-full" value={city} onChange={(event) => onCityChange(event.target.value as CityId)}>
            {(Object.entries(supportedCities) as [CityId, { label: string }][]).map(([id, item]) => (
              <option value={id} key={id}>{item.label}</option>
            ))}
          </select>
        </label>

        <div className="route-inputs-card">
          <Field label="Starting coordinates" icon={<Circle size={14} className="text-teal-600 dark:text-teal-400" />} value={origin} onChange={setOrigin} placeholder="longitude, latitude" />
          <button className="swap-button" type="button" onClick={() => { setOrigin(destination); setDestination(origin); }} title="Swap points">
            <ArrowUpDown size={14} />
          </button>
          <Field label="Destination coordinates" icon={<MapPin size={15} className="text-red-500" />} value={destination} onChange={setDestination} placeholder="longitude, latitude" />
        </div>

        {error && <ErrorMessage text={error} onRetry={requestFailed ? analyze : undefined} />}

        <button className="primary-button" type="button" onClick={analyze} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner mr-2" style={{ width: "16px", height: "16px" }} /> Calling backend...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Compare heat-safe routes
            </>
          )}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Journey History
          </span>
          <button className="history-button" type="button" onClick={() => { setHistoryOpen((o) => !o); if (!historyOpen) void loadHistory(); }}>
            <History size={13} /> {historyOpen ? "Hide" : "Show"} ({history.length})
          </button>
        </div>

        {/* Collapsible Firebase Realtime History Drawer */}
        {historyOpen && (
          <div className="history-drawer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                Firebase Journeys {syncingHistory && <RefreshCw size={11} className="spinner" />}
              </strong>
              {history.length > 0 && (
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "10px", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => { clearHistory(); setHistory([]); }}
                >
                  Clear all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="helper" style={{ margin: "8px 0 0" }}>No saved routes yet. Run a route analysis to record real-time data.</p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-item" onClick={() => loadHistoryItem(item)}>
                    <div className="history-meta">
                      <strong>{item.city}</strong>
                      <small>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {item.distanceMeters ? (item.distanceMeters / 1000).toFixed(2) + ' km' : 'N/A'}</small>
                    </div>
                    <span className={`history-badge ${item.savings > 0 ? "safe" : "hot"}`}>
                      {item.savings > 0 ? `-${item.savings.toFixed(1)} risk` : `${item.originalRisk.toFixed(1)} risk`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="helper"><ShieldCheck size={14} /> Coverage is limited to supported U.S. cities. Options appear only after a successful response.</p>

        {analysis && (
          <div className="route-options">
            <h2>{analysis.routes_geojson.features.length} route options</h2>
            <RouteOption id="original" selected={selected} chosen={recommended} equalRisk={equalRisk} metrics={analysis.decision.original_route} distanceMeters={routeDistanceMeters(analysis, "original")} onSelect={setSelected} />
            <RouteOption id="alternative" selected={selected} chosen={recommended} equalRisk={equalRisk} metrics={analysis.decision.alternative_route} distanceMeters={routeDistanceMeters(analysis, "alternative")} onSelect={setSelected} />

            {/* Thermal Insight Panel ("WHY THIS ROUTE?") */}
            <div className="thermal-insight-card">
              <h3><Thermometer size={14} /> Why this route?</h3>
              <div className="thermal-insight-grid">
                <div className="thermal-insight-item"><i>🌡️</i><span>{savingsPct > 0 ? `${savingsPct}% lower exposure` : `Optimal heat path`}</span></div>
                <div className="thermal-insight-item"><i>🌳</i><span>{shadeCount} micro-segments</span></div>
                <div className="thermal-insight-item"><i>💧</i><span>FortyGuard tiles active</span></div>
                <div className="thermal-insight-item"><i>☀️</i><span>High-risk zones checked</span></div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <RouteResult analysis={analysis} selected={selected} loading={loading} city={city} theme={theme} />
    </section>
  );
}

function RouteOption({ id, selected, chosen, equalRisk, metrics, distanceMeters, onSelect }: { id: RouteId; selected: RouteId; chosen: RouteId; equalRisk: boolean; metrics: RouteMetrics; distanceMeters: number | null; onSelect: (id: RouteId) => void }) {
  const recommended = chosen === id;
  return (
    <button className={`route-option ${selected === id ? "selected" : ""} ${recommended ? "recommended-route" : "higher-risk-route"}`} type="button" onClick={() => onSelect(id)}>
      <span className="route-option-head">
        <span><i className={recommended ? "safe-dot" : "hot-dot"} />{id === "original" ? "Original route" : "Alternative route"}</span>
        <em>{recommended ? "Recommended" : equalRisk ? "Same heat · longer" : "Higher risk"}</em>
      </span>
      <span className="route-metrics">
        <span>Walk distance<strong>{formatDistance(distanceMeters)}</strong></span>
        <span>Heat segments<strong>{metrics.segments_count}</strong></span>
        <span>Heat risk<strong><ScoreCounter value={metrics.multi_factor_risk_score} /></strong></span>
      </span>
    </button>
  );
}

function RouteResult({
  analysis,
  selected,
  loading,
  city,
  theme
}: {
  analysis: RouteAnalysis | null;
  selected: RouteId;
  loading: boolean;
  city: CityId;
  theme: Theme;
}) {
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <MapboxRouteMap
        key={analysis ? JSON.stringify(analysis.routes_geojson) : `empty-${city}-${theme}`}
        selected={selected}
        loading={loading}
        analysis={analysis}
        city={city}
        theme={theme}
      />
    );
  }
  return (
    <LeafletRouteMap
      key={analysis ? JSON.stringify(analysis.routes_geojson) : `empty-${city}-${theme}`}
      selected={selected}
      loading={loading}
      analysis={analysis}
      city={city}
      theme={theme}
    />
  );
}

function Field({ label, icon, value, onChange, placeholder }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="field"><span>{label}</span><span className="input-wrap">{icon}<input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></span></label>;
}

function ErrorMessage({ text, onRetry }: { text: string; onRetry?: () => void }) { return <div className="field-error" role="alert"><Info size={14} /><span>{text}</span>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>; }

function ThermalSummaryCard({ data, label }: { data: FortyGuardThermalSummary; label?: string }) {
  const riskColors: Record<string, string> = {
    extreme: "var(--hot)",
    high: "#e8933a",
    moderate: "var(--warm)",
    low: "var(--safe)",
    minimal: "var(--brand)",
  };
  const riskColor = riskColors[data.risk_level] ?? "var(--muted)";

  return (
    <div className="thermal-summary-card">
      <div className="thermal-summary-header">
        <span className="thermal-summary-badge" style={{ background: riskColor }}>
          {data.risk_level.toUpperCase()}
        </span>
        <span className="thermal-summary-source">
          {data.data_source === "fortyguard" ? "🛰️ Live FortyGuard" : "📊 Thermal Model"}
        </span>
      </div>
      {data.avg_temp_c !== null && (
        <div className="thermal-summary-metrics">
          <div className="thermal-metric">
            <span className="thermal-metric-value">{data.avg_temp_c}°C</span>
            <span className="thermal-metric-label">Avg Temp</span>
          </div>
          <div className="thermal-metric">
            <span className="thermal-metric-value">{data.min_temp_c}°C – {data.max_temp_c}°C</span>
            <span className="thermal-metric-label">Range</span>
          </div>
          <div className="thermal-metric">
            <span className="thermal-metric-value">{data.avg_shade_pct}%</span>
            <span className="thermal-metric-label">Shade</span>
          </div>
          <div className="thermal-metric">
            <span className="thermal-metric-value">{data.tiles_count}</span>
            <span className="thermal-metric-label">Tiles</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingPlanner({ city }: { city: CityId }) {
  const [location, setLocation] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<MeetingPlanResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (location.trim().length < 3) return setError(`Enter a meeting location in ${supportedCities[city].label}.`);
    if (!meetingTime) return setError("Choose a proposed meeting date and time.");
    const selectedTime = new Date(meetingTime).getTime();
    const now = Date.now();
    if (!Number.isFinite(selectedTime) || selectedTime <= now) return setError("The meeting time must be in the future.");
    if (selectedTime > now + 12 * 60 * 60 * 1000) return setError("FortyGuard forecasts are limited to the next 12 hours.");
    setError(""); setResult(null); setLoading(true);
    try {
      const res = await planMeeting({
        location: location.trim(),
        meeting_time: new Date(selectedTime).toISOString(),
        city,
      });
      setResult(res);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The meeting guidance service failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="two-column-layout">
      <aside className="surface controls-panel">
        <h2>Meeting details</h2>
        <Field
          label={`Location in ${supportedCities[city].label}`}
          icon={<MapPin size={16} />}
          value={location}
          onChange={setLocation}
          placeholder="Park, address, or landmark"
        />
        <label className="field">
          <span>Proposed date and time</span>
          <input
            type="datetime-local"
            value={meetingTime}
            onChange={(event) => setMeetingTime(event.target.value)}
          />
        </label>
        {error && <ErrorMessage text={error} onRetry={submit} />}
        <button className="primary-button" type="button" onClick={submit} disabled={loading}>
          <CalendarClock size={16} /> {loading ? "Querying FortyGuard..." : "Get heat-safe meeting plan"}
        </button>
        <p className="helper">
          <ShieldCheck size={15} /> Powered by FortyGuard thermal data. U.S. cities only, up to 12 hours.
        </p>
      </aside>
      <div className="results-column">
        {result ? (
          <>
            <ThermalSummaryCard data={result.fortyguard_data} />
            <AiResult
              title="FortyGuard-informed meeting guidance"
              text={result.ai_guidance.response}
              dataSource={result.fortyguard_data.data_source}
            />
          </>
        ) : (
          <div className="surface explanation">
            <h2>No recommendation yet</h2>
            <p className="helper">Enter a location and a time within the next 12 hours. Results include live FortyGuard thermal measurements.</p>
          </div>
        )}
      </div>
    </section>
  );
}

const placeTypeOptions = [
  { id: "School", icon: School, emoji: "🏫", description: "Playground & campus heat" },
  { id: "Bus stop", icon: Bus, emoji: "🚏", description: "Transit waiting areas" },
  { id: "Park", icon: TreePine, emoji: "🌳", description: "Green space optimization" },
  { id: "Neighborhood", icon: Layers, emoji: "🏘️", description: "Residential block cooling" },
] as const;

function InterventionPlanner({ city }: { city: CityId }) {
  const [placeType, setPlaceType] = useState("School");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<InterventionAdviceResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (location.trim().length < 3) return setError(`Enter a location in ${supportedCities[city].label}.`);
    setError(""); setResult(null); setLoading(true);
    try {
      const res = await adviseIntervention({
        place_type: placeType,
        location: location.trim(),
        city,
      });
      setResult(res);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The intervention guidance service failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="two-column-layout">
      <aside className="surface controls-panel">
        <h2>Choose a location type</h2>
        <div className="place-types-grid">
          {placeTypeOptions.map(({ id, icon: Icon, emoji, description }) => (
            <button
              key={id}
              type="button"
              className={`place-type-card ${placeType === id ? "selected" : ""}`}
              onClick={() => setPlaceType(id)}
            >
              <span className="place-type-icon">
                <Icon size={20} />
              </span>
              <span className="place-type-info">
                <strong>{id}</strong>
                <small>{description}</small>
              </span>
              {placeType === id && (
                <span className="place-type-check">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
        <Field
          label={`Location in ${supportedCities[city].label}`}
          icon={<MapPin size={16} />}
          value={location}
          onChange={setLocation}
          placeholder="Address, park, school, or bus stop"
        />
        {error && <ErrorMessage text={error} onRetry={submit} />}
        <button className="primary-button" type="button" onClick={submit} disabled={loading}>
          <Sparkles size={16} /> {loading ? "Querying FortyGuard..." : "Generate cooling interventions"}
        </button>
        <p className="helper">
          <ShieldCheck size={15} /> Powered by FortyGuard thermal data for the selected city.
        </p>
      </aside>
      <div className="results-column">
        {result ? (
          <>
            <ThermalSummaryCard data={result.fortyguard_data} />
            <AiResult
              title={`${placeType} cooling interventions`}
              text={result.ai_guidance.response}
              dataSource={result.fortyguard_data.data_source}
            />
          </>
        ) : (
          <div className="surface explanation">
            <h2>No recommendation yet</h2>
            <p className="helper">Choose a place type and enter a location. Results include live FortyGuard thermal data.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AiResult({ title, text, dataSource }: { title: string; text: string; dataSource?: string }) {
  return (
    <div className="recommendation">
      <div>
        <h2>{title}</h2>
        <span className={`status-pill ${dataSource === "fortyguard" ? "status-pill-fg" : ""}`}>
          {dataSource === "fortyguard" ? "FortyGuard + AI" : "AI guidance"}
        </span>
      </div>
      <div className="ai-response">
        {text.split(/\n+/).filter(Boolean).map((line, index) => (
          <p key={index}>{line.replace(/^[-•]\s*/, "")}</p>
        ))}
      </div>
      <p className="helper">
        {dataSource === "fortyguard"
          ? "✅ This guidance is grounded in live FortyGuard microclimate measurements."
          : "This guidance is AI-generated planning support based on thermal model data."}
      </p>
    </div>
  );
}
