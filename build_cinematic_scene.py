import os
import time
import json
import subprocess
import requests
import fal_client
import shutil
from concurrent.futures import ThreadPoolExecutor

LUMA_SCRIPT = os.path.expanduser("~/.openclaw/workspace/skills/luma-video-manager/luma_api.sh")
ASSETS_DIR = "/tmp/sarah_ben_assets"
FINAL_DIR = os.path.expanduser("~/.openclaw/workspace/projects/movieanimation/public/animations")
FINAL_OUTPUT = os.path.join(FINAL_DIR, "sarah_ben_cinematic_v2.mp4")

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(FINAL_DIR, exist_ok=True)

PROMPTS = {
    1: "wide shot, empty diner, rainy window, man waiting",
    2: "close up, woman energetic smiling, soaking wet",
    3: "close up, man weary looking at coffee",
    4: "wide shot, old waiter approaching diner booth",
    5: "close up, woman smiling ordering food",
    6: "close up, man looking annoyed",
    7: "close up, woman looking serious",
    8: "close up, old waiter unamused",
    9: "close up, man conceding",
    10: "wide shot, woman leaning across table",
    11: "close up, man hand pulling silver key from coat pocket",
    12: "close up, man serious"
}

SYNC_SHOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Command failed: {cmd}\nError: {result.stderr}")
    return result.stdout.strip()

def generate_luma(prompt):
    output = run_cmd(f"bash {LUMA_SCRIPT} generate \"{prompt}\"")
    try:
        data = json.loads(output)
        return data["id"]
    except Exception as e:
        print(f"Failed to parse: {output}")
        raise e

def poll_luma(gen_id):
    while True:
        output = run_cmd(f"bash {LUMA_SCRIPT} poll {gen_id}")
        data = json.loads(output)
        state = data.get("state")
        if state == "completed":
            print(f"[{gen_id}] completed")
            return True
        elif state == "failed":
            print(f"Failed {gen_id}")
            return False
        else:
            print(f"[{gen_id}] state: {state}")
        time.sleep(10)

def download_luma(gen_id, out_path):
    run_cmd(f"bash {LUMA_SCRIPT} download {gen_id} {out_path}")

def process_sync(i, raw_video, audio_file, final_video):
    print(f"Applying LatentSync for Shot {i}...")
    try:
        video_url = fal_client.upload_file(raw_video)
        audio_url = fal_client.upload_file(audio_file)
        result = fal_client.subscribe(
            "fal-ai/latentsync",
            arguments={"video_url": video_url, "audio_url": audio_url}
        )
        synced_url = result['video']['url']
        res = requests.get(synced_url)
        with open(final_video, 'wb') as f:
            f.write(res.content)
        print(f"Shot {i} sync completed.")
    except Exception as e:
        print(f"Sync failed for Shot {i} ({e}). Falling back to raw video.")
        shutil.copy(raw_video, final_video)

def main():
    final_files = []
    jobs = {}
    if os.path.exists("/tmp/sarah_ben_assets/jobs.json"):
        with open("/tmp/sarah_ben_assets/jobs.json") as f:
            jobs_str = json.load(f)
            jobs = {int(k): v for k, v in jobs_str.items()}

    # 1. Queue all generations
    print("--- Queuing Luma Generations ---")
    for i in range(1, 13):
        raw_video = os.path.join(ASSETS_DIR, f"raw_shot_{i}.mp4")
        if os.path.exists(raw_video) or i in jobs:
            print(f"Shot {i} already generated or queued.")
            continue
        try:
            gen_id = generate_luma(PROMPTS[i])
            jobs[i] = gen_id
            print(f"Shot {i} queued: {gen_id}")
        except Exception as e:
            print(f"Error queuing shot {i}: {e}")

    with open("/tmp/sarah_ben_assets/jobs.json", "w") as f:
        json.dump(jobs, f)

    # 2. Poll & Download
    print("\n--- Polling and Downloading ---")
    for i, gen_id in jobs.items():
        raw_video = os.path.join(ASSETS_DIR, f"raw_shot_{i}.mp4")
        if os.path.exists(raw_video):
            continue
        print(f"Polling shot {i} ({gen_id})...")
        if poll_luma(gen_id):
            download_luma(gen_id, raw_video)
            print(f"Downloaded shot {i}")
            
    # 3. LatentSync Process (Concurrent)
    print("\n--- Processing LatentSync ---")
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        for i in range(1, 13):
            raw_video = os.path.join(ASSETS_DIR, f"raw_shot_{i}.mp4")
            final_video = os.path.join(ASSETS_DIR, f"final_shot_{i}.mp4")
            final_files.append(final_video)
            
            if os.path.exists(final_video):
                continue
                
            if not os.path.exists(raw_video):
                print(f"Skipping shot {i} sync because raw_video does not exist.")
                continue

            if i in SYNC_SHOTS:
                audio_file = os.path.join(ASSETS_DIR, f"audio_{i}.mp3")
                futures.append(executor.submit(process_sync, i, raw_video, audio_file, final_video))
            else:
                shutil.copy(raw_video, final_video)
                print(f"Shot {i} copied (no sync).")
                
        for future in futures:
            future.result()
            
    # 4. Assembling
    print("\n--- Assembling Final Movie ---")
    concat_file = os.path.join(ASSETS_DIR, "concat.txt")
    with open(concat_file, "w") as f:
        for final_f in final_files:
            f.write(f"file '{final_f}'\n")
            
    ffmpeg_cmd = f"ffmpeg -f concat -safe 0 -i {concat_file} -c copy -y {FINAL_OUTPUT}"
    run_cmd(ffmpeg_cmd)
    print(f"✅ Final cinematic movie created: {FINAL_OUTPUT}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.openclaw/workspace/.env"))
    main()
