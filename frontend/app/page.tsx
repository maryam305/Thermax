"use client";

import {
  ArrowRight, ArrowUpDown, CalendarClock, Check, ChevronDown, Circle, Info,
  MapPin, Moon, Route, ShieldCheck, Sparkles, Sun, SunMedium, Trees,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MapboxRouteMap } from "@/components/mapbox-route-map";
import { analyzeRoute, askThermax, displayedRecommendedRoute, getBackendHealth, routeDistanceMeters, type BackendHealth, type RouteAnalysis, type RouteMetrics } from "@/lib/api";

type Mode = "home" | "route" | "meeting" | "interventions";
type Theme = "light" | "dark";
type RouteId = "original" | "alternative";
type CityId = "Phoenix" | "Houston" | "Miami" | "New York" | "San Jose";

const supportedCities: Record<CityId, { label: string; bounds: [number, number, number, number] }> = {
  Phoenix: { label: "Phoenix, AZ", bounds: [-112.35, 33.20, -111.70, 33.75] },
  Houston: { label: "Houston, TX", bounds: [-95.90, 29.45, -95.00, 30.15] },
  Miami: { label: "Miami, FL", bounds: [-80.45, 25.55, -80.05, 26.05] },
  "New York": { label: "New York, NY", bounds: [-74.30, 40.45, -73.65, 40.95] },
  "San Jose": { label: "San Jose, CA", bounds: [-122.15, 37.10, -121.60, 37.55] },
};

function formatDistance(meters: number | null) {
  if (meters === null) return "Unavailable";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

const modes = [
  { id: "route" as const, name: "Heat-safe route", description: "Analyze a real walking route", icon: Route },
  { id: "meeting" as const, name: "Meeting planner", description: "Ask the ThermaX AI advisor", icon: CalendarClock },
  { id: "interventions" as const, name: "City interventions", description: "Generate location-specific guidance", icon: Trees },
];

const pageCopy: Record<Exclude<Mode, "home">, { title: string; subtitle: string }> = {
  route: { title: "Find the cooler way there.", subtitle: "Compare routes using the ThermaX routing and thermal APIs." },
  meeting: { title: "Plan around the heat.", subtitle: "Request live guidance from the ThermaX AI backend." },
  interventions: { title: "Turn heat data into city action.", subtitle: "Generate tailored cooling guidance from the ThermaX AI backend." },
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("home");
  const [theme, setTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [city, setCity] = useState<CityId>("Phoenix");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("thermax-theme") as Theme | null;
    const initial = stored === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);

  async function checkHealth() {
    try { setHealth(await getBackendHealth()); setHealthError(false); }
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
      <header className="topbar">
        <button className="app-brand" type="button" onClick={() => changeMode("home")}><span className="app-brand-mark"><SunMedium size={19} /></span><span className="app-brand-copy"><strong>ThermaX</strong><small>Urban heat intelligence</small></span></button>
        <div className="top-actions"><button className={`live-status ${healthError ? "status-error" : ""}`} type="button" onClick={checkHealth} title="Click to check again"><i /> {healthError ? "Backend offline · retry" : health ? health.fortyguard_configured ? "Backend online · heat key loaded" : "Backend online · heat fallback" : "Checking services..."}</button><button className="icon-button" type="button" onClick={changeTheme}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button></div>
        <div className={`mode-switcher ${menuOpen ? "is-open" : ""}`} ref={menuRef}>
          <button className="mode-button" type="button" onClick={() => setMenuOpen((open) => !open)}><span><strong>{selectedMode?.name ?? "Choose a ThermaX tool"}</strong><small>{selectedMode?.description ?? "Urban heat intelligence"}</small></span><ChevronDown size={18} /></button>
          {menuOpen && <div className="mode-menu">{modes.map(({ id, name, description, icon: Icon }) => <button key={id} className={`mode-option ${mode === id ? "selected" : ""}`} type="button" onClick={() => changeMode(id)}><span className="mode-option-icon"><Icon size={17} /></span><span><strong>{name}</strong><small>{description}</small></span><Check className="mode-check" size={16} /></button>)}</div>}
        </div>
      </header>
      <div className="page-content">
        {mode === "home" ? <MainMenu onChoose={changeMode} /> : <><PageHeading mode={mode} city={city} onCityChange={setCity} />{mode === "route" && <RoutePlanner city={city} />}{mode === "meeting" && <MeetingPlanner city={city} />}{mode === "interventions" && <InterventionPlanner city={city} />}</>}
      </div>
    </main>
  );
}

function MainMenu({ onChoose }: { onChoose: (mode: Mode) => void }) {
  return <section className="main-menu"><div className="home-hero"><span className="eyebrow"><Sun size={14} /> Powered by the ThermaX backend</span><h1>What would you like help with?</h1><p>Choose a tool. Results appear only after the backend returns them.</p></div><div className="feature-grid">{modes.map(({ id, name, description, icon: Icon }, index) => <button className={`feature-card feature-${index + 1}`} type="button" key={id} onClick={() => onChoose(id)}><span className="feature-icon"><Icon size={23} /></span><h2>{name}</h2><p>{description}</p><span className="feature-action">Open tool <ArrowRight size={17} /></span></button>)}</div></section>;
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

function RoutePlanner({ city }: { city: CityId }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [selected, setSelected] = useState<RouteId>("original");
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);

  async function analyze() {
    const originCoordinates = parseCoordinates(origin);
    const destinationCoordinates = parseCoordinates(destination);
    if (!originCoordinates || !destinationCoordinates) return setError("Enter each point as longitude, latitude (for example: -112.074, 33.448).");
    if (!isInsideCity(originCoordinates, city) || !isInsideCity(destinationCoordinates, city)) return setError(`Both points must be within ${supportedCities[city].label}. ThermaX currently supports U.S. coverage only.`);
    setError(""); setRequestFailed(false); setLoading(true); setAnalysis(null);
    try {
      const result = await analyzeRoute({ origin: originCoordinates, destination: destinationCoordinates, city, user_preference: "balanced", humidity: 45 });
      setAnalysis(result); setSelected(displayedRecommendedRoute(result));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "The backend request failed."); setRequestFailed(true); }
    finally { setLoading(false); }
  }

  const recommended = analysis ? displayedRecommendedRoute(analysis) : "original";
  const equalRisk = analysis ? analysis.decision.original_route.multi_factor_risk_score === analysis.decision.alternative_route.multi_factor_risk_score : false;
  return <section className="route-layout"><aside className="surface controls-panel"><h2>Plan your walk in {supportedCities[city].label}</h2><Field label="Starting coordinates" icon={<Circle size={15} />} value={origin} onChange={setOrigin} placeholder="longitude, latitude" /><button className="swap-button" type="button" onClick={() => { setOrigin(destination); setDestination(origin); }}><ArrowUpDown size={15} /></button><Field label="Destination coordinates" icon={<MapPin size={16} />} value={destination} onChange={setDestination} placeholder="longitude, latitude" />{error && <ErrorMessage text={error} onRetry={requestFailed ? analyze : undefined} />}<button className="primary-button" type="button" onClick={analyze} disabled={loading}><Sparkles size={16} /> {loading ? "Calling backend..." : "Compare heat-safe routes"}</button><p className="helper"><ShieldCheck size={15} /> Coverage is limited to supported U.S. cities. Options appear only after a successful response.</p>{analysis && <div className="route-options"><h2>{analysis.routes_geojson.features.length} route options</h2><RouteOption id="original" selected={selected} chosen={recommended} equalRisk={equalRisk} metrics={analysis.decision.original_route} distanceMeters={routeDistanceMeters(analysis, "original")} onSelect={setSelected} /><RouteOption id="alternative" selected={selected} chosen={recommended} equalRisk={equalRisk} metrics={analysis.decision.alternative_route} distanceMeters={routeDistanceMeters(analysis, "alternative")} onSelect={setSelected} /><p className="route-rationale"><strong>Why this route?</strong> {equalRisk ? `Both routes have the same heat-risk score, so ThermaX recommends the shorter ${recommended} route.` : `ThermaX recommends the lower-heat-risk ${recommended} route while considering the distance difference.`}</p></div>}</aside><RouteResult analysis={analysis} selected={selected} loading={loading} /></section>;
}

function RouteOption({ id, selected, chosen, equalRisk, metrics, distanceMeters, onSelect }: { id: RouteId; selected: RouteId; chosen: RouteId; equalRisk: boolean; metrics: RouteMetrics; distanceMeters: number | null; onSelect: (id: RouteId) => void }) {
  const recommended = chosen === id;
  return <button className={`route-option ${selected === id ? "selected" : ""} ${recommended ? "recommended-route" : "higher-risk-route"}`} type="button" onClick={() => onSelect(id)}><span className="route-option-head"><span><i className={recommended ? "safe-dot" : "hot-dot"} />{id === "original" ? "Original route" : "Alternative route"}</span><em>{recommended ? "Recommended" : equalRisk ? "Same heat · longer" : "Higher risk"}</em></span><span className="route-metrics"><span>Walk distance<strong>{formatDistance(distanceMeters)}</strong></span><span>Heat segments<strong>{metrics.segments_count}</strong></span><span>Heat risk<strong>{metrics.multi_factor_risk_score.toFixed(1)}</strong></span></span></button>;
}

function RouteResult({ analysis, selected, loading }: { analysis: RouteAnalysis | null; selected: RouteId; loading: boolean }) {
  if (!analysis) return <div className="surface route-map"><div className="map-loading">{loading ? <><span className="spinner" /> Waiting for backend...</> : "Enter coordinates to request real route data."}</div></div>;
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return <MapboxRouteMap key={JSON.stringify(analysis.routes_geojson)} selected={selected} loading={loading} analysis={analysis} />;
  return <div className="surface route-map"><div className="map-insight"><strong>Backend response received</strong><p>{analysis.routes_geojson.features.length} routes and {analysis.thermal_overlay_geojson.features.length} thermal features returned. Add a public Mapbox token to visualize this live GeoJSON.</p></div></div>;
}

function Field({ label, icon, value, onChange, placeholder }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="field"><span>{label}</span><span className="input-wrap">{icon}<input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></span></label>;
}

function ErrorMessage({ text, onRetry }: { text: string; onRetry?: () => void }) { return <div className="field-error" role="alert"><Info size={14} /><span>{text}</span>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>; }

function MeetingPlanner({ city }: { city: CityId }) {
  const [location, setLocation] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (location.trim().length < 3) return setError(`Enter a meeting location in ${supportedCities[city].label}.`);
    if (!meetingTime) return setError("Choose a proposed meeting date and time.");
    const selectedTime = new Date(meetingTime).getTime();
    const now = Date.now();
    if (!Number.isFinite(selectedTime) || selectedTime <= now) return setError("The meeting time must be in the future.");
    if (selectedTime > now + 12 * 60 * 60 * 1000) return setError("FortyGuard forecasts are limited to the next 12 hours.");
    setError(""); setResult(""); setLoading(true);
    try {
      setResult(await askThermax(`Outdoor meeting location: ${location.trim()}, ${supportedCities[city].label}. Proposed time: ${new Date(selectedTime).toLocaleString()}.`, "You are ThermaX's meeting-planning assistant. No verified forecast or FortyGuard measurement is available in this request. Return exactly three short lines, each beginning with one of these labels: Recommendation:, Why:, Next step:. Do not say an earlier or later time is cooler. Do not compare temperatures, invent forecasts, or name specific venues. Recommend checking a verified local forecast and choosing an indoor or shaded backup plan if heat is a concern."));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "The meeting guidance service failed."); }
    finally { setLoading(false); }
  }

  return <section className="two-column-layout"><aside className="surface controls-panel"><h2>Meeting details</h2><Field label={`Location in ${supportedCities[city].label}`} icon={<MapPin size={16} />} value={location} onChange={setLocation} placeholder="Park, address, or landmark" /><label className="field"><span>Proposed date and time</span><input type="datetime-local" value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} /></label>{error && <ErrorMessage text={error} onRetry={submit} />}<button className="primary-button" type="button" onClick={submit} disabled={loading}><CalendarClock size={16} /> {loading ? "Getting guidance..." : "Find a safer meeting option"}</button><p className="helper"><ShieldCheck size={15} /> U.S. supported cities only. Forecast requests cannot exceed 12 hours.</p></aside><div className="results-column">{result ? <AiResult title="Safer meeting guidance" text={result} /> : <div className="surface explanation"><h2>No recommendation yet</h2><p className="helper">Enter a location and a time within the next 12 hours.</p></div>}</div></section>;
}

function InterventionPlanner({ city }: { city: CityId }) {
  const [placeType, setPlaceType] = useState("School");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const placeTypes = ["School", "Bus stop", "Park", "Neighborhood"];
  async function submit() { if (location.trim().length < 3) return setError(`Enter a location in ${supportedCities[city].label}.`); setError(""); setResult(""); setLoading(true); try { setResult(await askThermax(`${placeType} location: ${location.trim()}, ${supportedCities[city].label}.`, "You are ThermaX's urban-cooling advisor. Return exactly three numbered, concise interventions. Each item must include an action and a one-sentence heat-reduction reason. Do not invent local measurements, funding amounts, or implementation status.")); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "The intervention guidance service failed."); } finally { setLoading(false); } }
  return <section className="two-column-layout"><aside className="surface controls-panel"><h2>Choose a location type</h2><div className="place-types">{placeTypes.map((type) => <button key={type} type="button" className={placeType === type ? "selected" : ""} onClick={() => setPlaceType(type)}>{type}</button>)}</div><Field label={`Location in ${supportedCities[city].label}`} icon={<MapPin size={16} />} value={location} onChange={setLocation} placeholder="Address, park, school, or bus stop" />{error && <ErrorMessage text={error} onRetry={submit} />}<button className="primary-button" type="button" onClick={submit} disabled={loading}><Sparkles size={16} /> {loading ? "Getting guidance..." : "Generate cooling ideas"}</button><p className="helper"><ShieldCheck size={15} /> Guidance uses the selected place type and location context.</p></aside><div className="results-column">{result ? <AiResult title={`${placeType} cooling guidance`} text={result} /> : <div className="surface explanation"><h2>No recommendation yet</h2><p className="helper">Choose a place type and enter a location.</p></div>}</div></section>;
}

function AiResult({ title, text }: { title: string; text: string }) { return <div className="recommendation"><div><h2>{title}</h2><span className="status-pill">AI guidance</span></div><div className="ai-response">{text.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line.replace(/^[-•]\s*/, "")}</p>)}</div><p className="helper">This guidance is AI-generated planning support, not a measured FortyGuard result.</p></div>; }
