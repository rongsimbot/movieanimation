"""
Anthropic Claude API Client
Script processing and scene extraction
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_config import get_api_key
from anthropic import Anthropic

class ClaudeClient:
    def __init__(self):
        self.api_key = get_api_key('ANTHROPIC_API_KEY')
        try:
            self.client = Anthropic(api_key=self.api_key)
        except TypeError:
            # Workaround for Python 3.14 compatibility
            import anthropic
            self.client = anthropic.Client(api_key=self.api_key)
        self.model = "claude-sonnet-4-5-20250929"
    
    def extract_scenes(self, script_text: str) -> dict:
        """
        Parse a movie script into structured scenes.
        
        Args:
            script_text: The full script text
        
        Returns:
            dict with success status and list of scene objects:
            [
                {
                    "scene_number": 1,
                    "description": "INT. COFFEE SHOP - DAY",
                    "action": "John enters and looks around...",
                    "dialogue": [{"character": "JOHN", "line": "Hello?"}],
                    "characters": ["JOHN", "SARAH"]
                },
                ...
            ]
        """
        prompt = f"""Analyze this movie script and extract all scenes into a structured JSON format.

For each scene, identify:
1. scene_number (sequential integer)
2. description (location and time, e.g., "INT. COFFEE SHOP - DAY")
3. action (narrative/stage directions)
4. dialogue (array of {{character, line}} objects)
5. characters (unique character names in this scene)

Return ONLY valid JSON with this structure:
{{
  "scenes": [
    {{
      "scene_number": 1,
      "description": "...",
      "action": "...",
      "dialogue": [...],
      "characters": [...]
    }}
  ]
}}

Script:
{script_text}
"""
        
        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            response_text = message.content[0].text
            
            # Try to extract JSON from response
            import json
            import re
            
            # Look for JSON block
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                scenes_data = json.loads(json_match.group(0))
                return {
                    "success": True,
                    "scenes": scenes_data.get("scenes", []),
                    "total_scenes": len(scenes_data.get("scenes", []))
                }
            else:
                return {
                    "success": False,
                    "error": "Could not parse JSON from Claude response",
                    "raw_response": response_text[:500]
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def generate_scene_description(self, scene: dict) -> str:
        """
        Generate a detailed visual description for video generation.
        
        Args:
            scene: Scene object from extract_scenes()
        
        Returns:
            String prompt optimized for video generation
        """
        prompt = f"""Given this movie scene, create a detailed visual description optimized for AI video generation.

Scene: {scene.get('description')}
Action: {scene.get('action', '')}
Characters: {', '.join(scene.get('characters', []))}

Provide a vivid, cinematic description focusing on:
- Setting and atmosphere
- Character appearances and positions
- Camera angles and movement
- Lighting and mood
- Key visual elements

Keep it under 200 words and start with the visual description directly."""

        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            return message.content[0].text.strip()
        
        except Exception as e:
            return f"Error generating description: {e}"

if __name__ == "__main__":
    # Test connectivity
    print("Testing Anthropic Claude API...")
    try:
        client = ClaudeClient()
        print("✓ Claude API: Connected")
        print(f"  Model: {client.model}")
        print(f"  API Key: ...{client.api_key[-8:]}")
    except Exception as e:
        print(f"✗ Claude API: Connection failed - {e}")
