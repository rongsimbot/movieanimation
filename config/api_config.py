"""
MovieAnimation API Configuration
Loads API keys from CREDENTIALS.md and provides them to all API clients.
"""

import os
import re
from typing import Dict, Optional

CREDENTIALS_PATH = os.path.expanduser("~/.openclaw/workspace/CREDENTIALS.md")

def load_api_keys() -> Dict[str, str]:
    """
    Parse CREDENTIALS.md and extract all MovieAnimation API keys.
    
    Returns:
        Dict with keys: LUMA_API_KEY, RUNWAY_API_KEY, ANTHROPIC_API_KEY, 
                       ELEVENLABS_API_KEY, OPENAI_API_KEY
    """
    if not os.path.exists(CREDENTIALS_PATH):
        raise FileNotFoundError(f"CREDENTIALS.md not found at {CREDENTIALS_PATH}")
    
    with open(CREDENTIALS_PATH, 'r') as f:
        content = f.read()
    
    keys = {}
    
    # Extract Luma API Key (Section 6)
    luma_match = re.search(r'## 6\. Luma.*?API Key.*?`([^`]+)`', content, re.DOTALL)
    if luma_match:
        keys['LUMA_API_KEY'] = luma_match.group(1)
    
    # Extract Anthropic API Key (Section 7)
    anthropic_match = re.search(r'## 7\. Anthropic.*?API Key.*?`([^`]+)`', content, re.DOTALL)
    if anthropic_match:
        keys['ANTHROPIC_API_KEY'] = anthropic_match.group(1)
    
    # Extract Runway API Key (Section 8)
    runway_match = re.search(r'## 8\. Runway.*?API Key.*?`([^`]+)`', content, re.DOTALL)
    if runway_match:
        keys['RUNWAY_API_KEY'] = runway_match.group(1)
    
    # Extract ElevenLabs API Key (Section 9)
    elevenlabs_match = re.search(r'## 9\. ElevenLabs.*?API Key.*?`([^`]+)`', content, re.DOTALL)
    if elevenlabs_match:
        keys['ELEVENLABS_API_KEY'] = elevenlabs_match.group(1)
    
    # Extract OpenAI API Key (Section 10)
    openai_match = re.search(r'## 10\. OpenAI.*?API Key.*?`([^`]+)`', content, re.DOTALL)
    if openai_match:
        keys['OPENAI_API_KEY'] = openai_match.group(1)
    
    # Validate all keys are present
    required_keys = ['LUMA_API_KEY', 'RUNWAY_API_KEY', 'ANTHROPIC_API_KEY', 
                     'ELEVENLABS_API_KEY', 'OPENAI_API_KEY']
    missing = [k for k in required_keys if k not in keys]
    
    if missing:
        raise ValueError(f"Missing API keys in CREDENTIALS.md: {', '.join(missing)}")
    
    return keys

def set_environment_variables():
    """Load API keys and set them as environment variables."""
    keys = load_api_keys()
    for key, value in keys.items():
        os.environ[key] = value
    return keys

def get_api_key(key_name: str) -> Optional[str]:
    """
    Get a specific API key by name.
    
    Args:
        key_name: Name of the API key (e.g., 'LUMA_API_KEY')
    
    Returns:
        The API key value or None if not found
    """
    keys = load_api_keys()
    return keys.get(key_name)

if __name__ == "__main__":
    # Test the configuration
    print("Testing API configuration...")
    try:
        keys = load_api_keys()
        print(f"✓ Successfully loaded {len(keys)} API keys")
        for key_name in keys.keys():
            print(f"  - {key_name}: {'*' * 20}{keys[key_name][-8:]}")
    except Exception as e:
        print(f"✗ Error loading API keys: {e}")
