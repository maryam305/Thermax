import os
import time
import requests

FORTYGUARD_API_KEY = os.getenv("FORTYGUARD_API_KEY", "")
FORTYGUARD_BASE_URL = os.getenv("FORTYGUARD_BASE_URL", "https://api.fortyguard.com/v1")

def get_live_fortyguard_thermal_geojson(bbox: list, city: str = "Phoenix") -> dict:
    """
    جلب بيانات الحرارة والتظليل من FortyGuard API مع وجود fallback آلي لمنع خطأ 500.
    """
    if not FORTYGUARD_API_KEY:
        print("Warning: FORTYGUARD_API_KEY is missing. Using fallback thermal data.")
        return _get_fallback_thermal_geojson(bbox)

    headers = {
        "Authorization": f"Bearer {FORTYGUARD_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "bbox": bbox,
        "city": city,
        "metrics": ["surface_temp", "shade_coverage"]
    }

    try:
        response = requests.post(f"{FORTYGUARD_BASE_URL}/heat-intelligence/jobs", json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        activity_id = response.json().get("activity_id")

        for _ in range(15): # Polling لمسابقة الهاكاثون
            time.sleep(1)
            poll_res = requests.get(f"{FORTYGUARD_BASE_URL}/heat-intelligence/jobs/{activity_id}", headers=headers, timeout=10)
            poll_res.raise_for_status()
            data = poll_res.json()
            if data.get("status") == "COMPLETED":
                return data.get("geojson_result", _get_fallback_thermal_geojson(bbox))

    except Exception as e:
        print(f"FortyGuard API Error: {e}. Falling back to dynamic mock overlay.")
        return _get_fallback_thermal_geojson(bbox)

    return _get_fallback_thermal_geojson(bbox)


def _get_fallback_thermal_geojson(bbox: list) -> dict:
    """مضلعات حرارية تغطي النطاق المطلوب لاختبار المحرك دون انقطاع"""
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
                        [min_x, min_y]
                    ]]
                },
                "properties": {
                    "polygon_id": "poly_zone_1",
                    "surface_temp": 42.5,
                    "shade_coverage": 15.0,
                    "temperature": 42.5,
                    "shade_coverage_pct": 15.0
                }
            }
        ]
    }