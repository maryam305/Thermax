import os
from typing import List, Optional, Literal
import traceback
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from thermal_overlay_engine import AdvancedThermalRoutingEngine
from services.fortyguard_service import get_live_fortyguard_thermal_geojson
from services.routing_service import get_real_mapbox_routes
from services.ai_agent_service import generate_llm_response

app = FastAPI(
    title="ThermaX Unified API Gateway",
    version="1.0.0",
    description="Unified API for Thermal Routing Analysis and Multi-Model AI Chat (Groq & Gemini)."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request & Response Schemas ---

class RouteRequest(BaseModel):
    origin: List[float] = Field(..., json_schema_extra={"example": [-112.074, 33.448]})
    destination: List[float] = Field(..., json_schema_extra={"example": [-112.064, 33.458]})
    city: Optional[str] = Field(default="Phoenix")
    user_preference: Optional[str] = Field(default="balanced")
    humidity: Optional[float] = Field(default=45.0)


class ChatRequest(BaseModel):
    prompt: str = Field(..., json_schema_extra={"example": "Explain urban heat islands and mitigation strategies."})
    provider: Literal["groq", "gemini"] = Field(default="groq", description="LLM Provider")
    model: Optional[str] = Field(default=None, description="Model override (e.g., 'llama-3.1-8b-instant' or 'gemini-2.5-flash')")
    system_instruction: Optional[str] = Field(
        default="You are an AI assistant for ThermaX thermal routing and heat risk management.",
        description="System prompt"
    )


class ChatResponse(BaseModel):
    provider: str
    model: str
    response: str


class RouteInsightResponse(BaseModel):
    decision: dict
    routes_geojson: dict
    thermal_overlay_geojson: dict
    ai_insight: ChatResponse


# --- Shared Logic ---

def _perform_route_analysis(request: RouteRequest) -> dict:
    """
    المنطق الأساسي لتحليل المسار: جلب المسارات، جلب بيانات الحرارة، وحساب الخطورة.
    مستخرجة كـ helper عشان تُستخدم في أكتر من endpoint (التحليل الخام + التحليل مع شرح الـ AI)
    من غير تكرار الكود.
    """
    # 1. Fetch pedestrian routes from OSRM/Mapbox engine
    orig_mapbox, alt_mapbox = get_real_mapbox_routes(request.origin, request.destination)

    # 2. Compute bounding box and fetch live thermal overlay
    bbox = [
        min(request.origin[0], request.destination[0]) - 0.01,
        min(request.origin[1], request.destination[1]) - 0.01,
        max(request.origin[0], request.destination[0]) + 0.01,
        max(request.origin[1], request.destination[1]) + 0.01
    ]
    live_thermal_geojson = get_live_fortyguard_thermal_geojson(bbox, request.city)

    # 3. Evaluate multi-factor heat risk via mathematical engine
    engine = AdvancedThermalRoutingEngine(live_thermal_geojson)
    decision = engine.compare_mapbox_routes(
        orig_mapbox,
        alt_mapbox,
        user_preference=request.user_preference,
        humidity=request.humidity
    )

    return {
        "decision": decision,
        "routes_geojson": {
            "type": "FeatureCollection",
            "features": [orig_mapbox, alt_mapbox]
        },
        "thermal_overlay_geojson": live_thermal_geojson
    }


def _build_insight_prompt(request: RouteRequest, decision: dict) -> str:
    """
    يبني prompt مبني على نتائج التحليل الحرارية الحقيقية (مش عام)
    عشان الـ AI Agent يشرح القرار للمستخدم بلغة بسيطة ويدي نصيحة عملية.
    """
    selected = decision["selected_route"]
    orig_risk = decision["original_route"]["multi_factor_risk_score"]
    alt_risk = decision["alternative_route"]["multi_factor_risk_score"]
    extra_dist_pct = decision["extra_distance_pct"]
    savings = decision["risk_score_savings"]

    return (
        f"مستخدم بيمشي في مدينة {request.city} وبيدور على أفضل مسار مشي "
        f"مع تفضيل '{request.user_preference}' ورطوبة {request.humidity}%.\n\n"
        f"نتائج تحليل الحرارة للمسارين:\n"
        f"- المسار الأصلي: درجة خطورة حرارية {orig_risk}\n"
        f"- المسار البديل: درجة خطورة حرارية {alt_risk}\n"
        f"- المسافة الإضافية للمسار البديل: {extra_dist_pct}%\n"
        f"- النظام اختار: '{selected}' (توفير في الخطورة: {savings} نقطة)\n\n"
        f"اشرح للمستخدم بجملتين أو تلاتة ليه المسار ده الأنسب، ونصيحة عملية واحدة "
        f"(زي وقت المشي، أو لبس واقي من الشمس، أو مياه) بناءً على الأرقام دي بالظبط."
    )


# --- API Endpoints ---

@app.post("/api/v1/routing/analyze")
async def analyze_route(request: RouteRequest):
    """
    Analyzes pedestrian routes against FortyGuard thermal overlay data to find heat-optimized paths.
    """
    try:
        return _perform_route_analysis(request)
    except Exception as e:
        print("----- ROUTING ERROR TRACE -----")
        traceback.print_exc()
        print("-------------------------------")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/routing/analyze-with-insight", response_model=RouteInsightResponse)
async def analyze_route_with_insight(request: RouteRequest):
    """
    نفس تحليل /routing/analyze، لكن بيربط الناتج مباشرة بالـ AI Agent عشان يشرح
    القرار ويدي نصيحة عملية مبنية على بيانات الحرارة الحقيقية للمسار — مش رد chat عام.
    """
    try:
        analysis = _perform_route_analysis(request)
        insight_prompt = _build_insight_prompt(request, analysis["decision"])

        ai_result = generate_llm_response(
            prompt=insight_prompt,
            provider="groq",
            model=None,
            system_instruction=(
                "أنت مساعد ThermaX لتحليل مخاطر الحرارة أثناء المشي. "
                "ردودك مختصرة وعملية ومبنية فقط على الأرقام المعطاة لك، من غير معلومات مختلقة."
            )
        )

        return RouteInsightResponse(
            decision=analysis["decision"],
            routes_geojson=analysis["routes_geojson"],
            thermal_overlay_geojson=analysis["thermal_overlay_geojson"],
            ai_insight=ChatResponse(**ai_result)
        )
    except Exception as e:
        print("----- ROUTING INSIGHT ERROR TRACE -----")
        traceback.print_exc()
        print("----------------------------------------")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/chat", response_model=ChatResponse)
async def generate_chat_response(payload: ChatRequest):
    """
    Unified AI Chat Gateway supporting Groq and Google Gemini models.
    """
    try:
        result = generate_llm_response(
            prompt=payload.prompt,
            provider=payload.provider,
            model=payload.model,
            system_instruction=payload.system_instruction or "You are a helpful assistant."
        )
        return ChatResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat Service Error: {str(e)}"
        )


@app.get("/health")
def health_check():
    """
    Returns server status and environment key readiness.
    """
    return {
        "status": "ok",
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "fortyguard_configured": bool(os.getenv("FORTYGUARD_API_KEY"))
    }