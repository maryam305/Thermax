import os
from typing import Optional, Literal
from dotenv import load_dotenv

load_dotenv()

# Initialize Groq and Gemini SDKs lazily
_groq_client = None
_gemini_client = None


def get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            from groq import Groq
            _groq_client = Groq(api_key=api_key)
    return _groq_client


def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            from google import genai
            _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def generate_llm_response(
    prompt: str,
    provider: Literal["groq", "gemini"] = "groq",
    model: Optional[str] = None,
    system_instruction: str = "You are an AI assistant for ThermaX thermal routing and heat risk management."
) -> dict:
    if model and (model.strip() == "" or model.strip().lower() == "string"):
        model = None

    if provider == "groq":
        client = get_groq_client()
        if not client:
            raise RuntimeError("GROQ_API_KEY is not set or valid.")
        
        selected_model = model or "groq/compound-mini"
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            model=selected_model,
            temperature=0.7,
        )
        output_text = chat_completion.choices[0].message.content
        return {
            "provider": "groq",
            "model": selected_model,
            "response": output_text
        }

    elif provider == "gemini":
        client = get_gemini_client()
        if not client:
            raise RuntimeError("GEMINI_API_KEY is not set or valid.")
        
        selected_model = model or "gemini-2.5-flash"
        response = client.models.generate_content(
            model=selected_model,
            contents=prompt,
            config={"system_instruction": system_instruction}
        )
        return {
            "provider": "gemini",
            "model": selected_model,
            "response": response.text
        }
    else:
        raise ValueError(f"Unsupported provider: {provider}")
