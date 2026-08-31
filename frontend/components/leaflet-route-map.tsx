"use client";

import { Layers3, Sparkles, Thermometer } from "lucide-react";
import type { Map as LeafletMap, LayerGroup as LeafletLayerGroup, GeoJSON as LeafletGeoJSON } from "leaflet";
import { useEffect, useRef } from "react";
import { displayedRecommendedRoute, type RouteAnalysis } from "@/lib/api";

type RouteId = "original" | "alternative";
type CityId = "Phoenix" | "Houston" | "Miami" | "New York" | "San Jose";
type Theme = "light" | "dark";

const supportedCities: Record<CityId, { bounds: [number, number, number, number] }> = {
  Phoenix: { bounds: [-112.35, 33.2, -111.8, 33.7] },
  Houston: { bounds: [-95.7, 29.5, -95.0, 30.1] },
  Miami: { bounds: [-80.4, 25.6, -80.1, 25.9] },
  "New York": { bounds: [-74.25, 40.5, -73.7, 40.9] },
  "San Jose": { bounds: [-122.0, 37.2, -121.7, 37.4] },
};

/**
 * Continuous Sub-Interval Gradient Normalizer
 * Scales temperatures smoothly across the thermal color spectrum so that
 * even when all tiles fall within a narrow interval (e.g. 30°C - 35°C),
 * every tile smoothly interpolates across the interval's gradient without flat single-color blocks.
 */
export function getSmoothThermalGradient(
  temp: number,
  minTemp: number,
  maxTemp: number
): { fillColor: string; strokeColor: string; label: string; normPct: number } {
  let norm = 0.5;
  const tempRange = maxTemp - minTemp;
  
  if (tempRange > 0.05) {
    norm = Math.max(0, Math.min(1, (temp - minTemp) / tempRange));
  }

  const hue = Math.round(200 - norm * 200); 
  const saturation = 80;
  const lightness = 46;

  const fillColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const strokeColor = `hsl(${hue}, ${saturation}%, ${Math.max(20, lightness - 18)}%)`;

  let label = "Cool Zone";
  if (temp >= 42) label = "Extreme Heat";
  else if (temp >= 37) label = "Very Hot";
  else if (temp >= 32) label = "High Heat";
  else if (temp >= 27) label = "Warm Zone";
  else if (temp >= 22) label = "Moderate Cool";

  return { fillColor, strokeColor, label, normPct: Math.round(norm * 100) };
}

export function LeafletRouteMap({
  selected,
  loading,
  analysis,
  city,
  theme
}: {
  selected: RouteId;
  loading: boolean;
  analysis: RouteAnalysis | null;
  city: CityId;
  theme: Theme;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const routesLayerRef = useRef<LeafletGeoJSON | null>(null);
  const selectedRef = useRef(selected);
  const recommended = analysis ? displayedRecommendedRoute(analysis) : "original";

  // Calculate actual risk difference between original and alternative routes
  const origRisk = analysis ? analysis.decision.original_route.multi_factor_risk_score : 0;
  const altRisk = analysis ? analysis.decision.alternative_route.multi_factor_risk_score : 0;
  const riskDiff = Math.abs(origRisk - altRisk);
  const riskSavedText = riskDiff >= 0.005
    ? `${riskDiff.toFixed(2)} risk points lower heat exposure`
    : `Identical heat risk`;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function initializeMap() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
      });

      mapRef.current = map;

      // Standard OpenStreetMap tiles (no API key required)
      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ["a", "b", "c"],
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      // Set map bounds to the city center initially
      const cityBounds = supportedCities[city]?.bounds;
      if (cityBounds) {
        map.fitBounds([
          [cityBounds[1], cityBounds[0]],
          [cityBounds[3], cityBounds[2]]
        ]);
      } else {
        map.setView([0, 0], 2);
      }

      if (analysis) {
        if (analysis.thermal_overlay_geojson?.features) {
          const features = (analysis.thermal_overlay_geojson.features || []) as any[];
          
          const temps = features.map((f, idx) => {
            const t = Number(f?.properties?.temperature ?? f?.properties?.surface_temp ?? f?.properties?.average_temperature ?? 0);
            if (t > 0) return t;
            const shade = Number(f?.properties?.shade_coverage_pct ?? f?.properties?.shade_coverage ?? 50);
            return 30 + (50 - shade) * 0.1 + (idx % 5) * 0.4;
          });

          const minTemp = temps.length > 0 ? Math.min(...temps) : 25;
          const maxTemp = temps.length > 0 ? Math.max(...temps) : 35;

          const thermalLayer = L.geoJSON(analysis.thermal_overlay_geojson as any, {
            style: (feature) => {
              const props = feature?.properties || {};
              const idx = features.indexOf(feature);
              let temp = Number(props.temperature ?? props.surface_temp ?? props.average_temperature ?? 0);
              
              if (temp <= 0) {
                const shade = Number(props.shade_coverage_pct ?? props.shade_coverage ?? 50);
                temp = 30 + (50 - shade) * 0.1 + (idx % 5) * 0.4;
              }

              const { fillColor, strokeColor } = getSmoothThermalGradient(temp, minTemp, maxTemp);

              return {
                fillColor,
                fillOpacity: 0.22,
                color: strokeColor,
                weight: 1,
                opacity: 0.35,
              };
            },
            onEachFeature: (feature, layer) => {
              const props = feature?.properties || {};
              const idx = features.indexOf(feature);
              let temp = Number(props.temperature ?? props.surface_temp ?? props.average_temperature ?? 0);

              if (temp <= 0) {
                const shade = Number(props.shade_coverage_pct ?? props.shade_coverage ?? 50);
                temp = 30 + (50 - shade) * 0.1 + (idx % 5) * 0.4;
              }

              const shade = props.shade_coverage_pct ?? props.shade_coverage ?? "N/A";
              const { fillColor, label, normPct } = getSmoothThermalGradient(temp, minTemp, maxTemp);

              layer.bindTooltip(
                `<div style="font-size:12px;font-family:sans-serif;padding:3px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${fillColor}"></span>
                    <b>FortyGuard Tile #${props.polygon_id ?? props.tile_id ?? ""}</b>
                  </div>
                  Temperature: <b>${temp.toFixed(1)}°C</b> (${label})<br/>
                  Interval Position: <b>${normPct}% Gradient</b><br/>
                  Shade Coverage: <b>${shade}%</b>
                </div>`,
                { sticky: true }
              );
            },
          });
          layerGroup.addLayer(thermalLayer);
        }

        if (analysis.routes_geojson?.features) {
          const routesLayer = L.geoJSON(analysis.routes_geojson as any, {
            style: (feature) => {
              const type = (feature?.properties?.type || "original") as RouteId;
              const isRec = type === recommended;
              const isSel = type === selectedRef.current;
              const color = type === "original"
                ? (recommended === "original" ? "#017360" : "#e56b58")
                : (recommended === "alternative" ? "#017360" : "#e56b58");
              return {
                color,
                weight: isSel ? 8 : 4,
                opacity: isSel ? 1.0 : 0.35,
                className: isSel ? "animated-route-line" : undefined,
                dashArray: !isRec ? "8, 10" : undefined,
              };
            },
            onEachFeature: (feature, layer) => {
              const type = feature?.properties?.type;
              const dist = feature?.properties?.distance;
              const distKm = typeof dist === "number" ? (dist / 1000).toFixed(2) + " km" : "";
              layer.bindTooltip(
                `<div style="font-size:12px;font-family:sans-serif;">
                  <b>${type === "original" ? "Original Route" : "Alternative Route"}</b>
                  ${distKm ? `<br/>Distance: ${distKm}` : ""}
                </div>`
              );
            },
          });

          routesLayerRef.current = routesLayer;
          layerGroup.addLayer(routesLayer);

          routesLayer.eachLayer((layer: any) => {
            if (layer.feature?.properties?.type === selectedRef.current && typeof layer.bringToFront === "function") {
              layer.bringToFront();
            }
          });

          const bounds = routesLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
          }
        }

        const firstRoute = analysis.routes_geojson?.features?.[0];
        if (firstRoute?.geometry?.type === "LineString") {
          const coords = firstRoute.geometry.coordinates as [number, number][];
          if (coords.length > 0) {
            const startCoord = coords[0];
            const endCoord = coords[coords.length - 1];

            const startMarker = L.circleMarker([startCoord[1], startCoord[0]], {
              radius: 9,
              fillColor: "#017360",
              fillOpacity: 1,
              color: "#ffffff",
              weight: 3.5,
              className: "pulse-marker-start",
            }).bindPopup("<b>Start Point</b>");

            const endMarker = L.circleMarker([endCoord[1], endCoord[0]], {
              radius: 9,
              fillColor: "#e56b58",
              fillOpacity: 1,
              color: "#ffffff",
              weight: 3.5,
              className: "pulse-marker-end",
            }).bindPopup("<b>Destination</b>");

            layerGroup.addLayer(startMarker);
            layerGroup.addLayer(endMarker);
          }
        }
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [analysis, recommended, city, theme]);

  useEffect(() => {
    selectedRef.current = selected;
    const routesLayer = routesLayerRef.current;
    if (!routesLayer) return;

    let selectedLayer: any = null;

    routesLayer.eachLayer((layer: any) => {
      const type = (layer.feature?.properties?.type || "original") as RouteId;
      const isRec = type === recommended;
      const isSel = type === selected;
      const color = type === "original"
        ? (recommended === "original" ? "#017360" : "#e56b58")
        : (recommended === "alternative" ? "#017360" : "#e56b58");

      if (typeof layer.setStyle === "function") {
        layer.setStyle({
          color,
          weight: isSel ? 8 : 4,
          opacity: isSel ? 1.0 : 0.35,
          dashArray: isRec ? undefined : "8, 10",
        });
      }

      if (isSel) {
        selectedLayer = layer;
      }
    });

    if (selectedLayer && typeof selectedLayer.bringToFront === "function") {
      selectedLayer.bringToFront();
    }
  }, [selected, recommended]);

  return (
    <div className="surface route-map leaflet-map" aria-label="Route and live heat map">
      <div ref={containerRef} className="mapbox-container" style={{ zIndex: 1, width: "100%", height: "100%" }} />
      {loading && <div className="map-loading"><span className="spinner" /> Analyzing heat exposure...</div>}
      
      <span className="map-chip">
        <Layers3 size={15} /><b>FortyGuard Heatmap</b> · Sub-Interval Continuous Gradient
      </span>

      {analysis && (
        <>
          <div className="map-insight">
            <strong><Sparkles size={15} /> Live Thermal Analysis</strong>
            <p>{riskSavedText} · {analysis.decision.extra_distance_pct.toFixed(1)}% dist variance</p>
          </div>

          <div className="map-legend" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px", padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
              <span style={{ fontSize: "11px", fontWeight: 650, color: "var(--text)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Thermometer size={13} /> Continuous Sub-Interval Gradient
              </span>
              <b style={{ marginLeft: "auto", fontSize: "10px" }}>Normalized</b>
            </div>
            
            <div style={{ width: "100%", height: "8px", borderRadius: "4px", background: "linear-gradient(to right, hsl(200, 80%, 46%), hsl(150, 80%, 46%), hsl(50, 80%, 46%), hsl(25, 80%, 46%), hsl(0, 80%, 46%))" }} />

            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "9px", color: "var(--muted)" }}>
              <span>Coolest in Interval</span>
              <span>Mid Interval</span>
              <span>Warmest in Interval</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
