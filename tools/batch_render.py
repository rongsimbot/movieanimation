#!/usr/bin/env python3
"""
batch_render.py - MovieAnimation Batch Rendering CLI Tool
Phase 8: Final Rendering Pipeline

Discovers video files in an input directory, submits them to the
MovieAnimation backend export API, and monitors progress with a
real-time progress bar.

Usage:
    python batch_render.py --input ./videos --output ./renders --tier pro
    python batch_render.py --input ./videos --resolution 4k --format mov --slow
    python batch_render.py --input ./videos --dry-run

Features:
    - Recursive video file discovery (mp4, mov, webm, avi, mkv)
    - Parallel job submission via ThreadPoolExecutor
    - Live progress tracking with tqdm
    - Tier presets: free (720p/fast), pro (1080p/medium), studio (4k/slow)
    - Dry-run mode for preview
    - Summary report with file sizes, durations, success rates
"""

import argparse
import concurrent.futures
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from tqdm import tqdm

# ─── Configuration ───────────────────────────────────────────────

API_BASE_URL = os.environ.get("MOVIEANIMATION_API", "http://localhost:3001/api")
API_TOKEN = os.environ.get("MOVIEANIMATION_TOKEN", "")
POLL_INTERVAL_SECONDS = 5
MAX_WORKERS = 4
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v", ".wmv"}

# ─── Tier Presets ────────────────────────────────────────────────

TIER_PRESETS: Dict[str, Dict[str, str]] = {
    "free":   {"resolution": "720p",  "compression": "fast"},
    "pro":    {"resolution": "1080p", "compression": "medium"},
    "studio": {"resolution": "4k",    "compression": "slow"},
}

# ─── Logging Setup ───────────────────────────────────────────────

def setup_logging(verbose: bool) -> logging.Logger:
    """Configure logging with appropriate level."""
    logger = logging.getLogger("batch_render")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            "[%(asctime)s] %(levelname)s - %(message)s",
            datefmt="%H:%M:%S",
        ))
        logger.addHandler(handler)
    return logger

log = logging.getLogger("batch_render")

# ─── API Helpers ─────────────────────────────────────────────────

def _api_headers() -> Dict[str, str]:
    """Build request headers with auth token if available."""
    headers = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    return headers


def api_request(
    method: str,
    endpoint: str,
    data: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
) -> Tuple[bool, Any]:
    """Make an API request to the MovieAnimation backend."""
    url = f"{API_BASE_URL}{endpoint}"
    try:
        if method == "GET":
            resp = requests.get(url, headers=_api_headers(), timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, headers=_api_headers(), json=data, timeout=timeout)
        elif method == "DELETE":
            resp = requests.delete(url, headers=_api_headers(), timeout=timeout)
        else:
            return False, f"Unsupported method: {method}"

        if resp.status_code >= 400:
            try:
                err = resp.json().get("error", resp.text)
            except Exception:
                err = resp.text
            return False, f"HTTP {resp.status_code}: {err}"

        return True, resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
    except requests.exceptions.ConnectionError:
        return False, "Connection refused - is the backend running?"
    except requests.exceptions.Timeout:
        return False, f"Request to {endpoint} timed out after {timeout}s"
    except Exception as e:
        return False, str(e)


def check_backend_health() -> bool:
    """Verify the backend API is reachable."""
    ok, data = api_request("GET", "/health")
    if ok:
        log.info(f"Backend reachable: {data.get('service', 'unknown')} v{data.get('version', '?')}")
        return True
    log.error(f"Backend unreachable: {data}")
    return False


def create_export_job(
    input_path: str,
    project_id: int,
    resolution: str,
    fmt: str,
    compression: str,
) -> Tuple[bool, Any]:
    """Submit an export job to the backend."""
    payload = {
        "input_path": input_path,
        "project_id": project_id,
        "name": f"Batch_{Path(input_path).stem}",
        "resolution": resolution,
        "format": fmt,
        "compression_level": compression,
    }
    return api_request("POST", "/exports", data=payload, timeout=30)


def get_export_status(export_id: int) -> Tuple[bool, Any]:
    """Poll for export job status and details."""
    return api_request("GET", f"/exports/{export_id}", timeout=10)


# ─── File Discovery ──────────────────────────────────────────────

def discover_videos(input_dir: str) -> List[Path]:
    """Recursively find all video files in a directory."""
    root = Path(input_dir).resolve()
    if not root.exists():
        log.error(f"Input directory does not exist: {input_dir}")
        sys.exit(1)
    if not root.is_dir():
        log.error(f"Input path is not a directory: {input_dir}")
        sys.exit(1)

    videos: List[Path] = []
    for ext in VIDEO_EXTENSIONS:
        videos.extend(root.rglob(f"*{ext}"))
        videos.extend(root.rglob(f"*{ext.upper()}"))

    videos.sort()
    return videos


def get_file_info(filepath: Path) -> Dict[str, Any]:
    """Get file metadata: size, modification time."""
    stat = filepath.stat()
    return {
        "path": str(filepath),
        "name": filepath.name,
        "size_bytes": stat.st_size,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


# ─── Progress Tracking ───────────────────────────────────────────

def format_duration(seconds: float) -> str:
    """Format seconds into human-readable string."""
    return str(timedelta(seconds=int(seconds)))


def format_size(bytes_val: int) -> str:
    """Format bytes into human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} PB"


def poll_until_complete(
    export_id: int,
    file_name: str,
    pbar: tqdm,
    max_wait_seconds: int = 3600,
) -> Tuple[bool, Dict[str, Any]]:
    """Poll an export job until completion or timeout."""
    start_time = time.time()
    last_progress = 0

    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait_seconds:
            return False, {"error": "Timed out waiting for export", "export_id": export_id}

        ok, data = api_request("GET", f"/exports/{export_id}", timeout=10)
        if not ok:
            log.warning(f"  Poll error for {file_name}: {data}")
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        export = data.get("export", {})
        status = export.get("status", "unknown")
        progress = export.get("progress", 0)

        if progress != last_progress:
            pbar.set_postfix_str(f"{file_name}: {status} {progress}%")
            last_progress = progress

        if status == "completed":
            pbar.set_postfix_str(f"{file_name}: ✅ completed")
            return True, export
        elif status == "failed":
            error_msg = export.get("errorMessage", "Unknown error")
            pbar.set_postfix_str(f"{file_name}: ❌ failed")
            return False, {"error": error_msg, "export_id": export_id}
        elif status == "expired":
            return False, {"error": "Export expired", "export_id": export_id}

        time.sleep(POLL_INTERVAL_SECONDS)


# ─── Main Render Pipeline ────────────────────────────────────────

def run_batch(args: argparse.Namespace) -> int:
    """Execute the batch rendering pipeline."""
    # Resolve tier presets
    if args.tier:
        preset = TIER_PRESETS[args.tier]
        resolution = preset["resolution"]
        compression = preset["compression"]
        log.info(f"Using tier preset: {args.tier} → {resolution} / {compression}")
    else:
        resolution = args.resolution
        compression = "slow" if args.slow else ("fast" if args.fast else "medium")

    render_format = args.format
    project_id = args.project_id
    output_dir = Path(args.output_dir).resolve() if args.output_dir else None
    workers = min(args.workers, MAX_WORKERS)
    dry_run = args.dry_run

    # Discover videos
    log.info(f"Scanning {args.input} for video files...")
    videos = discover_videos(args.input)

    if not videos:
        log.error("No video files found.")
        return 1

    log.info(f"Found {len(videos)} video(s)")

    # Collect file info
    files_info = [get_file_info(v) for v in videos]
    total_size = sum(f["size_bytes"] for f in files_info)

    # Print preview table
    print(f"\n{'═' * 70}")
    print(f"  🎬 MovieAnimation Batch Render")
    print(f"{'═' * 70}")
    print(f"  Resolution:     {resolution}")
    print(f"  Format:         .{render_format}")
    print(f"  Compression:    {compression}")
    print(f"  Files:          {len(videos)}")
    print(f"  Total size:     {format_size(total_size)}")
    print(f"  Workers:        {workers}")
    print(f"  Dry run:        {'YES' if dry_run else 'no'}")
    print(f"{'═' * 70}\n")

    for i, fi in enumerate(files_info, 1):
        print(f"  {i:3d}. {fi['name']:<50s} {fi['size_mb']:>8.1f} MB")
    print()

    if dry_run:
        log.info("Dry run complete — no files were processed.")
        return 0

    # Verify backend
    if not check_backend_health():
        log.error("Backend not available. Start the MovieAnimation server first.")
        return 2

    # Confirmation
    if not args.yes:
        try:
            response = input("Proceed with rendering? [y/N] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            log.info("Cancelled.")
            return 0
        if response not in ("y", "yes"):
            log.info("Cancelled.")
            return 0

    # Submit all jobs in parallel
    log.info(f"Submitting {len(videos)} export job(s) with {workers} worker(s)...")

    export_jobs: List[Dict[str, Any]] = []
    failed_submissions: List[Dict[str, Any]] = []

    def submit_one(fi: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a single file for export."""
        ok, result = create_export_job(
            input_path=fi["path"],
            project_id=project_id,
            resolution=resolution,
            fmt=render_format,
            compression=compression,
        )
        return {
            "file": fi,
            "ok": ok,
            "result": result,
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(submit_one, fi): fi for fi in files_info}
        for future in tqdm(
            concurrent.futures.as_completed(futures),
            total=len(futures),
            desc="Submitting",
            unit="file",
        ):
            job = future.result()
            if job["ok"] and job["result"].get("export"):
                export_jobs.append({
                    "export_id": job["result"]["export"]["id"],
                    "file": job["file"],
                    "job_id": job["result"].get("jobId"),
                })
            else:
                failed_submissions.append(job)

    if failed_submissions:
        log.warning(f"{len(failed_submissions)} submission(s) failed:")
        for f in failed_submissions:
            log.warning(f"  - {f['file']['name']}: {f['result']}")

    if not export_jobs:
        log.error("No jobs were submitted successfully.")
        return 3

    log.info(f"Submitted {len(export_jobs)} job(s). Monitoring progress...\n")

    # Monitor all jobs
    completed: List[Dict[str, Any]] = []
    failed: List[Dict[str, Any]] = []

    with tqdm(total=len(export_jobs), desc="Rendering", unit="file") as pbar:
        # Poll all jobs concurrently
        def monitor_one(job: Dict[str, Any]) -> Dict[str, Any]:
            ok, result = poll_until_complete(
                export_id=job["export_id"],
                file_name=job["file"]["name"],
                pbar=pbar,
            )
            pbar.update(1)
            return {
                "file": job["file"],
                "export_id": job["export_id"],
                "ok": ok,
                "result": result,
            }

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            monitor_futures = {
                executor.submit(monitor_one, job): job for job in export_jobs
            }
            for future in concurrent.futures.as_completed(monitor_futures):
                outcome = future.result()
                if outcome["ok"]:
                    completed.append(outcome)
                else:
                    failed.append(outcome)

    # ─── Summary Report ──────────────────────────────────────────
    print(f"\n{'═' * 70}")
    print(f"  📊 Batch Render Summary")
    print(f"{'═' * 70}")
    print(f"  Total files:     {len(videos)}")
    print(f"  Submitted:       {len(export_jobs)}")
    print(f"  ✅ Completed:    {len(completed)}")
    print(f"  ❌ Failed:       {len(failed)}")
    print(f"  🚫 Not submitted:{len(failed_submissions)}")
    print(f"  Total input size:{format_size(total_size)}")

    if completed:
        total_output_size = sum(
            c.get("result", {}).get("output_size_bytes", 0) for c in completed
        )
        total_duration = sum(
            c.get("result", {}).get("output_duration_seconds", 0) for c in completed
        )
        print(f"  Output size:     {format_size(total_output_size)}")
        print(f"  Total duration:  {format_duration(total_duration)}")

    print(f"{'═' * 70}\n")

    if completed:
        print("✅ Completed files:")
        for c in completed:
            fi = c["file"]
            exp = c["result"]
            size = format_size(exp.get("output_size_bytes", 0))
            dur = format_duration(exp.get("output_duration_seconds", 0))
            print(f"  {fi['name']:<50s} {size:>10s}  {dur:>10s}")

    if failed:
        print("\n❌ Failed files:")
        for f in failed:
            fi = f["file"]
            err = f["result"].get("error", "Unknown error") if isinstance(f["result"], dict) else str(f["result"])
            print(f"  {fi['name']:<50s} {err}")

    # Cleanup recommendation
    total_completed = len(completed)
    total_failed = len(failed) + len(failed_submissions)
    if total_completed > 0:
        print(f"\n💡 Exports are available via the MovieAnimation dashboard or API.")
        print(f"   API_BASE_URL: {API_BASE_URL}")

    return 0 if total_failed == 0 else 4


# ─── Argument Parser ─────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    """Build the command-line argument parser."""
    parser = argparse.ArgumentParser(
        description="MovieAnimation Batch Video Renderer - Phase 8",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Render with tier preset (recommended)
  python batch_render.py --input ./videos --tier pro

  # Custom resolution and format
  python batch_render.py --input ./videos --resolution 4k --format mov --slow

  # Preview without rendering
  python batch_render.py --input ./videos --tier studio --dry-run

  # Auto-confirm (skip y/N prompt)
  python batch_render.py --input ./videos --tier free --yes

Tier Presets:
  free    → 720p resolution, fast compression (smaller files)
  pro     → 1080p resolution, medium compression (balanced)
  studio  → 4K resolution, slow compression (highest quality)
        """,
    )

    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Input directory containing video files (recursive search)",
    )

    # Tier presets
    parser.add_argument(
        "--tier", "-t",
        choices=["free", "pro", "studio"],
        help="Rendering tier preset (overrides --resolution and compression flags)",
    )

    # Manual options
    parser.add_argument(
        "--resolution", "-r",
        choices=["720p", "1080p", "4k"],
        default="1080p",
        help="Output resolution (default: 1080p)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["mp4", "mov", "webm"],
        default="mp4",
        help="Output format (default: mp4)",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Fast compression (smaller file, lower quality)",
    )
    parser.add_argument(
        "--slow",
        action="store_true",
        help="Slow compression (larger file, higher quality)",
    )

    # Processing options
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=MAX_WORKERS,
        help=f"Maximum parallel workers (default: {MAX_WORKERS})",
    )
    parser.add_argument(
        "--project-id", "-p",
        type=int,
        default=1,
        help="Project ID to associate exports with (default: 1)",
    )
    parser.add_argument(
        "--output-dir", "-o",
        help="Output directory (not required - backend manages output)",
    )

    # Flags
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview files without rendering",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip confirmation prompt",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )

    return parser


# ─── Entry Point ─────────────────────────────────────────────────

def main() -> int:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    setup_logging(args.verbose)

    # Validate tier combination with manual flags
    if args.tier and (args.fast or args.slow):
        log.warning("--tier overrides --fast/--slow flags")

    try:
        return run_batch(args)
    except KeyboardInterrupt:
        print("\n")
        log.warning("Interrupted by user.")
        return 130
    except Exception as e:
        log.exception(f"Unexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
