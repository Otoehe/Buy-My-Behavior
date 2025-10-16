// src/components/videoProcessing.ts
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

const ffmpeg = createFFmpeg({ log: false });

export async function processVideo(file: File): Promise<Blob> {
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

  await ffmpeg.run(
    '-i', 'input.mp4',
    '-t', '30', // обрізка до 30 секунд
    '-vf', 'scale=-2:720,fps=24', // стискання до 720p, 24fps
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-c:a', 'aac',
    'output.mp4'
  );

  const data = ffmpeg.FS('readFile', 'output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
