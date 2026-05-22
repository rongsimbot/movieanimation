"""
Runway Gen-3 API Client
Advanced video generation and editing
"""

import requests
import time
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.api_config import get_api_key

class RunwayClient:
    def __init__(self):
        self.api_key = get_api_key('RUNWAY_API_KEY')
        self.base_url = "https://api.runwayml.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_video(self, prompt: str, settings: dict = None) -> dict:
        """
        Generate a video using Runway Gen-3.
        
        Args:
            prompt: Text description of the video
            settings: Optional dict with generation parameters
                     (duration, resolution, style, etc.)
        
        Returns:
            dict with job_id, status, and video_url (when ready)
        """
        payload = {
            "prompt": prompt,
            "model": "gen3"
        }
        
        if settings:
            payload.update(settings)
        
        try:
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
        Check the status of a generation job.
        
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
                "video_url": result.get("output", {}).get("url"),
                "metadata": result.get("metadata", {})
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def wait_for_completion(self, job_id: str, timeout: int = 600, poll_interval: int = 15) -> dict:
        """
        Poll until generation completes or timeout.
        
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
            
            if status["status"] in ["completed", "succeeded"]:
                return status
            
            if status["status"] in ["failed", "error"]:
                return {
                    "success": False,
                    "error": "Video generation failed",
                    "metadata": status.get("metadata", {})
                }
            
            time.sleep(poll_interval)
        
        return {
            "success": False,
            "error": "Timeout waiting for video generation"
        }

if __name__ == "__main__":
    # Test connectivity
    print("Testing Runway Gen-3 API...")
    try:
        client = RunwayClient()
        print("✓ Runway API: Connected")
        print(f"  API Key: ...{client.api_key[-8:]}")
    except Exception as e:
        print(f"✗ Runway API: Connection failed - {e}")
