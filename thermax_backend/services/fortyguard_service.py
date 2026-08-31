import os
import time
import json
from datetime import datetime
from zoneinfo import ZoneInfo
import requests

FORTYGUARD_API_KEY = os.getenv("FORTYGUARD_API_KEY", "")
FORTYGUARD_BASE_URL = os.getenv(
    "FORTYGUARD_BASE_URL",
    "https://api.fortyguard.com/v1"
)


def get_live_fortyguard_thermal_geojson(
    bbox: list,
    city: str = "Phoenix"
) -> dict:
    """
    Fetch thermal/shade data from FortyGuard API.

    Flow:
    1. POST /v1/heatmap
    2. Receive activity_id
    3. Poll GET /v1/status/{activity_id}
    4. Return the resulting heatmap GeoJSON

    Falls back to mock GeoJSON if the API is unavailable.
    """

    if not FORTYGUARD_API_KEY:
        print(
            "Warning: FORTYGUARD_API_KEY is missing. "
            "Using fallback thermal data."
        )
        return _get_fallback_thermal_geojson(bbox, city)

    # FortyGuard requires api-key header
    headers = {
        "api-key": FORTYGUARD_API_KEY,
        "Content-Type": "application/json",
    }

    min_x, min_y, max_x, max_y = bbox
    # Use the selected coverage city's local time, never the computer's time.
    city_timezones = {
        "phoenix": "America/Phoenix",
        "houston": "America/Chicago",
        "miami": "America/New_York",
        "new york": "America/New_York",
        "san jose": "America/Los_Angeles",
    }
    timezone_name = city_timezones.get(city.strip().lower(), "America/Phoenix")
    now = datetime.now(ZoneInfo(timezone_name))
    payload = {
        "polygon_aoi": {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [min_x, min_y], [max_x, min_y], [max_x, max_y],
                        [min_x, max_y], [min_x, min_y]
                    ]]
                }
            }]
        },
        "date_time": {
            "start_date": now.strftime("%Y-%m-%d"),
            "filter_type": 3,
        },
        "granularity": 100,
        "analytic_type": "tcm",
    }

    try:
        # 1. Start heatmap generation
        print(f"[FortyGuard] Requesting heatmap for bbox={bbox}, city={city}")
        response = requests.post(
            f"{FORTYGUARD_BASE_URL}/heatmap",
            json=payload,
            headers=headers,
            timeout=15,
        )

        response.raise_for_status()

        response_data = response.json()
        activity_id = response_data.get("data", {}).get("activity_id")

        if not activity_id:
            raise ValueError(
                f"FortyGuard did not return activity_id: "
                f"{response_data}"
            )

        print(f"[FortyGuard] Got activity_id: {activity_id}")

        # 2. Poll for the result
        for attempt in range(30):
            time.sleep(2)

            poll_res = requests.get(
                f"{FORTYGUARD_BASE_URL}/status/{activity_id}",
                headers=headers,
                timeout=10,
            )

            poll_res.raise_for_status()

            data = poll_res.json()
            task_data = data.get("data", {})
            status = str(task_data.get("status", "")).upper()

            print(f"[FortyGuard] Poll attempt {attempt+1}: status={status}")

            # 3. Job completed
            if status in {
                "COMPLETED",
                "COMPLETE",
                "SUCCESS",
                "SUCCEEDED",
            }:

                result = task_data.get("result", {})

                # FortyGuard returns the heatmap tiles under 'map_data'
                geojson = (
                    result.get("map_data")
                    or result.get("geojson_result")
                    or result.get("geojson")
                    or data.get("geojson_result")
                    or data.get("map_data")
                )

                if isinstance(geojson, str):
                    geojson = json.loads(geojson)

                if isinstance(geojson, dict) and "geojson" in geojson:
                    geojson = geojson["geojson"]

                if geojson:
                    features = geojson.get("features", [])
                    print(
                        f"[FortyGuard] Received {len(features)} thermal tiles"
                    )
                    # Log a sample tile for debugging
                    if features:
                        sample_props = features[0].get("properties", {})
                        print(
                            f"[FortyGuard] Sample tile properties: "
                            f"{json.dumps(sample_props, indent=2)}"
                        )
                    return _normalize_fortyguard_tiles(geojson)

                # Log the full response for debugging when no GeoJSON found
                print(
                    f"[FortyGuard] Completed but no GeoJSON found. "
                    f"Result keys: {list(result.keys()) if isinstance(result, dict) else 'N/A'}"
                )
                print(
                    f"[FortyGuard] Full data keys: "
                    f"{list(data.keys()) if isinstance(data, dict) else 'N/A'}"
                )
                raise ValueError(
                    f"FortyGuard completed but returned no GeoJSON: "
                    f"{data}"
                )

            # Job failed
            if status in {
                "FAILED",
                "ERROR",
                "CANCELLED",
            }:
                raise RuntimeError(
                    f"FortyGuard heatmap job failed: {data}"
                )

        # 4. Polling timeout
        raise TimeoutError(
            f"FortyGuard heatmap job {activity_id} "
            "did not complete within the polling window."
        )

    except Exception as e:
        print(
            f"FortyGuard API Error: {e}. "
            "Falling back to dynamic mock overlay."
        )

        return _get_fallback_thermal_geojson(bbox, city)


def _normalize_fortyguard_tiles(geojson: dict) -> dict:
    """
    Adapt FortyGuard heatmap tile properties for the routing engine.

    FortyGuard returns tiles with a 'value' property (temperature in °C).
    This function maps that to the field names the thermal engine expects:
      - temperature / surface_temp
      - shade_coverage_pct (estimated from temperature)
      - polygon_id
    """
    for idx, feature in enumerate(geojson.get("features", [])):
        properties = feature.setdefault("properties", {})

        # FortyGuard uses 'value' as the temperature field (°C).
        # Fall through legacy field names for backward compatibility.
        temperature = properties.get(
            "value",
            properties.get(
                "average_temperature",
                properties.get(
                    "temperature",
                    properties.get("surface_temp", 38.0)
                ),
            ),
        )
        temperature = float(temperature)
        properties["temperature"] = temperature
        properties["surface_temp"] = temperature

        # FortyGuard does NOT return shade data directly.
        # Estimate shade coverage from temperature using a heuristic:
        #   - Cooler tiles (≤25°C) → ~60% shade (shaded areas are cooler)
        #   - Hot tiles (≥50°C) → ~5% shade (exposed surfaces)
        #   - Linear interpolation between these bounds
        if "shade_coverage_pct" not in properties and "shade_coverage" not in properties:
            shade_estimate = _estimate_shade_from_temperature(temperature)
            properties["shade_coverage_pct"] = shade_estimate
        else:
            properties.setdefault(
                "shade_coverage_pct",
                properties.get("shade_coverage", 20.0),
            )

        properties.setdefault(
            "polygon_id",
            str(properties.get("tile_id", f"tile_{idx}")),
        )

    return geojson


def _estimate_shade_from_temperature(temp_c: float) -> float:
    """
    Heuristic: estimate shade coverage percentage from surface temperature.

    Rationale: FortyGuard's temperature model already accounts for shading
    effects — shaded tiles report lower temperatures. We reverse-engineer
    an approximate shade value so the risk engine's shade factor is
    meaningful rather than a flat 20% default.

    Mapping:
      ≤25°C  →  60% shade
      ≥50°C  →   5% shade
      Linear interpolation in between.
    """
    COOL_TEMP = 25.0
    HOT_TEMP = 50.0
    MAX_SHADE = 60.0
    MIN_SHADE = 5.0

    if temp_c <= COOL_TEMP:
        return MAX_SHADE
    if temp_c >= HOT_TEMP:
        return MIN_SHADE

    # Linear interpolation: cooler → more shade
    ratio = (temp_c - COOL_TEMP) / (HOT_TEMP - COOL_TEMP)
    shade = MAX_SHADE - ratio * (MAX_SHADE - MIN_SHADE)
    return round(shade, 1)


def _get_fallback_thermal_geojson(bbox: list, city: str = "Phoenix") -> dict:
    """
    Fallback thermal GeoJSON used if FortyGuard is unavailable.
    Generates a 3×3 grid of tiles with temperatures that vary based on:
      - Time of day (peak heat at ~14:00-15:00 local time)
      - City baseline (Phoenix hotter than New York)
      - Small random perturbation so each request isn't identical
    """
    import random
    import math

    min_x, min_y, max_x, max_y = bbox
    dx = (max_x - min_x) / 3
    dy = (max_y - min_y) / 3

    # City-specific baseline temperatures (°C at peak hour)
    city_baselines = {
        "Phoenix": 46.0,
        "Houston": 40.0,
        "Miami": 38.0,
        "New York": 35.0,
        "San Jose": 33.0,
    }
    base_temp = city_baselines.get(city, 40.0)

    # Time-of-day adjustment: use a sine curve peaking at ~14:30 local time
    city_timezones = {
        "Phoenix": "America/Phoenix",
        "Houston": "America/Chicago",
        "Miami": "America/New_York",
        "New York": "America/New_York",
        "San Jose": "America/Los_Angeles",
    }
    tz_name = city_timezones.get(city, "America/Phoenix")
    try:
        now = datetime.now(ZoneInfo(tz_name))
    except Exception:
        now = datetime.now()
    hour_decimal = now.hour + now.minute / 60.0
    # Sine wave: peaks at 14.5 (2:30 PM), trough at 2:30 AM
    time_factor = math.sin(math.pi * (hour_decimal - 2.5) / 12.0)
    time_factor = max(time_factor, 0.0)  # clamp nighttime to 0
    # At night → base_temp - 14°C, at peak → base_temp
    effective_base = base_temp - 14.0 + 14.0 * time_factor

    # Spatial variation offsets (°C) — hotter in NW, cooler in SE
    spatial_offsets = [
        [+3.0, +1.0, -2.0],
        [+1.5, -0.5, -3.5],
        [-1.0, -2.5, -5.0],
    ]

    features = []
    for row in range(3):
        for col in range(3):
            x0 = min_x + col * dx
            y0 = min_y + row * dy
            x1 = x0 + dx
            y1 = y0 + dy

            # Add spatial offset + small random jitter (±1.5°C)
            jitter = random.uniform(-1.5, 1.5)
            temp = round(effective_base + spatial_offsets[row][col] + jitter, 1)
            shade = _estimate_shade_from_temperature(temp)

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [x0, y0], [x1, y0], [x1, y1],
                        [x0, y1], [x0, y0],
                    ]],
                },
                "properties": {
                    "polygon_id": f"fallback_r{row}_c{col}",
                    "surface_temp": temp,
                    "shade_coverage": shade,
                    "temperature": temp,
                    "shade_coverage_pct": shade,
                },
            })

    return {"type": "FeatureCollection", "features": features}
