"use client";

import { Layers3, Sparkles } from "lucide-react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
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

export function MapboxRouteMap({
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
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const selectedRef = useRef(selected);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const recommended = analysis ? displayedRecommendedRoute(analysis) : "original";
  const otherRoute: RouteId = recommended === "original" ? "alternative" : "original";

  useEffect(() => {
    if (!token || !containerRef.current) return;
    let cancelled = false;

    async function initializeMap() {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      
      mapboxgl.accessToken = token!;
      
      // Select appropriate Mapbox style based on theme
      const styleUrl = theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [0, 0],
        zoom: 2,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("load", () => {
        if (cancelled) return;

        if (analysis) {
          map.addSource("heat-overlay", { type: "geojson", data: analysis.thermal_overlay_geojson as GeoJSON.FeatureCollection });
          map.addLayer({ id: "heat-fill", type: "fill", source: "heat-overlay", paint: { "fill-color": ["interpolate", ["linear"], ["coalesce", ["get", "temperature"], ["get", "surface_temp"], 35], 20, "#f3d094", 50, "#e56b58"], "fill-opacity": 0.38 } });
          map.addLayer({ id: "heat-outline", type: "line", source: "heat-overlay", paint: { "line-color": "#d57b68", "line-opacity": 0.45, "line-width": 1 } });
          map.addSource("routes", { type: "geojson", data: analysis.routes_geojson as GeoJSON.FeatureCollection });
          map.addLayer({ id: "original-route", type: "line", source: "routes", filter: ["==", ["get", "type"], "original"], paint: { "line-color": recommended === "original" ? "#017360" : "#e56b58", "line-width": selectedRef.current === "original" ? 7 : 5, "line-opacity": selectedRef.current === "original" ? 1 : 0.35, ...(recommended === "original" ? {} : { "line-dasharray": [1.5, 1.3] }) }, layout: { "line-cap": "round", "line-join": "round" } });
          map.addLayer({ id: "alternative-route", type: "line", source: "routes", filter: ["==", ["get", "type"], "alternative"], paint: { "line-color": recommended === "alternative" ? "#017360" : "#e56b58", "line-width": selectedRef.current === "alternative" ? 7 : 5, "line-opacity": selectedRef.current === "alternative" ? 1 : 0.35, ...(recommended === "alternative" ? {} : { "line-dasharray": [1.5, 1.3] }) }, layout: { "line-cap": "round", "line-join": "round" } });

          const bounds = new mapboxgl.LngLatBounds();
          analysis.routes_geojson.features.forEach((feature) => {
            if (feature.geometry.type === "LineString") (feature.geometry.coordinates as [number, number][]).forEach((coordinate) => bounds.extend(coordinate));
          });
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 0 });

          const firstRoute = analysis.routes_geojson.features[0];
          const coordinates = firstRoute?.geometry.type === "LineString" ? firstRoute.geometry.coordinates as [number, number][] : [];
          
          markersRef.current = [
            ...(coordinates[0] ? [new mapboxgl.Marker({ color: "#017360" }).setLngLat(coordinates[0]).addTo(map)] : []),
            ...(coordinates.at(-1) ? [new mapboxgl.Marker({ color: "#e56b58" }).setLngLat(coordinates.at(-1)!).addTo(map)] : []),
          ];
        } else {
          // Fit city bounds initially
          const cityBounds = supportedCities[city]?.bounds;
          if (cityBounds) {
            const bounds = new mapboxgl.LngLatBounds([cityBounds[0], cityBounds[1]], [cityBounds[2], cityBounds[3]]);
            map.fitBounds(bounds, { padding: 50, duration: 0 });
          }
        }
      });
    }

    initializeMap();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token, analysis, city, theme, recommended]);

  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !analysis) return;
    map.setPaintProperty("alternative-route", "line-opacity", selected === "alternative" ? 1 : 0.35);
    map.setPaintProperty("alternative-route", "line-width", selected === "alternative" ? 7 : 5);
    map.setPaintProperty("original-route", "line-opacity", selected === "original" ? 1 : 0.35);
    map.setPaintProperty("original-route", "line-width", selected === "original" ? 7 : 5);
  }, [selected, analysis]);

  return (
    <div className="surface route-map mapbox-map" aria-label="Route and live heat map">
      <div ref={containerRef} className="mapbox-container" />
      {loading && <div className="map-loading"><span className="spinner" /> Analyzing heat exposure...</div>}
      
      <span className="map-chip"><Layers3 size={15} /><b>FortyGuard Heatmap</b> · Mapbox Tiles</span>
      
      {analysis && (
        <>
          <div className="map-insight">
            <strong><Sparkles size={15} /> Live Thermal Analysis</strong>
            <p>{analysis.decision.risk_score_savings.toFixed(2)} risk points saved; alternative distance change {analysis.decision.extra_distance_pct.toFixed(1)}%.</p>
          </div>
          <div className="map-legend">
            <span><i className="safe-key" /> Recommended ({recommended})</span>
            <span><i className="hot-key" /> Higher risk ({otherRoute})</span>
            <b>FortyGuard data</b>
          </div>
        </>
      )}
    </div>
  );
}
