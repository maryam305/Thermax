# ThermaX - Member 1 Final Execution Toolkit (Multi-Factor & Mapbox Ready)

This toolkit provides a multi-factor thermal overlay and routing optimization engine. It evaluates Mapbox navigation routes against environmental thermal polygon data, calculating composite heat risk scores based on surface temperature, calculated heat index, and shade coverage.

---

## 📋 Table of Contents
1. [Package Contents](#-package-contents)
2. [Quick Start & Execution](#-quick-start--execution)
3. [Mathematical Model & Risk Scoring](#-mathematical-model--risk-scoring)
4. [User Preference Presets](#-user-preference-presets)
5. [Input Data Specifications & JSON Schemas](#-input-data-specifications--json-schemas)
   - [1. Thermal Polygon GeoJSON Input (`mock_thermal_data.json`)](#1-thermal-polygon-geojson-input-mock_thermal_datajson)
   - [2. Mapbox Route GeoJSON Input](#2-mapbox-route-geojson-input)
6. [Output Data Specifications & JSON Schema](#-output-data-specifications--json-schema)
   - [1. Route Decision Output Structure](#1-route-decision-output-structure)
   - [2. Detailed Example Output JSON](#2-detailed-example-output-json)

---

## 📦 Package Contents
- `thermal_overlay_engine.py`: Core routing and thermal risk evaluation engine (`AdvancedThermalRoutingEngine`).
- `test_comparator.py`: Route comparison test script evaluating original vs. alternative routes.
- `mock_thermal_data.json`: GeoJSON dataset containing multi-factor thermal polygon zones for Phoenix, AZ.
- `requirements.txt`: Python package dependencies (`shapely`).
- `README.md`: System documentation and API reference.

---

## 🚀 Quick Start & Execution

```bash
# 1. Initialize virtual environment
python -m venv .venv

# 2. Activate virtual environment
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run test comparator
python test_comparator.py
```

---

## 🧮 Mathematical Model & Risk Scoring

Each intersected segment calculates a normalized composite risk score ($0 - 100$) using three environmental factors:

1. **Surface Temperature Normalization**:
   $$\text{temp\_norm} = \text{clamp}\left(\frac{T - T_{\min}}{T_{\max} - T_{\min}}, 0, 1\right)$$
   *(Default range: $15.0^\circ\text{C}$ to $55.0^\circ\text{C}$)*

2. **Steadman Heat Index Calculation & Normalization**:
   Calculates Heat Index ($HI$) from surface temperature ($T^\circ\text{C}$) and relative humidity ($RH\%$).
   $$\text{hi\_norm} = \text{clamp}\left(\frac{HI - HI_{\min}}{HI_{\max} - HI_{\min}}, 0, 1\right)$$
   *(Default range: $15.0^\circ\text{C}$ to $90.0^\circ\text{C}$)*

3. **Shade Coverage Factor**:
   $$\text{shade\_factor} = \frac{100 - \text{shade\_coverage\_pct}}{100}$$

4. **Composite Risk Score**:
   $$\text{Risk Score} = \Big(w_{\text{temp}} \cdot \text{temp\_norm} + w_{\text{hi}} \cdot \text{hi\_norm} + w_{\text{shade}} \cdot \text{shade\_factor}\Big) \times 100$$
   *(Default Weights: $w_{\text{temp}} = 0.5$, $w_{\text{hi}} = 0.3$, $w_{\text{shade}} = 0.2$)*

---

## ⚙️ User Preference Presets

When comparing an alternative route to an original route, the engine selects the alternative only if it reduces heat risk **and** stays within the maximum allowable extra distance percentage defined by the user's preference:

| Preference Preset | Max Extra Distance (`max_extra_dist_pct`) | Description |
| :--- | :--- | :--- |
| `shortest_path` | **5.0%** | Priority is minimal distance/travel time. |
| `balanced` | **20.0%** | (Default) Balanced compromise between distance and heat avoidance. |
| `coolest_path` | **$\infty$ (Unlimited)** | Prioritizes maximum shade and coolness, regardless of added distance. |

---

## 📥 Input Data Specifications & JSON Schemas

### 1. Thermal Polygon GeoJSON Input (`mock_thermal_data.json`)
The thermal overlay dataset must be a valid GeoJSON `FeatureCollection`. Each feature represents a spatial thermal zone.

#### JSON Structure Example:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "polygon_id": "zone_asphalt_downtown_1",
        "zone_type": "HIGH_HEAT_ASPHALT",
        "temperature": 46.8,
        "heat_index": "EXTREME_DANGER",
        "shade_coverage_pct": 5
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-112.076, 33.447],
            [-112.071, 33.447],
            [-112.071, 33.450],
            [-112.076, 33.450],
            [-112.076, 33.447]
          ]
        ]
      }
    }
  ]
}
```

#### Properties Schema:
- `polygon_id` *(string, required)*: Unique identifier for the thermal polygon.
- `zone_type` *(string)*: Classification of urban zone (e.g. `HIGH_HEAT_ASPHALT`, `COOL_PARK`, `COOL_CANOPY_STREET`).
- `temperature` *(float, required)*: Surface temperature in Celsius ($^\circ\text{C}$).
- `heat_index` *(string)*: Descriptive severity label.
- `shade_coverage_pct` *(integer/float, required)*: Canopy and architectural shade percentage ($0$ to $100$).

---

### 2. Mapbox Route GeoJSON Input
Mapbox navigation routes are passed as GeoJSON `Feature` objects with `LineString` geometries.

#### JSON Structure Example:
```json
{
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
```

---

## 📤 Output Data Specifications & JSON Schema

### 1. Route Decision Output Structure
The function `compare_mapbox_routes()` returns a JSON decision payload detailing route selection metrics and full segment breakdown for both routes.

#### Fields Definition:
- `selected_route` *(string)*: Winning route recommendation (`"original"` or `"alternative"`).
- `user_preference` *(string)*: Preset applied (`"shortest_path"`, `"balanced"`, `"coolest_path"`).
- `max_extra_dist_pct_applied` *(float)*: Threshold of acceptable extra distance applied.
- `risk_score_savings` *(float)*: Risk score points saved if alternative is chosen ($0.0$ if original is chosen).
- `extra_distance_pct` *(float)*: Added distance percentage of alternative route compared to original.
- `original_route` / `alternative_route` *(object)*:
  - `total_distance_deg` *(float)*: Total path length in geographic degrees.
  - `multi_factor_risk_score` *(float)*: Weighted route composite risk score ($0 - 100$).
  - `segments_count` *(integer)*: Count of intersected thermal polygons.
  - `detailed_segments` *(array of objects)*:
    - `polygon_id` *(string)*: Intersected polygon ID.
    - `surface_temp_c` *(float)*: Thermal zone surface temperature.
    - `heat_index_c` *(float)*: Computed Steadman heat index in Celsius.
    - `shade_coverage_pct` *(float)*: Zone shade percentage.
    - `segment_risk_score` *(float)*: Risk score calculated for this specific segment ($0 - 100$).
    - `length_deg` *(float)*: Length of route segment intersecting this polygon.
    - `length_weight` *(float)*: Proportion of total intersected route length.

---

### 2. Detailed Example Output JSON

```json
{
  "selected_route": "original",
  "user_preference": "balanced",
  "max_extra_dist_pct_applied": 20.0,
  "risk_score_savings": 0.0,
  "extra_distance_pct": 28.07,
  "original_route": {
    "total_distance_deg": 0.008,
    "multi_factor_risk_score": 79.12,
    "segments_count": 3,
    "detailed_segments": [
      {
        "polygon_id": "zone_asphalt_downtown_1",
        "surface_temp_c": 46.8,
        "heat_index_c": 74.78,
        "shade_coverage_pct": 5,
        "segment_risk_score": 82.66,
        "length_deg": 0.005,
        "length_weight": 0.625
      },
      {
        "polygon_id": "zone_park_shaded_2",
        "surface_temp_c": 34.2,
        "heat_index_c": 37.2,
        "shade_coverage_pct": 80,
        "segment_risk_score": 36.88,
        "length_deg": 0.0,
        "length_weight": 0.0
      },
      {
        "polygon_id": "zone_commercial_plaza_5",
        "surface_temp_c": 44.1,
        "heat_index_c": 64.59,
        "shade_coverage_pct": 15,
        "segment_risk_score": 73.21,
        "length_deg": 0.003,
        "length_weight": 0.375
      }
    ]
  },
  "alternative_route": {
    "total_distance_deg": 0.010246,
    "multi_factor_risk_score": 69.27,
    "segments_count": 5,
    "detailed_segments": [
      {
        "polygon_id": "zone_asphalt_downtown_1",
        "surface_temp_c": 46.8,
        "heat_index_c": 74.78,
        "shade_coverage_pct": 5,
        "segment_risk_score": 82.66,
        "length_deg": 0.004592,
        "length_weight": 0.375
      },
      {
        "polygon_id": "zone_park_shaded_2",
        "surface_temp_c": 34.2,
        "heat_index_c": 37.2,
        "shade_coverage_pct": 80,
        "segment_risk_score": 36.88,
        "length_deg": 0.0015,
        "length_weight": 0.1225
      },
      {
        "polygon_id": "zone_residential_mixed_3",
        "surface_temp_c": 41.5,
        "heat_index_c": 55.88,
        "shade_coverage_pct": 25,
        "segment_risk_score": 64.48,
        "length_deg": 0.002562,
        "length_weight": 0.2092
      },
      {
        "polygon_id": "zone_tree_canopy_corridor_4",
        "surface_temp_c": 36.0,
        "heat_index_c": 41.01,
        "shade_coverage_pct": 65,
        "segment_risk_score": 43.65,
        "length_deg": 0.0005,
        "length_weight": 0.0408
      },
      {
        "polygon_id": "zone_commercial_plaza_5",
        "surface_temp_c": 44.1,
        "heat_index_c": 64.59,
        "shade_coverage_pct": 15,
        "segment_risk_score": 73.21,
        "length_deg": 0.003092,
        "length_weight": 0.2525
      }
    ]
  }
}
```


