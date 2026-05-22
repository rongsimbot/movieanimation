"""
ElevenLabs API Client
Voice synthesis and text-to-speech
"""

import requests
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_config import get_api_key

class ElevenLabsClient:
    def __init__(self):
        self.api_key = get_api_key('ELEVENLABS_API_KEY')
        self.base_url = "https://api.elevenlabs.io/v1"
        self.headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }
    
    def list_voices(self) -> dict:
        """
        Get list of available voices.
        
        Returns:
            dict with success status and list of voices
        """
        try:
            response = requests.get(
                f"{self.base_url}/voices",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            voices = []
            for voice in result.get("voices", []):
                voices.append({
                    "voice_id": voice.get("voice_id"),
                    "name": voice.get("name"),
                    "category": voice.get("category"),
                    "labels": voice.get("labels", {})
                })
            
            return {
                "success": True,
                "voices": voices,
                "count": len(voices)
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def text_to_speech(self, text: str, voice_id: str = None, 
                       output_path: str = None) -> dict:
        """
        Convert text to speech audio.
        
        Args:
            text: The text to convert
            voice_id: ElevenLabs voice ID (uses default if None)
            output_path: Where to save the audio file
        
        Returns:
            dict with success status and audio file path
        """
        # Use default voice if none specified
        if not voice_id:
            voice_id = "21m00Tcm4TlvDq8ikWAM"  # Rachel (default)
        
        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/text-to-speech/{voice_id}",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            # Save audio file
            if not output_path:
                output_path = "/tmp/elevenlabs_output.mp3"
            
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            return {
                "success": True,
                "audio_path": output_path,
                "voice_id": voice_id,
                "text_length": len(text)
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_voice_by_name(self, name: str) -> dict:
        """
        Find a voice by name.
        
        Args:
            name: Voice name to search for
        
        Returns:
            dict with voice_id if found
        """
        voices = self.list_voices()
        
        if not voices["success"]:
            return voices
        
        for voice in voices["voices"]:
            if voice["name"].lower() == name.lower():
                return {
                    "success": True,
                    "voice_id": voice["voice_id"],
                    "name": voice["name"]
                }
        
        return {
            "success": False,
            "error": f"Voice '{name}' not found"
        }

if __name__ == "__main__":
    # Test connectivity
    print("Testing ElevenLabs API...")
    try:
        client = ElevenLabsClient()
        voices = client.list_voices()
        if voices["success"]:
            print("✓ ElevenLabs API: Connected")
            print(f"  Available voices: {voices['count']}")
            print(f"  API Key: ...{client.api_key[-8:]}")
        else:
            print(f"✗ ElevenLabs API: {voices['error']}")
    except Exception as e:
        print(f"✗ ElevenLabs API: Connection failed - {e}")
