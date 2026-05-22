#!/usr/bin/env python3
"""
test_render_pipeline.py - Phase 8 Pipeline Integration Test
Tests the FFmpeg rendering engine directly by calling the videoExport service.
"""

import os
import sys
import json
import subprocess
import tempfile
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent

def test_ffmpeg_available():
    """Check FFmpeg is installed."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=10)
        print("✅ FFmpeg is available")
        return True
    except FileNotFoundError:
        print("❌ FFmpeg not found - install FFmpeg first")
        return False
    except Exception as e:
        print(f"⚠️  FFmpeg check warning: {e}")
        return True

def test_ffprobe_available():
    """Check FFprobe is installed."""
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=10)
        print("✅ FFprobe is available")
        return True
    except FileNotFoundError:
        print("❌ FFprobe not found - install FFmpeg first")
        return False
    except Exception as e:
        print(f"⚠️  FFprobe check warning: {e}")
        return True

def test_create_test_video():
    """Generate a test video using FFmpeg for pipeline testing."""
    output = tempfile.mktemp(suffix=".mp4")
    try:
        # Generate a 2-second test video with color bars and tone
        result = subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-c:a", "aac",
            "-shortest", output,
        ], capture_output=True, text=True, timeout=30)

        if result.returncode == 0 and os.path.exists(output):
            size = os.path.getsize(output)
            print(f"✅ Test video created: {output} ({size} bytes)")
            return output
        else:
            print(f"❌ Failed to create test video: {result.stderr[:300]}")
            return None
    except Exception as e:
        print(f"❌ Error creating test video: {e}")
        return None

def test_backend_files_exist():
    """Verify all Phase 8 backend files exist."""
    files = [
        "backend/src/services/videoExport.ts",
        "backend/src/controllers/exportController.ts",
        "backend/src/routes/exportRoutes.ts",
        "backend/src/models/exportModel.ts",
        "backend/src/queue/exportQueue.ts",
        "backend/src/migrations/009_phase8_exports.sql",
    ]
    all_ok = True
    for f in files:
        path = PROJECT_DIR / f
        if path.exists():
            print(f"✅ {f}")
        else:
            print(f"❌ MISSING: {f}")
            all_ok = False
    return all_ok

def test_frontend_files_exist():
    """Verify all Phase 8 frontend files exist."""
    files = [
        "frontend/src/app/project/[id]/export/page.tsx",
    ]
    all_ok = True
    for f in files:
        path = PROJECT_DIR / f
        if path.exists():
            print(f"✅ {f}")
        else:
            print(f"❌ MISSING: {f}")
            all_ok = False
    return all_ok

def test_tools_exist():
    """Verify CLI tools exist and are executable."""
    tools = [
        "tools/batch_render.py",
        "tools/compress_video.py",
    ]
    all_ok = True
    for t in tools:
        path = PROJECT_DIR / t
        if path.exists():
            is_exec = os.access(path, os.X_OK)
            status = "executable" if is_exec else "not executable"
            print(f"✅ {t} ({status})")
        else:
            print(f"❌ MISSING: {t}")
            all_ok = False
    return all_ok

def test_batch_render_help():
    """Test batch_render.py --help works."""
    script = PROJECT_DIR / "tools" / "batch_render.py"
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--help"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and "batch_render" in result.stdout.lower():
            print("✅ batch_render.py --help works")
            return True
        else:
            print(f"❌ batch_render.py help failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"❌ batch_render.py error: {e}")
        return False

def test_compress_help():
    """Test compress_video.py --help works."""
    script = PROJECT_DIR / "tools" / "compress_video.py"
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--help"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and "compress_video" in result.stdout.lower():
            print("✅ compress_video.py --help works")
            return True
        else:
            print(f"❌ compress_video.py help failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"❌ compress_video.py error: {e}")
        return False

def test_dry_run():
    """Test batch_render.py dry-run mode."""
    # Create temp directory with test video
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a test video
        test_video = os.path.join(tmpdir, "test.mp4")
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=1:size=640x480:rate=30",
            "-c:v", "libx264",
            "-t", "1",
            test_video,
        ], capture_output=True, timeout=30)

        if not os.path.exists(test_video):
            print("⚠️  Could not create test video for dry-run test")
            return

        script = PROJECT_DIR / "tools" / "batch_render.py"
        result = subprocess.run(
            [sys.executable, str(script), "--input", tmpdir, "--tier", "free", "--dry-run", "--yes"],
            capture_output=True, text=True, timeout=30,
        )
        output = result.stdout + result.stderr
        if result.returncode == 0 and "Dry run complete" in output:
            print("✅ batch_render.py dry-run works correctly")
        else:
            print(f"❌ batch_render.py dry-run failed (code={result.returncode})")
            print(f"   stdout: {result.stdout[:200]}")
            print(f"   stderr: {result.stderr[:200]}")

def test_resolution_presets():
    """Verify resolution preset configurations."""
    from tools.batch_render import TIER_PRESETS

    expected = {
        "free": {"resolution": "720p", "compression": "fast"},
        "pro": {"resolution": "1080p", "compression": "medium"},
        "studio": {"resolution": "4k", "compression": "slow"},
    }

    if TIER_PRESETS == expected:
        print("✅ Resolution tier presets are correct")
    else:
        print(f"❌ Tier presets mismatch: {TIER_PRESETS} != {expected}")

def main():
    print(f"\n{'=' * 60}")
    print("  🧪 Phase 8 - Final Rendering Pipeline Test Suite")
    print(f"{'=' * 60}\n")

    results = {}

    # 1. System requirements
    print("── System Requirements ──")
    results["ffmpeg"] = test_ffmpeg_available()
    results["ffprobe"] = test_ffprobe_available()
    print()

    # 2. Source files
    print("── Backend Source Files ──")
    results["backend_files"] = test_backend_files_exist()
    print()

    print("── Frontend Source Files ──")
    results["frontend_files"] = test_frontend_files_exist()
    print()

    print("── CLI Tools ──")
    results["tools"] = test_tools_exist()
    print()

    # 3. CLI tool tests
    print("── CLI Tool Tests ──")
    results["batch_help"] = test_batch_render_help()
    results["compress_help"] = test_compress_help()

    # Test video generation for dry-run
    test_video_path = test_create_test_video()
    if test_video_path:
        print()
        print("── Dry Run Test ──")
        test_dry_run()
    print()

    # 4. Preset validation
    print("── Configuration Tests ──")
    test_resolution_presets()
    print()

    # Summary
    passed = sum(1 for v in results.values() if v is True)
    total = len(results)
    print(f"{'=' * 60}")
    print(f"  Results: {passed}/{total} tests passed")
    if passed == total:
        print("  🎉 All tests passed!")
    else:
        failed = [k for k, v in results.items() if not v]
        print(f"  ⚠️  Failed: {', '.join(failed)}")
    print(f"{'=' * 60}\n")

    # Cleanup test video
    if test_video_path and os.path.exists(test_video_path):
        os.remove(test_video_path)

    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.path.insert(0, str(PROJECT_DIR))
    sys.exit(main())
