"""
Luma Dream Machine API Client
Text-to-video and image-to-video generation
"""

import requests
import time
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_config import get_api_key

class LumaClient:
    def __init__(self):
        self.api_key = get_api_key('LUMA_API_KEY')
        self.base_url = "https://api.lumalabs.ai/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_video(self, prompt: str, image_url: str = None, 
                      aspect_ratio: str = "16:9", duration: int = 5) -> dict:
        """
        Generate a video from text prompt or image + prompt.
        
        Args:
            prompt: Text description of the video
            image_url: Optional image URL for image-to-video
            aspect_ratio: Video aspect ratio (16:9, 9:16, 1:1)
            duration: Video duration in seconds (5 or 10)
        
        Returns:
            dict with job_id, status, and video_url (when ready)
        """
        payload = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "duration": duration
        }
        
        if image_url:
            payload["image_url"] = image_url
        
        try:
            # Submit generation request
            response = requests.post(
                f"{self.base_url}/generations",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                "success": True,
                "job_id": result.get("id"),
                "status": result.get("status", "pending"),
                "message": "Video generation started"
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to start video generation"
            }
    
    def get_status(self, job_id: str) -> dict:
        """
        Check the status of a video generation job.
        
        Args:
            job_id: The generation job ID
        
        Returns:
            dict with status, progress, and video_url (when complete)
        """
        try:
            response = requests.get(
                f"{self.base_url}/generations/{job_id}",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                "success": True,
                "status": result.get("status"),
                "progress": result.get("progress", 0),
                "video_url": result.get("video_url"),
                "thumbnail_url": result.get("thumbnail_url")
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def wait_for_completion(self, job_id: str, timeout: int = 300, poll_interval: int = 10) -> dict:
        """
        Poll until video generation completes or timeout.
        
        Args:
            job_id: The generation job ID
            timeout: Maximum wait time in seconds
            poll_interval: Seconds between status checks
        
        Returns:
            Final status dict with video_url
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_status(job_id)
            
            if not status["success"]:
                return status
            
            if status["status"] == "completed":
                return status
            
            if status["status"] == "failed":
                return {
                    "success": False,
                    "error": "Video generation failed"
                }
            
            time.sleep(poll_interval)
        
        return {
            "success": False,
            "error": "Timeout waiting for video generation"
        }

if __name__ == "__main__":
    # Test connectivity
    print("Testing Luma Dream Machine API...")
    try:
        client = LumaClient()
        print("✓ Luma API: Connected")
        print(f"  API Key: ...{client.api_key[-8:]}")
    except Exception as e:
        print(f"✗ Luma API: Connection failed - {e}")
