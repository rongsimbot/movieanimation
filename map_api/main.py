import os
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import anthropic

app = FastAPI(title="MovieAnimation Processing API (MAP-API)")

# Load keys (in production these are loaded via environment variables)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LUMA_API_KEY = os.getenv("LUMA_API_KEY", "")

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

class StoryRequest(BaseModel):
    story: str

class VideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None

@app.post("/api/v1/script/generate")
async def generate_script(req: StoryRequest):
    if not client:
        return {"title": "Placeholder Title", "characters": [{"name": "Hero", "description": "A brave protagonist"}], "scenes": [{"scene_number": 1, "location": "EXT. CITY", "action": "Hero walks down street"}]}
    
    prompt = f"""
    You are an expert Hollywood screenwriter and AI Prompt Engineer. Convert the following story into a detailed scene-by-scene script specifically formatted for AI video generation.
    Format your response STRICTLY as a JSON object with this structure:
    {{
        "title": "Movie Title",
        "characters": [
            {{"name": "Character Name", "description": "Highly detailed physical description (age, clothing, hair, features) for image generation"}}
        ],
        "scenes": [
            {{"scene_number": 1, "location": "INT/EXT - LOCATION", "action": "Highly descriptive, cinematic action prompt for video generation (include lighting, camera movement, character actions)"}}
        ]
    }}
    
    Story to convert:
    {req.story}
    """
    
    try:
        response = client.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"status": "success", "raw_response": response.content[0].text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/video/render-scene")
async def render_scene(req: VideoRequest):
    if not LUMA_API_KEY:
        return {"status": "mock_success", "generation_id": "luma-mock-id-12345", "message": "LUMA_API_KEY not found in environment. Returning mock ID."}
        
    headers = {
        "Authorization": f"Bearer {LUMA_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "prompt": req.prompt,
        "model": "ray-1-5" # Luma Dream Machine standard model 
    }
    
    if req.image_url:
        payload["image_url"] = req.image_url
        
    try:
        response = requests.post("https://api.lumalabs.ai/dream-machine/v1/generations", json=payload, headers=headers)
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            return {"status": "success", "generation_id": data.get("id"), "raw": data}
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
