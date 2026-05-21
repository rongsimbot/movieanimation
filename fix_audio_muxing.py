import os
import subprocess

def run_cmd(cmd):
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)

def main():
    base_path = '/tmp/sarah_ben_assets'
    final_videos = []
    
    for i in range(1, 13):
        video_file = os.path.join(base_path, f'final_shot_{i}.mp4')
        output_file = os.path.join(base_path, f'muxed_shot_{i}.mp4')
        
        if i in [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]:
            audio_file = os.path.join(base_path, f'audio_{i}.mp3')
            # Replace audio, re-encode audio to AAC to ensure compatibility
            cmd = [
                'ffmpeg', '-y', '-i', video_file, '-i', audio_file,
                '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', '-shortest', output_file
            ]
            run_cmd(cmd)
        elif i in [1, 11]:
            # Generate silent audio and mux
            cmd = [
                'ffmpeg', '-y', '-i', video_file, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
                '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', '-shortest', output_file
            ]
            run_cmd(cmd)
        
        final_videos.append(output_file)
    
    concat_list_file = os.path.join(base_path, 'concat_list.txt')
    with open(concat_list_file, 'w') as f:
        for vf in final_videos:
            f.write(f"file '{vf}'\n")
            
    # ensure output dir exists
    output_cinematic = os.path.expanduser('~/.openclaw/workspace/projects/movieanimation/public/animations/sarah_ben_cinematic_v2.mp4')
    os.makedirs(os.path.dirname(output_cinematic), exist_ok=True)
    
    cmd = [
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_list_file,
        '-c', 'copy', output_cinematic
    ]
    run_cmd(cmd)

if __name__ == '__main__':
    main()
