// backend/src/utils/audioConverter.js
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from 'fs';
import { extname } from 'path';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Check if file is already WAV format
 * @param {string} filePath - Path to audio file
 * @returns {Promise<boolean>} True if file is WAV format
 */
async function isWavFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return ext === '.wav' || ext === '.wave';
}

/**
 * Check if WAV file matches target sample rate (quick check without full conversion)
 * @param {string} wavPath - Path to WAV file
 * @param {number} targetSampleRate - Target sample rate
 * @returns {Promise<boolean>} True if sample rate matches
 */
async function checkWavSampleRate(wavPath, targetSampleRate) {
  try {
    // Use ffprobe to quickly check sample rate without conversion
    return new Promise((resolve) => {
      ffmpeg.ffprobe(wavPath, (err, metadata) => {
        if (err) {
          resolve(false); // If we can't check, assume needs conversion
          return;
        }
        const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
        const matches = audioStream && audioStream.sample_rate == targetSampleRate;
        resolve(matches || false);
      });
    });
  } catch (error) {
    return false; // If check fails, assume needs conversion
  }
}

/**
 * Convert audio file to WAV format (optimized - skips conversion if already WAV)
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output WAV file
 * @param {number} sampleRate - Target sample rate (default: based on MODEL_TYPE env var)
 * @returns {Promise<string>} Path to converted WAV file
 */
export async function convertToWav(inputPath, outputPath, sampleRate = null) {
  // Determine sample rate based on MODEL_TYPE if not provided
  if (sampleRate === null) {
    const modelType = (process.env.MODEL_TYPE || 'cnn14').toLowerCase();
    sampleRate = modelType === 'cnn14' ? 32000 : 16000;
  }
  
  // Optimization: If input is already WAV with correct sample rate, just copy it
  if (await isWavFile(inputPath)) {
    const matchesSampleRate = await checkWavSampleRate(inputPath, sampleRate);
    if (matchesSampleRate) {
      // File is already WAV with correct sample rate - just copy it
      await fs.copyFile(inputPath, outputPath);
      return outputPath;
    }
  }
  
  // Need to convert - use optimized ffmpeg settings for speed
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("pcm_s16le")
      .audioChannels(1)
      .audioFrequency(sampleRate)
      .format("wav")
      .audioBitrate(128) // Lower bitrate for faster processing (still high quality for speech/sounds)
      .outputOptions([
        '-threads', '0', // Use all available CPU threads
        '-preset', 'ultrafast' // Fastest encoding preset
      ])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}
