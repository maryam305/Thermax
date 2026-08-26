import json
from thermal_overlay_engine import AdvancedThermalRoutingEngine

# 1. Read Mock Thermal GeoJSON
with open("mock_thermal_data.json", "r", encoding="utf-8") as f:
    thermal_data = json.load(f)

# 2. Define test Mapbox routes
mapbox_original = {
    "type": "Feature",
    "geometry": {
        "type": "LineString",
        "coordinates": [
            [-112.0760, 33.4485],
            [-112.0680, 33.4485]
        ]
    }
}

mapbox_alternative = {
    "type": "Feature",
    "geometry": {
        "type": "LineString",
        "coordinates": [
            [-112.0760, 33.4485],
            [-112.0760, 33.4505],
            [-112.0680, 33.4485]
        ]
    }
}

# 3. Run engine and test result (User can choose: shortest_path / balanced / coolest_path)
engine = AdvancedThermalRoutingEngine(thermal_data)
output = engine.compare_mapbox_routes(
    mapbox_original, mapbox_alternative,
    user_preference="balanced",  # Try "shortest_path" or "coolest_path" to see the difference
    humidity=45
)

print("--- Multi-Factor Mapbox Routing Decision Output ---")
print(json.dumps(output, indent=2))