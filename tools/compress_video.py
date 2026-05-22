#!/usr/bin/env python3
"""
compress_video.py - Video Compression & Optimization Utility
MovieAnimation Phase 8: Final Rendering Pipeline

Applies smart compression to rendered videos using FFmpeg directly.
Supports quality presets, format conversion, and batch processing.

Usage:
    # Compress a single video
    python compress_video.py --input video.mp4 --preset web

    # Batch compress a directory
    python compress_video.py --input ./renders --preset archive --output ./compressed

    # Convert to different format while compressing
    python compress_video.py --input video.mov --format mp4 --preset streaming

Presets:
    preview  - 360p, 5Mbps, very fast (for quick previews)
    web      - 720p, 2Mbps, optimized for web streaming
    streaming - 1080p, 5Mbps, HLS-ready
    archive  - Original resolution, 1Mbps, maximum compression
    lossless - Original resolution, CRF 15, visually lossless
"""

import argparse
import concurrent.futures
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from tqdm import tqdm

# ─── Compression Presets ─────────────────────────────────────────

PRESETS: Dict[str, Dict[str, str]] = {
    "preview": {
        "resolution": "360p",
        "bitrate": "500k",
        "crf": "30",
        "preset": "veryfast",
        "description": "360p quick preview (tiny files)",
    },
    "web": {
        "resolution": "720p",
        "bitrate": "2M",
        "crf": "28",
        "preset": "fast",
        "description": "720p web streaming optimized",
    },
    "streaming": {
        "resolution": "1080p",
        "bitrate": "5M",
        "crf": "23",
        "preset": "medium",
        "description": "1080p HLS/DASH streaming",
    },
    "archive": {
        "resolution": "original",
        "bitrate": "1M",
        "crf": "28",
        "preset": "veryfast",
        "description": "Max compression for archiving",
    },
    "lossless": {
        "resolution": "original",
        "bitrate": "",
        "crf": "15",
        "preset": "slow",
        "description": "Visually lossless high quality",
    },
}

RESOLUTIONS: Dict[str, str] = {
    "360p": "640:360",
    "480p": "854:480",
    "720p": "1280:720",
    "1080p": "1920:1080",
    "4k": "3840:2160",
}

# ─── Logging ─────────────────────────────────────────────────────

def setup_logging(verbose: bool) -> logging.Logger:
    logger = logging.getLogger("compress")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    if not logger.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s - %(message)s", "%H:%M:%S"))
        logger.addHandler(h)
    return logger

log = logging.getLogger("compress")

# ─── Helpers ─────────────────────────────────────────────────────

def format_size(bytes_val: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} PB"


def probe_video(filepath: str) -> Optional[Dict]:
    """Probe video with ffprobe for metadata."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", filepath,
            ],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            log.warning(f"ffprobe failed for {filepath}: {result.stderr[:200]}")
            return None
        return json.loads(result.stdout)
    except FileNotFoundError:
        log.error("ffprobe not found. Install FFmpeg first.")
        return None
    except Exception as e:
        log.warning(f"Probe error for {filepath}: {e}")
        return None


def get_video_info(filepath: str) -> Dict:
    """Extract key video properties."""
    stat = Path(filepath).stat()
    info = {
        "path": filepath,
        "name": Path(filepath).name,
        "size_bytes": stat.st_size,
        "width": 0,
        "height": 0,
        "duration": 0.0,
        "codec": "unknown",
        "fps": 30.0,
        "has_audio": False,
    }

    probe = probe_video(filepath)
    if not probe:
        return info

    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "video":
            info["width"] = stream.get("width", 0)
            info["height"] = stream.get("height", 0)
            info["codec"] = stream.get("codec_name", "unknown")
            # Parse framerate (e.g., "30000/1001")
            fps_str = stream.get("r_frame_rate", "30/1")
            try:
                num, den = fps_str.split("/")
                info["fps"] = float(num) / float(den) if float(den) != 0 else 30.0
            except (ValueError, ZeroDivisionError):
                info["fps"] = 30.0
        elif stream.get("codec_type") == "audio":
            info["has_audio"] = True

    fmt = probe.get("format", {})
    info["duration"] = float(fmt.get("duration", 0))

    return info


def generate_output_path(input_path: str, output_dir: str, suffix: str, fmt: str) -> str:
    """Generate output file path with suffix."""
    stem = Path(input_path).stem
    return str(Path(output_dir) / f"{stem}_{suffix}.{fmt}")


def build_ffmpeg_command(
    input_path: str,
    output_path: str,
    preset: Dict[str, str],
    fmt: str,
    target_resolution: Optional[str] = None,
) -> List[str]:
    """Build the FFmpeg command for compression."""
    cmd = ["ffmpeg", "-y", "-i", input_path]

    # Video codec based on format
    if fmt == "webm":
        cmd.extend(["-c:v", "libvpx-vp9", "-c:a", "libopus"])
    else:
        cmd.extend(["-c:v", "libx264", "-c:a", "aac"])

    # Preset (encoding speed)
    cmd.extend(["-preset", preset["preset"]])

    # CRF (quality)
    if preset["crf"]:
        cmd.extend(["-crf", preset["crf"]])

    # Bitrate
    if preset["bitrate"]:
        cmd.extend(["-b:v", preset["bitrate"]])

    # Resolution scaling
    if target_resolution:
        scale_target = RESOLUTIONS.get(target_resolution)
        if scale_target:
            cmd.extend(["-vf", f"scale={scale_target}:force_original_aspect_ratio=decrease,pad={scale_target}:(ow-iw)/2:(oh-ih)/2,setsar=1"])

    # Audio
    if fmt == "webm":
        cmd.extend(["-b:a", "128k"])
    else:
        cmd.extend(["-b:a", "128k", "-ac", "2"])

    # Pixel format (compatibility)
    cmd.extend(["-pix_fmt", "yuv420p"])

    # Fast start for web streaming
    if fmt == "mp4":
        cmd.extend(["-movflags", "+faststart"])

    # Output
    cmd.append(output_path)

    return cmd


def compress_video(
    input_path: str,
    output_path: str,
    preset_name: str,
    fmt: str = "mp4",
    target_resolution: Optional[str] = None,
) -> Tuple[bool, Dict]:
    """Compress a single video file."""
    preset = PRESETS.get(preset_name)
    if not preset:
        return False, {"error": f"Unknown preset: {preset_name}"}

    cmd = build_ffmpeg_command(input_path, output_path, preset, fmt, target_resolution)

    log.debug(f"Running: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

        if result.returncode != 0:
            stderr_tail = result.stderr.strip().split("\n")[-5:] if result.stderr else []
            error_msg = "\n".join(stderr_tail) if stderr_tail else "FFmpeg failed with no output"
            return False, {"error": error_msg[:500]}

        # Get output file size
        output_size = os.path.getsize(output_path)
        input_size = os.path.getsize(input_path)
        ratio = round((1 - output_size / input_size) * 100, 1) if input_size > 0 else 0

        return True, {
            "output_path": output_path,
            "output_size_bytes": output_size,
            "input_size_bytes": input_size,
            "compression_ratio_pct": ratio,
            "saved_bytes": input_size - output_size,
        }

    except subprocess.TimeoutExpired:
        return False, {"error": "Compression timed out (1 hour limit)"}
    except Exception as e:
        return False, {"error": str(e)}


# ─── Main Pipeline ───────────────────────────────────────────────

def run_compression(args: argparse.Namespace) -> int:
    """Execute the compression pipeline."""
    input_path = Path(args.input).resolve()
    preset_name = args.preset
    fmt = args.format
    target_resolution = args.resolution if args.resolution != "original" else None
    output_dir = Path(args.output).resolve() if args.output else input_path.parent / "compressed"
    workers = min(args.workers, 8)
    dry_run = args.dry_run

    preset = PRESETS.get(preset_name)
    if not preset:
        log.error(f"Unknown preset: {preset_name}. Choices: {', '.join(PRESETS.keys())}")
        return 1

    # Collect input files
    if input_path.is_file():
        files = [input_path]
    elif input_path.is_dir():
        extensions = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
        files = sorted([f for f in input_path.rglob("*") if f.suffix.lower() in extensions])
    else:
        log.error(f"Input path not found: {input_path}")
        return 1

    if not files:
        log.error("No video files found.")
        return 1

    # Gather file info
    files_info = []
    for f in files:
        info = get_video_info(str(f))
        files_info.append(info)

    total_input_size = sum(fi["size_bytes"] for fi in files_info)

    print(f"\n{'═' * 70}")
    print(f"  🗜️  Video Compression Tool")
    print(f"{'═' * 70}")
    print(f"  Preset:         {preset_name} ({preset['description']})")
    print(f"  Format:         .{fmt}")
    print(f"  Resolution:     {target_resolution or 'original'}")
    print(f"  Files:          {len(files_info)}")
    print(f"  Total size:     {format_size(total_input_size)}")
    print(f"  Output dir:     {output_dir}")
    print(f"  Workers:        {workers}")
    print(f"  Dry run:        {'YES' if dry_run else 'no'}")
    print(f"{'═' * 70}\n")

    if dry_run:
        for i, fi in enumerate(files_info, 1):
            print(f"  {i:3d}. {fi['name']:<45s} {fi.get('width',0)}x{fi.get('height',0)}  {format_size(fi['size_bytes'])}")
        print(f"\n  Dry run complete — no files compressed.\n")
        return 0

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Confirmation
    if not args.yes:
        try:
            response = input("Proceed with compression? [y/N] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            log.info("Cancelled.")
            return 0
        if response not in ("y", "yes"):
            log.info("Cancelled.")
            return 0

    # Process files
    results: List[Dict] = []

    def compress_one(fi: Dict) -> Dict:
        output_path = generate_output_path(fi["path"], str(output_dir), preset_name, fmt)
        ok, result = compress_video(fi["path"], output_path, preset_name, fmt, target_resolution)
        return {**fi, "ok": ok, "result": result}

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(compress_one, fi): fi for fi in files_info}
        for future in tqdm(
            concurrent.futures.as_completed(futures),
            total=len(futures),
            desc="Compressing",
            unit="file",
        ):
            r = future.result()
            results.append(r)

    # Summary
    succeeded = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    total_output_size = sum(
        r["result"].get("output_size_bytes", 0) for r in succeeded
    )
    total_saved = sum(
        r["result"].get("saved_bytes", 0) for r in succeeded
    )

    print(f"\n{'═' * 70}")
    print(f"  📊 Compression Summary")
    print(f"{'═' * 70}")
    print(f"  Files processed: {len(results)}")
    print(f"  ✅ Succeeded:    {len(succeeded)}")
    print(f"  ❌ Failed:       {len(failed)}")
    print(f"  Input size:      {format_size(total_input_size)}")
    print(f"  Output size:     {format_size(total_output_size)}")
    if total_input_size > 0:
        print(f"  Space saved:     {format_size(total_saved)} ({round(total_saved/total_input_size*100,1)}%)")
    print(f"{'═' * 70}\n")

    if succeeded:
        print("✅ Compressed files:")
        for r in succeeded:
            res = r["result"]
            saved = format_size(res.get("saved_bytes", 0))
            ratio = res.get("compression_ratio_pct", 0)
            out_name = Path(res["output_path"]).name
            print(f"  {out_name:<45s} {saved:>10s} saved ({ratio}%)")

    if failed:
        print("\n❌ Failed:")
        for r in failed:
            err = r["result"].get("error", "Unknown") if isinstance(r.get("result"), dict) else str(r.get("result", ""))
            print(f"  {r['name']:<45s} {err[:80]}")

    return 0 if not failed else 2


# ─── CLI Parser ─────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="MovieAnimation Video Compression Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python compress_video.py --input video.mp4 --preset web
  python compress_video.py --input ./renders/ --preset archive --output ./compressed
  python compress_video.py --input video.mov --preset streaming --format mp4
  python compress_video.py --input ./videos/ --preset preview --dry-run
        """,
    )

    parser.add_argument("--input", "-i", required=True, help="Input video file or directory")
    parser.add_argument("--preset", "-p", choices=list(PRESETS.keys()), default="web",
                        help="Compression preset (default: web)")
    parser.add_argument("--format", "-f", choices=["mp4", "mov", "webm"], default="mp4",
                        help="Output format (default: mp4)")
    parser.add_argument("--resolution", "-r", choices=list(RESOLUTIONS.keys()) + ["original"],
                        default="original", help="Target resolution (default: original)")
    parser.add_argument("--output", "-o", help="Output directory (default: ./compressed)")
    parser.add_argument("--workers", "-w", type=int, default=4, help="Parallel workers (default: 4)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without compressing")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation")
    parser.add_argument("--verbose", "-v", action="store_true", help="Debug logging")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    setup_logging(args.verbose)

    try:
        return run_compression(args)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130
    except Exception as e:
        log.exception(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
