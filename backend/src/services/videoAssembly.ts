import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';

// Set the path to the statically installed ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface Scene {
  videoPath: string;
  duration?: number;
}

export interface AssemblyOptions {
  scenes: Scene[];
  audioPath?: string;
  outputPath: string;
}

export const assembleVideo = (options: AssemblyOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const { scenes, audioPath, outputPath } = options;

      if (!scenes || scenes.length === 0) {
        return reject(new Error('No scenes provided for assembly.'));
      }

      // Ensure output directory exists
      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const command = ffmpeg();

      // Add all video scenes as inputs
      scenes.forEach(scene => {
        command.input(scene.videoPath);
      });

      // If there is a master audio track, add it
      if (audioPath) {
        command.input(audioPath);
      }

      // We use the complex filter to concatenate the videos.
      // This requires all videos to have the same resolution and framerate, or we must scale them.
      // For this MVP, we assume they are standard 1080p from the AI generators.
      command.on('start', (cmdLine) => {
        console.log('Started FFmpeg with command:', cmdLine);
      })
      .on('progress', (progress) => {
        console.log('FFmpeg processing: ' + progress.percent + '% done');
      })
      .on('end', () => {
        console.log('Video assembly completed successfully:', outputPath);
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg Error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        reject(err);
      });

      // Execute merge
      command.mergeToFile(outputPath, outDir);

    } catch (err) {
      reject(err);
    }
  });
};
