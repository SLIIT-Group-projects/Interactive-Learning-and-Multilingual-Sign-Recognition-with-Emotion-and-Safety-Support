import pkg from 'wavefile';
const { WaveFile } = pkg;

import sharp from "sharp";


export function convertToWav(m4aPath, wavPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(m4aPath)
      .audioCodec("pcm_s16le")
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .on("end", () => resolve(wavPath))
      .on("error", reject)
      .save(wavPath);
  });
}


function normalizeAudio(buffer, sampleRate) {
  // Convert to mono if stereo
  let monoBuffer;
  if (buffer.length === 2) {
    // Stereo - average channels
    monoBuffer = new Float32Array(buffer[0].length);
    for (let i = 0; i < buffer[0].length; i++) {
      monoBuffer[i] = (buffer[0][i] + buffer[1][i]) / 2;
    }
  } else {
    monoBuffer = Array.isArray(buffer) ? new Float32Array(buffer) : buffer;
  }

  // Resample if needed (simple linear interpolation)
  if (sampleRate !== parseInt(process.env.AUDIO_SAMPLE_RATE || 16000)) {
    const targetSampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || 16000);
    const ratio = sampleRate / targetSampleRate;
    const newLength = Math.floor(monoBuffer.length / ratio);
    const resampled = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const index = Math.floor(srcIndex);
      const frac = srcIndex - index;
      
      if (index + 1 < monoBuffer.length) {
        resampled[i] = monoBuffer[index] * (1 - frac) + monoBuffer[index + 1] * frac;
      } else {
        resampled[i] = monoBuffer[index];
      }
    }
    monoBuffer = resampled;
  }

  // Normalize to [-1, 1] range
  let max = 0;
  for (let i = 0; i < monoBuffer.length; i++) {
    const abs = Math.abs(monoBuffer[i]);
    if (abs > max) max = abs;
  }

  if (max > 0) {
    for (let i = 0; i < monoBuffer.length; i++) {
      monoBuffer[i] = monoBuffer[i] / max;
    }
  }

  return monoBuffer;
}

/**
 * Simple Radix-2 FFT implementation
 */
function fft(signal) {
  const N = signal.length;
  
  // Base case
  if (N <= 1) {
    return signal.map(x => ({ real: x, imag: 0 }));
  }
  
  // Ensure N is a power of 2 (pad with zeros if needed)
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(N)));
  const padded = new Array(nextPowerOf2).fill(0);
  for (let i = 0; i < N; i++) {
    padded[i] = signal[i];
  }
  
  // Split into even and odd
  const even = [];
  const odd = [];
  for (let i = 0; i < padded.length; i += 2) {
    even.push(padded[i]);
    odd.push(padded[i + 1] || 0);
  }
  
  // Recursive FFT
  const evenFFT = fft(even);
  const oddFFT = fft(odd);
  
  // Combine results
  const result = new Array(padded.length);
  for (let k = 0; k < padded.length / 2; k++) {
    const angle = -2 * Math.PI * k / padded.length;
    const twiddle = {
      real: Math.cos(angle),
      imag: Math.sin(angle)
    };
    
    const t = {
      real: twiddle.real * oddFFT[k].real - twiddle.imag * oddFFT[k].imag,
      imag: twiddle.real * oddFFT[k].imag + twiddle.imag * oddFFT[k].real
    };
    
    result[k] = {
      real: evenFFT[k].real + t.real,
      imag: evenFFT[k].imag + t.imag
    };
    
    result[k + padded.length / 2] = {
      real: evenFFT[k].real - t.real,
      imag: evenFFT[k].imag - t.imag
    };
  }
  
  return result.slice(0, N);
}

/**
 * Apply window function (Hamming window)
 */
function applyWindow(signal) {
  const windowed = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const windowValue = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (signal.length - 1));
    windowed[i] = signal[i] * windowValue;
  }
  return windowed;
}

/**
 * Compute Short-Time Fourier Transform (STFT)
 */
function computeSTFT(audioBuffer, nFFT, hopLength, sampleRate) {
  const frames = [];
  const numFrames = Math.floor((audioBuffer.length - nFFT) / hopLength) + 1;

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopLength;
    const frame = audioBuffer.slice(start, start + nFFT);
    
    // Zero-padding if frame is shorter than nFFT
    const paddedFrame = new Float32Array(nFFT);
    paddedFrame.set(frame, 0);
    
    // Apply window function
    const windowedFrame = applyWindow(paddedFrame);
    
    // Convert to array for FFT
    const real = Array.from(windowedFrame);
    
    // Compute FFT
    const fftResult = fft(real);
    
    // Compute magnitude spectrum (only need first nFFT/2 + 1 bins)
    const magnitude = new Float32Array(Math.floor(nFFT / 2) + 1);
    for (let j = 0; j < magnitude.length; j++) {
      const { real: realPart, imag: imagPart } = fftResult[j];
      magnitude[j] = Math.sqrt(realPart * realPart + imagPart * imagPart);
    }
    
    frames.push(magnitude);
  }

  return frames;
}

/**
 * Convert frequency to Mel scale
 */
function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Convert Mel to frequency
 */
function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Create Mel filter bank
 */
function createMelFilterBank(nMels, nFFT, sampleRate, fmin = 0, fmax = null) {
  if (fmax === null) {
    fmax = sampleRate / 2;
  }

  const melMax = hzToMel(fmax);
  const melMin = hzToMel(fmin);
  const melPoints = [];
  
  for (let i = 0; i <= nMels + 1; i++) {
    melPoints.push(melMin + (melMax - melMin) * (i / (nMels + 1)));
  }

  const binFreqs = [];
  const nyquist = sampleRate / 2;
  const freqPerBin = nyquist / (nFFT / 2);
  
  for (let i = 0; i <= nFFT / 2; i++) {
    binFreqs.push(i * freqPerBin);
  }

  const filterBank = [];
  
  for (let i = 0; i < nMels; i++) {
    const filter = new Float32Array(Math.floor(nFFT / 2) + 1);
    const leftMel = melPoints[i];
    const centerMel = melPoints[i + 1];
    const rightMel = melPoints[i + 2];
    
    const leftHz = melToHz(leftMel);
    const centerHz = melToHz(centerMel);
    const rightHz = melToHz(rightMel);

    for (let j = 0; j < filter.length; j++) {
      const freq = binFreqs[j];
      if (freq < leftHz || freq > rightHz) {
        filter[j] = 0;
      } else if (freq < centerHz) {
        filter[j] = (freq - leftHz) / (centerHz - leftHz);
      } else {
        filter[j] = (rightHz - freq) / (rightHz - centerHz);
      }
    }
    
    filterBank.push(filter);
  }

  return filterBank;
}

/**
 * Apply Mel filter bank to magnitude spectrum
 */
function applyMelFilterBank(magnitudeSpectrum, melFilterBank) {
  const melSpectrum = new Float32Array(melFilterBank.length);
  
  for (let i = 0; i < melFilterBank.length; i++) {
    let sum = 0;
    for (let j = 0; j < magnitudeSpectrum.length; j++) {
      sum += magnitudeSpectrum[j] * melFilterBank[i][j];
    }
    melSpectrum[i] = sum;
  }
  
  return melSpectrum;
}

/**
 * Convert audio file to Log-Mel Spectrogram
 * @param {Buffer} audioBuffer - Raw audio file buffer
 * @returns {Promise<{spectrogram: Float32Array[], shape: number[], metadata: object}>}
 */
export async function audioToLogMelSpectrogram(audioBuffer) {
  try {
    // Parse WAV file
    const wav = new WaveFile(audioBuffer);
    wav.toBitDepth('32f');
    
    const sampleRate = wav.fmt.sampleRate;
    const channels = wav.fmt.numChannels;
    const audioData = wav.getSamples(true); // Get as Float32Array
    
    // Configuration
    const nFFT = parseInt(process.env.N_FFT || 2048);
    const hopLength = parseInt(process.env.HOP_LENGTH || 512);
    const nMels = parseInt(process.env.N_MELS || 128);
    const fmax = parseInt(process.env.FMAX || 8000);
    const targetSampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || 16000);

    // Normalize and resample audio
    const normalizedAudio = normalizeAudio(audioData, sampleRate);

    // Compute STFT
    const stftResult = computeSTFT(normalizedAudio, nFFT, hopLength, targetSampleRate);
    
    // Create Mel filter bank
    const melFilterBank = createMelFilterBank(nMels, nFFT, targetSampleRate, 0, fmax);
    
    // Apply Mel filter bank to each frame
    const melSpectrogram = [];
    for (const magnitudeFrame of stftResult) {
      const melFrame = applyMelFilterBank(magnitudeFrame, melFilterBank);
      
      // Apply log scaling (add small epsilon to avoid log(0))
      const logMelFrame = new Float32Array(melFrame.length);
      for (let i = 0; i < melFrame.length; i++) {
        logMelFrame[i] = Math.log(melFrame[i] + 1e-10);
      }
      
      melSpectrogram.push(logMelFrame);
    }

    return {
      spectrogram: melSpectrogram,
      shape: [melSpectrogram.length, nMels],
      metadata: {
        sampleRate: targetSampleRate,
        nFFT,
        hopLength,
        nMels,
        duration: normalizedAudio.length / targetSampleRate,
        originalSampleRate: sampleRate
      }
    };
  } catch (error) {
    throw new Error(`Audio processing error: ${error.message}`);
  }
}

/**
 * Convert spectrogram to image buffer (for visualization or model input)
 */
export async function spectrogramToImage(spectrogram, width = 224, height = 224) {
  try {
    const [timeSteps, melBins] = spectrogram.shape || [spectrogram.length, spectrogram[0]?.length || 128];
    
    // Normalize spectrogram to [0, 255] range
    let min = Infinity;
    let max = -Infinity;
    
    for (const frame of spectrogram) {
      for (const value of frame) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    
    const range = max - min || 1;
    const normalized = [];
    
    for (const frame of spectrogram) {
      for (const value of frame) {
        const normalizedValue = Math.floor(((value - min) / range) * 255);
        normalized.push(normalizedValue);
      }
    }
    
    // Resize to target dimensions using sharp
    const imageBuffer = Buffer.from(normalized);
    const resizedImage = await sharp(imageBuffer, {
      raw: {
        width: melBins,
        height: timeSteps,
        channels: 1
      }
    })
    .resize(width, height, {
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
    
    return resizedImage;
  } catch (error) {
    throw new Error(`Spectrogram to image conversion error: ${error.message}`);
  }
}

/**
 * Prepare spectrogram for model input (normalize and reshape)
 */
export function prepareSpectrogramForModel(spectrogram, targetShape = [224, 224]) {
  const [timeSteps, melBins] = spectrogram.shape || [spectrogram.length, spectrogram[0]?.length || 128];
  const [targetHeight, targetWidth] = targetShape;
  
  // Flatten spectrogram
  const flattened = new Float32Array(timeSteps * melBins);
  let index = 0;
  for (const frame of spectrogram) {
    for (const value of frame) {
      flattened[index++] = value;
    }
  }
  
  // Normalize to [0, 1] range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < flattened.length; i++) {
    if (flattened[i] < min) min = flattened[i];
    if (flattened[i] > max) max = flattened[i];
  }
  
  const range = max - min || 1;
  const normalized = new Float32Array(flattened.length);
  for (let i = 0; i < flattened.length; i++) {
    normalized[i] = (flattened[i] - min) / range;
  }
  
  // Simple resampling for target shape (nearest neighbor)
  const resampled = new Float32Array(targetHeight * targetWidth);
  const scaleX = melBins / targetWidth;
  const scaleY = timeSteps / targetHeight;
  
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIndex = srcY * melBins + srcX;
      const dstIndex = y * targetWidth + x;
      
      if (srcIndex < normalized.length) {
        resampled[dstIndex] = normalized[srcIndex];
      }
    }
  }
  
  return {
    data: resampled,
    shape: targetShape,
    originalShape: [timeSteps, melBins]
  };
}


