import json
import math
from shapely.geometry import LineString, shape

class AdvancedThermalRoutingEngine:
    def __init__(self, thermal_geojson, weights=None, temp_range=(15.0, 55.0), heat_index_range=(15.0, 90.0)):
        self.thermal_features = thermal_geojson.get("features", [])
        self.weights = weights or {"temp": 0.5, "heat_index": 0.3, "shade": 0.2}
        self.temp_range = temp_range
        self.heat_index_range = heat_index_range

    USER_PREFERENCE_PRESETS = {
        "shortest_path": 5.0,
        "balanced": 20.0,
        "coolest_path": float("inf"),
    }

    @staticmethod
    def _normalize(value, min_val, max_val):
        if max_val == min_val:
            return 0.0
        normalized = (value - min_val) / (max_val - min_val)
        return max(0.0, min(1.0, normalized))

    def _calculate_heat_index_celsius(self, temp_c, relative_humidity=50):
        temp_f = (temp_c * 9/5) + 32
        hi_f = 0.5 * (temp_f + 61.0 + ((temp_f - 68.0) * 1.2) + (relative_humidity * 0.094))
        if hi_f >= 80:
            hi_f = (-42.379 + 2.04901523 * temp_f + 10.14333127 * relative_humidity
                    - 0.22475541 * temp_f * relative_humidity - 0.00683783 * temp_f**2
                    - 0.05481717 * relative_humidity**2 + 0.00122874 * temp_f**2 * relative_humidity
                    + 0.00085282 * temp_f * relative_humidity**2 - 0.00000199 * temp_f**2 * relative_humidity**2)
        return round((hi_f - 32) * 5/9, 2)

    def _calculate_segment_risk(self, temp, shade_pct, humidity=50):
        heat_index = self._calculate_heat_index_celsius(temp, humidity)
        shade_factor = (100 - shade_pct) / 100.0
        temp_norm = self._normalize(temp, *self.temp_range)
        hi_norm = self._normalize(heat_index, *self.heat_index_range)
        composite_score = (
            (self.weights["temp"] * temp_norm) +
            (self.weights["heat_index"] * hi_norm) +
            (self.weights["shade"] * shade_factor)
        ) * 100
        return round(composite_score, 3), heat_index

    def analyze_mapbox_route(self, mapbox_route_geojson, humidity=50):
        geom_type = mapbox_route_geojson["geometry"]["type"]
        coords = mapbox_route_geojson["geometry"]["coordinates"]
        if geom_type == "LineString":
            route_line = LineString(coords)
        else:
            return {"error": "Unsupported Mapbox geometry type"}
        total_length = route_line.length
        if total_length == 0:
            return {"error": "Invalid route length"}
        segments_analyzed = []
        for feature in self.thermal_features:
            poly = shape(feature["geometry"])
            props = feature["properties"]
            if route_line.intersects(poly):
                intersection = route_line.intersection(poly)
                intersection_len = intersection.length
                temp = props.get("temperature", props.get("surface_temp", 38.0))
                shade = props.get("shade_coverage_pct", props.get("shade_coverage", 20))
                poly_id = props.get("polygon_id", props.get("id", "unknown"))
                risk_score, calculated_hi = self._calculate_segment_risk(temp, shade, humidity)
                segments_analyzed.append({
                    "polygon_id": poly_id,
                    "surface_temp_c": temp,
                    "heat_index_c": calculated_hi,
                    "shade_coverage_pct": shade,
                    "segment_risk_score": risk_score,
                    "length_deg": intersection_len
                })
        total_intersected = sum(s["length_deg"] for s in segments_analyzed)
        if total_intersected > 0:
            final_composite_risk = 0
            for seg in segments_analyzed:
                weight = seg["length_deg"] / total_intersected
                seg["length_weight"] = round(weight, 4)
                final_composite_risk += weight * seg["segment_risk_score"]
            final_score = round(final_composite_risk, 3)
        else:
            final_score = 0.0
        return {
            "total_distance_deg": round(total_length, 6),
            "multi_factor_risk_score": final_score,
            "segments_count": len(segments_analyzed),
            "detailed_segments": segments_analyzed
        }

    def compare_mapbox_routes(self, orig_route_geojson, alt_route_geojson, user_preference="balanced", max_extra_dist_pct=None, humidity=50):
        if max_extra_dist_pct is None:
            if user_preference not in self.USER_PREFERENCE_PRESETS:
                raise ValueError(f"Unknown user_preference: '{user_preference}'.")
            max_extra_dist_pct = self.USER_PREFERENCE_PRESETS[user_preference]
        orig_res = self.analyze_mapbox_route(orig_route_geojson, humidity)
        alt_res = self.analyze_mapbox_route(alt_route_geojson, humidity)
        orig_dist = orig_res["total_distance_deg"]
        alt_dist = alt_res["total_distance_deg"]
        dist_diff_pct = ((alt_dist - orig_dist) / orig_dist) * 100 if orig_dist > 0 else 0
        risk_reduction = round(abs(orig_res["multi_factor_risk_score"] - alt_res["multi_factor_risk_score"]), 3)
        is_alt_selected = (
            alt_res["multi_factor_risk_score"] < orig_res["multi_factor_risk_score"]
            and dist_diff_pct <= max_extra_dist_pct
        )
        return {
            "selected_route": "alternative" if is_alt_selected else "original",
            "user_preference": user_preference,
            "max_allowed_extra_distance_pct": max_extra_dist_pct,
            "extra_distance_pct": round(dist_diff_pct, 2),
            "risk_score_savings": risk_reduction,
            "original_route": orig_res,
            "alternative_route": alt_res
        }