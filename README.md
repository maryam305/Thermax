# ThermaX — Unified Thermal Routing & AI Risk Management API

ThermaX is a high-performance backend system designed to compute urban pedestrian routes optimized for thermal comfort and heat risk mitigation. By combining live microclimate overlay data with Mapbox/OSRM routing engines and a multi-provider LLM AI gateway (Groq & Gemini), ThermaX provides real-time thermal analysis and intelligent urban heat risk guidance.

---

## 🌟 Key Features

* **Thermal-Aware Pathfinding**: Analyzes pedestrian routes against microclimate surface temperature and shading polygons to minimize severe heat exposure.
* **FortyGuard Integration**: Dynamically fetches real-time surface temperature and shade coverage data, complete with local fallback mocks for uninterrupted testing.
* **Unified AI Chat Gateway**: Supports switching between **Groq** (fast, open-weights models) and **Google Gemini** for thermal health advising and urban climate queries.
* **Resilient Infrastructure**: Built with lazy SDK initialization, mathematical safety fallbacks, and robust CORS handling to ensure hackathon-grade uptime.

---

## 🏗 System Architecture & Project Structure

```text
thermax-backend/
│
├── main.py                     # Unified FastAPI application (Routing + AI Chat)
├── thermal_overlay_engine.py   # Mathematical engine for heat index & segment risk calculation
├── services/
│   ├── ai_agent_service.py     # Lazy-loaded LLM SDK handler (Groq & Gemini)
│   ├── fortyguard_service.py   # FortyGuard Microclimate API service with auto-fallback
│   └── routing_service.py      # OSRM/Mapbox pedestrian routing service
├── requirements.txt            # Dependency configuration
├── .env.example                # Template environment variable configuration
└── README.md                   # System documentation
```

---

## 🛠 Tech Stack & Dependencies

* **Language**: Python 3.10+
* **Framework**: FastAPI, Uvicorn, Pydantic
* **Spatial & Geometry Engine**: Shapely
* **AI & LLM Integration**: `groq`, `google-genai`
* **Geospatial & HTTP Services**: Requests, Mapbox / OSRM REST APIs

---

## 🚀 Quickstart Guide

### 1. Prerequisites

Ensure you have Python 3.10+ installed on your system.

### 2. Environment Setup

Clone the repository and create a Python Virtual Environment (`venv`):

```bash
# Clone the repository
git clone https://github.com/your-username/thermax-backend.git
cd thermax-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate
# On Windows (CMD/PowerShell):
# .\venv\Scripts\activate
```

### 3. Install Dependencies

Install all required Python packages inside your active `venv`:

```bash
pip install --upgrade pip
pip install fastapi uvicorn python-dotenv requests shapely groq google-genai
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
GROQ_API_KEY="your_groq_api_key_here"
GEMINI_API_KEY="your_gemini_api_key_here"
FORTYGUARD_API_KEY="your_fortyguard_api_key_here"
FORTYGUARD_BASE_URL="https://api.fortyguard.com/v1"
```

---

## ⚡ Running the Application

Start the local server using Uvicorn:

```bash
uvicorn main:app --reload --port 8000
```

Access the interactive API documentation (Swagger UI) at: **`http://localhost:8000/docs`**

---

## 📡 Detailed API Endpoints & Payloads

### 1. Health Check
* **Endpoint**: `GET /health`
* **Description**: Verifies service status and external API key configurations.

**Response Example:**
```json
{
  "status": "ok",
  "groq_configured": true,
  "gemini_configured": true,
  "fortyguard_configured": true
}
```

---

### 2. Route Heat Analysis
* **Endpoint**: `POST /api/v1/routing/analyze`
* **Description**: Evaluates pedestrian routes using microclimate surface temps, heat index, and shade coverage to select the safest path.

**Request Payload:**
```json
{
  "origin": [-112.074, 33.448],
  "destination": [-112.064, 33.458],
  "city": "Phoenix",
  "user_preference": "balanced",
  "humidity": 45.0
}
```

**Request Parameters:**
* `origin` *(List[float], required)*: Longitude and Latitude array for the start point `[lng, lat]`.
* `destination` *(List[float], required)*: Longitude and Latitude array for the end point `[lng, lat]`.
* `city` *(String, optional)*: Target city for FortyGuard lookup. Default is `"Phoenix"`.
* `user_preference` *(String, optional)*: Routing policy preset — `"shortest_path"`, `"balanced"`, or `"coolest_path"`.
* `humidity` *(Float, optional)*: Relative humidity percentage for heat index calculations. Default is `45.0`.

**Response Payload Example:**
```json
{
  "decision": {
    "selected_route": "alternative",
    "user_preference": "balanced",
    "max_extra_dist_pct_applied": 20.0,
    "risk_score_savings": 14.25,
    "extra_distance_pct": 8.50,
    "original_route": {
      "total_distance_deg": 0.014142,
      "multi_factor_risk_score": 62.10,
      "segments_count": 1,
      "detailed_segments": [
        {
          "polygon_id": "poly_zone_1",
          "surface_temp_c": 42.5,
          "heat_index_c": 44.12,
          "shade_coverage_pct": 15.0,
          "segment_risk_score": 62.10,
          "length_deg": 0.014142,
          "length_weight": 1.0
        }
      ]
    },
    "alternative_route": {
      "total_distance_deg": 0.015344,
      "multi_factor_risk_score": 47.85,
      "segments_count": 1,
      "detailed_segments": []
    }
  },
  "routes_geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[-112.074, 33.448], [-112.064, 33.458]]
        },
        "properties": { "distance": 1450.0, "type": "original" }
      }
    ]
  },
  "thermal_overlay_geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-112.084, 33.438],
            [-112.054, 33.438],
            [-112.054, 33.468],
            [-112.084, 33.468],
            [-112.084, 33.438]
          ]]
        },
        "properties": {
          "polygon_id": "poly_zone_1",
          "surface_temp": 42.5,
          "shade_coverage": 15.0
        }
      }
    ]
  }
}
```

---

### 3. Multi-Model AI Chat Gateway
* **Endpoint**: `POST /api/v1/chat`
* **Description**: Queries Groq or Google Gemini models with custom system instructions.

**Request Payload:**
```json
{
  "prompt": "How does urban heat island effect impact pedestrians in desert climates?",
  "provider": "groq",
  "model": "llama-3.1-8b-instant",
  "system_instruction": "You are an AI assistant for ThermaX thermal routing and heat risk management."
}
```

**Request Parameters:**
* `prompt` *(String, required)*: User query prompt.
* `provider` *(String, required)*: LLM vendor — `"groq"` or `"gemini"`.
* `model` *(String, optional)*: Model identifier override. Defaults to `"llama-3.1-8b-instant"` for Groq or `"gemini-2.5-flash"` for Gemini.
* `system_instruction` *(String, optional)*: Persona/system context prompt.

**Response Payload Example:**
```json
{
  "provider": "groq",
  "model": "llama-3.1-8b-instant",
  "response": "The Urban Heat Island (UHI) effect significantly increases localized surface and ambient temperatures in desert cities like Phoenix. Unshaded asphalt and building materials absorb radiant heat during the day and re-emit it, creating extreme microclimates that increase pedestrian heat stress and dehydration risks."
}
```

---

## 🧪 Troubleshooting

* **Unrecognized `groq` module**: Ensure your `venv` is activated (`source venv/bin/activate`) before installing dependencies or launching Uvicorn.
* **Groq Model Not Found Error**: Avoid outdated model strings like `groq/compound-mini`. Use native Groq models such as `llama-3.1-8b-instant` or `llama-3.3-70b-versatile`.

---

## 📜 License

Distributed under the MIT License.