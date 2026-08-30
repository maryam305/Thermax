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
        return _get_fallback_thermal_geojson(bbox)

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
    }

    try:
        # 1. Start heatmap generation
        response = requests.post(
            f"{FORTYGUARD_BASE_URL}/heatmap",
            json=payload,
            headers=headers,
            timeout=10,
        )

        response.raise_for_status()

        response_data = response.json()
        activity_id = response_data.get("data", {}).get("activity_id")

        if not activity_id:
            raise ValueError(
                f"FortyGuard did not return activity_id: "
                f"{response_data}"
            )

        # 2. Poll for the result
        for _ in range(30):
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

            # 3. Job completed
            if status in {
                "COMPLETED",
                "COMPLETE",
                "SUCCESS",
                "SUCCEEDED",
            }:

                # Try the expected GeoJSON fields
                result = task_data.get("result", {})
                geojson = (
                    result.get("map_data")
                    or result.get("geojson_result")
                    or result.get("geojson")
                    or data.get("geojson_result")
                )

                if isinstance(geojson, str):
                    geojson = json.loads(geojson)

                if isinstance(geojson, dict) and "geojson" in geojson:
                    geojson = geojson["geojson"]

                if geojson:
                    return _normalize_fortyguard_tiles(geojson)

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

        return _get_fallback_thermal_geojson(bbox)


def _normalize_fortyguard_tiles(geojson: dict) -> dict:
    """Adapt FortyGuard heatmap tile properties for the routing engine."""
    for feature in geojson.get("features", []):
        properties = feature.setdefault("properties", {})
        temperature = properties.get(
            "average_temperature",
            properties.get("temperature", properties.get("surface_temp", 38.0)),
        )
        properties["temperature"] = float(temperature)
        properties.setdefault("surface_temp", float(temperature))
        properties.setdefault("shade_coverage_pct", 20.0)
        properties.setdefault("polygon_id", str(properties.get("tile_id", "unknown")))
    return geojson


def _get_fallback_thermal_geojson(bbox: list) -> dict:
    """
    Fallback thermal GeoJSON used if FortyGuard is unavailable.
    """

    min_x, min_y, max_x, max_y = bbox

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [min_x, min_y],
                        [max_x, min_y],
                        [max_x, max_y],
                        [min_x, max_y],
                        [min_x, min_y],
                    ]],
                },
                "properties": {
                    "polygon_id": "poly_zone_1",
                    "surface_temp": 42.5,
                    "shade_coverage": 15.0,
                    "temperature": 42.5,
                    "shade_coverage_pct": 15.0,
                },
            }
        ],
    }
