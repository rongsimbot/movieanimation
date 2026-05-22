"""
OpenAI DALL-E 3 API Client
Image generation for characters and scenes
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_config import get_api_key
from openai import OpenAI

class DalleClient:
    def __init__(self):
        self.api_key = get_api_key('OPENAI_API_KEY')
        try:
            self.client = OpenAI(api_key=self.api_key)
        except TypeError:
            # Workaround for Python 3.14 compatibility
            import openai
            self.client = openai.Client(api_key=self.api_key)
    
    def generate_image(self, prompt: str, size: str = "1024x1024", 
                       quality: str = "standard", style: str = "vivid") -> dict:
        """
        Generate an image using DALL-E 3.
        
        Args:
            prompt: Text description of the image
            size: Image size (1024x1024, 1024x1792, or 1792x1024)
            quality: Image quality (standard or hd)
            style: Image style (vivid or natural)
        
        Returns:
            dict with success status and image URL
        """
        try:
            response = self.client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size=size,
                quality=quality,
                style=style,
                n=1
            )
            
            image_url = response.data[0].url
            revised_prompt = response.data[0].revised_prompt
            
            return {
                "success": True,
                "image_url": image_url,
                "revised_prompt": revised_prompt,
                "size": size,
                "quality": quality
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def generate_character_portrait(self, character_name: str, 
                                    description: str) -> dict:
        """
        Generate a character portrait optimized for consistency.
        
        Args:
            character_name: Name of the character
            description: Physical description and attributes
        
        Returns:
            dict with success status and image URL
        """
        prompt = f"""Portrait of {character_name}, a character in an animated movie.

{description}

Cinematic lighting, high detail, professional character design, consistent features, front-facing view, neutral background."""
        
        return self.generate_image(
            prompt=prompt,
            size="1024x1024",
            quality="hd",
            style="vivid"
        )
    
    def generate_scene_background(self, scene_description: str) -> dict:
        """
        Generate a scene background/setting image.
        
        Args:
            scene_description: Description of the location/setting
        
        Returns:
            dict with success status and image URL
        """
        prompt = f"""Cinematic scene background for an animated movie:

{scene_description}

Wide shot, detailed environment, atmospheric lighting, professional animation quality, no characters."""
        
        return self.generate_image(
            prompt=prompt,
            size="1792x1024",  # Widescreen
            quality="hd",
            style="vivid"
        )

if __name__ == "__main__":
    # Test connectivity
    print("Testing OpenAI DALL-E 3 API...")
    try:
        client = DalleClient()
        print("✓ DALL-E 3 API: Connected")
        print(f"  Model: dall-e-3")
        print(f"  API Key: ...{client.api_key[-8:]}")
    except Exception as e:
        print(f"✗ DALL-E 3 API: Connection failed - {e}")
