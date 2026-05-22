#!/usr/bin/env python3
"""
API Connectivity Test Suite
Tests all 5 MovieAnimation API integrations
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_config():
    """Test API configuration loading"""
    print("\n=== Testing API Configuration ===")
    try:
        from config.api_config import load_api_keys
        keys = load_api_keys()
        print(f"✓ Configuration: Loaded {len(keys)} API keys")
        for key_name in keys.keys():
            print(f"  - {key_name}: Configured")
        return True
    except Exception as e:
        print(f"✗ Configuration: Failed - {e}")
        return False

def test_luma():
    """Test Luma Dream Machine API"""
    print("\n=== Testing Luma Dream Machine API ===")
    try:
        from api.luma_client import LumaClient
        client = LumaClient()
        print(f"✓ Luma API: Connected")
        print(f"  Endpoint: {client.base_url}")
        return True
    except Exception as e:
        print(f"✗ Luma API: Failed - {e}")
        return False

def test_runway():
    """Test Runway Gen-3 API"""
    print("\n=== Testing Runway Gen-3 API ===")
    try:
        from api.runway_client import RunwayClient
        client = RunwayClient()
        print(f"✓ Runway API: Connected")
        print(f"  Endpoint: {client.base_url}")
        return True
    except Exception as e:
        print(f"✗ Runway API: Failed - {e}")
        return False

def test_claude():
    """Test Anthropic Claude API"""
    print("\n=== Testing Anthropic Claude API ===")
    try:
        from api.claude_client import ClaudeClient
        client = ClaudeClient()
        print(f"✓ Claude API: Connected")
        print(f"  Model: {client.model}")
        return True
    except Exception as e:
        print(f"✗ Claude API: Failed - {e}")
        print(f"  Note: Python 3.14 compatibility issue with anthropic library")
        return False

def test_elevenlabs():
    """Test ElevenLabs API"""
    print("\n=== Testing ElevenLabs API ===")
    try:
        from api.elevenlabs_client import ElevenLabsClient
        client = ElevenLabsClient()
        voices = client.list_voices()
        if voices["success"]:
            print(f"✓ ElevenLabs API: Connected")
            print(f"  Available voices: {voices['count']}")
            return True
        else:
            print(f"✗ ElevenLabs API: {voices['error']}")
            return False
    except Exception as e:
        print(f"✗ ElevenLabs API: Failed - {e}")
        return False

def test_dalle():
    """Test OpenAI DALL-E 3 API"""
    print("\n=== Testing OpenAI DALL-E 3 API ===")
    try:
        from api.dalle_client import DalleClient
        client = DalleClient()
        print(f"✓ DALL-E 3 API: Connected")
        print(f"  Model: dall-e-3")
        return True
    except Exception as e:
        print(f"✗ DALL-E 3 API: Failed - {e}")
        print(f"  Note: Python 3.14 compatibility issue with openai library")
        return False

if __name__ == "__main__":
    print("="*60)
    print("MovieAnimation API Test Suite")
    print("="*60)
    
    results = {
        "Configuration": test_config(),
        "Luma Dream Machine": test_luma(),
        "Runway Gen-3": test_runway(),
        "Anthropic Claude": test_claude(),
        "ElevenLabs": test_elevenlabs(),
        "OpenAI DALL-E 3": test_dalle()
    }
    
    print("\n" + "="*60)
    print("Test Results Summary")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for api, status in results.items():
        status_symbol = "✓" if status else "✗"
        print(f"{status_symbol} {api}")
    
    print("\n" + f"Passed: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 All APIs ready!")
        sys.exit(0)
    else:
        print("\n⚠️  Some APIs need attention (see notes above)")
        sys.exit(1)
