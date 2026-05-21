import os
import subprocess

workspace_dir = os.path.expanduser('~/.openclaw/workspace/projects/movieanimation/')
os.chdir(workspace_dir)

# Shots 2,3,4,5,6,7,8,9,10,12 have audio_{i}.mp3
# Shots 1, 11 are silent

for i in range(1, 13):
    visual_input = f"/tmp/sarah_ben_assets/final_shot_{i}.mp4"
    audio_input = f"/tmp/sarah_ben_assets/audio_{i}.mp3"
    output_file = f"norm_shot_{i}.mp4"
    
    if i in [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]:
        cmd = [
            "ffmpeg", "-y",
            "-i", visual_input,
            "-i", audio_input,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-ar", "48000", "-ac", "2",
            "-shortest",
            output_file
        ]
        print(f"Processing shot {i} with audio")
        subprocess.run(cmd, check=True)
    elif i in [1, 11]:
        cmd = [
            "ffmpeg", "-y",
            "-i", visual_input,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-ar", "48000", "-ac", "2",
            "-shortest",
            output_file
        ]
        print(f"Processing shot {i} (silent)")
        subprocess.run(cmd, check=True)

# Now concat them
concat_list = "concat_list.txt"
with open(concat_list, "w") as f:
    for i in range(1, 13):
        f.write(f"file 'norm_shot_{i}.mp4'\n")

final_output = "/home/lo/.openclaw/workspace/projects/movieanimation/public/animations/sarah_ben_cinematic_v3.mp4"

os.makedirs(os.path.dirname(final_output), exist_ok=True)

concat_cmd = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0",
    "-i", concat_list,
    "-c", "copy",
    final_output
]
subprocess.run(concat_cmd, check=True)

print("Concatenation complete. Done!")