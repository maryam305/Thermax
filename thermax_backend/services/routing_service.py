from typing import Any, Dict, List, Tuple
import requests


def get_real_mapbox_routes(
    origin: List[float], destination: List[float]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
  """يجلب مسارات المشاة باستخدام سيرفر OSRM مع التغلب على خطأ IndexOutofRange."""
  coords = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
  url = f"http://router.project-osrm.org/route/v1/foot/{coords}"

  params = {
      "overview": "full",
      "geometries": "geojson",
      "alternatives": "true",
      "steps": "true",
  }

  try:
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    routes = data.get("routes", [])

    # التأكد من وجود مسارات أرجعت من السيرفر
    if not routes or len(routes) == 0:
      raise IndexError("لم يتم العثور على أي مسار بين النقطتين.")

    # المسار الرئيسي
    orig_route = {
        "type": "Feature",
        "geometry": routes[0]["geometry"],
        "properties": {"distance": routes[0]["distance"], "type": "original"},
    }

    # فحص أمان للمسار البديل بدلاً من الوصول المباشر لـ routes[1]
    if len(routes) > 1:
      alt_route_data = routes[1]
    else:
      alt_route_data = routes[0]

    alt_route = {
        "type": "Feature",
        "geometry": alt_route_data["geometry"],
        "properties": {
            "distance": alt_route_data["distance"],
            "type": "alternative",
        },
    }

    return orig_route, alt_route

  except Exception as e:
    print(f"Routing Error: {e}")
    # مسار احتياطي لتجنب توقف API الهاكاثون
    return _get_fallback_routes(origin, destination)


def _get_fallback_routes(
    origin: List[float], destination: List[float]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
  """إنشاء مسارات افتراضية في حال عدم توفر تغطية للمنطقة"""
  orig_route = {
      "type": "Feature",
      "geometry": {
          "type": "LineString",
          "coordinates": [
              origin,
              [(origin[0] + destination[0]) / 2, origin[1]],
              destination,
          ],
      },
      "properties": {"distance": 1000.0, "type": "original"},
  }
  alt_route = {
      "type": "Feature",
      "geometry": {
          "type": "LineString",
          "coordinates": [
              origin,
              [origin[0], (origin[1] + destination[1]) / 2],
              destination,
          ],
      },
      "properties": {"distance": 1200.0, "type": "alternative"},
  }
  return orig_route, alt_route