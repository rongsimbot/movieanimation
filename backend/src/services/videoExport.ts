import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface ExportOptions {
  inputPath: string;
  outputPath: string;
  resolution: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
}

export const exportVideo = (options: ExportOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const { inputPath, outputPath, resolution, format } = options;

      if (!fs.existsSync(inputPath)) {
        return reject(new Error('Input video file does not exist.'));
      }

      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const command = ffmpeg(inputPath);

      // Apply resolution scaling
      if (resolution === '720p') {
        command.size('1280x720');
      } else if (resolution === '1080p') {
        command.size('1920x1080');
      } else if (resolution === '4k') {
        command.size('3840x2160');
      }

      // Apply format and codec settings for optimization
      if (format === 'mp4') {
        command.format('mp4').videoCodec('libx264').audioCodec('aac');
      } else if (format === 'mov') {
        command.format('mov').videoCodec('libx264').audioCodec('aac');
      } else if (format === 'webm') {
        command.format('webm').videoCodec('libvpx-vp9').audioCodec('libopus');
      }

      command.on('start', (cmdLine) => {
        console.log('Started FFmpeg Export with command:', cmdLine);
      })
      .on('progress', (progress) => {
        console.log('Export processing: ' + progress.percent + '% done');
      })
      .on('end', () => {
        console.log('Video export completed successfully:', outputPath);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('FFmpeg Export Error:', err.message);
        reject(err);
      });

      // Execute render
      command.save(outputPath);

    } catch (err) {
      reject(err);
    }
  });
};
