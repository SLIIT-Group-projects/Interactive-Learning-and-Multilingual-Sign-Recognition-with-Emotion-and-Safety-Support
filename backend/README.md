# Hazard Sound Detection Backend API

Backend API for the Interactive Learning and Multilingual Sign Recognition system, specifically handling hazard sound detection for hearing-impaired children.

## Features

- **Audio Processing Pipeline**: Converts audio waveforms to Log-Mel Spectrograms using STFT
- **Hazard Detection**: Detects and classifies hazardous sounds in real-time
- **Alarm Prioritization**: Context-aware prioritization of multiple simultaneous hazards
- **RESTful API**: Clean API endpoints for audio processing and hazard detection

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration.

## Running the Server

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in `.env`).

## API Endpoints

### Health Check
- **GET** `/health` - Check API health status

### Audio Processing
- **POST** `/api/audio/process` - Process audio file and convert to spectrogram
  - Body: `multipart/form-data` with `audio` file
  - Returns: Spectrogram metadata and shape

- **POST** `/api/audio/spectrogram` - Get spectrogram as PNG image
  - Body: `multipart/form-data` with `audio` file
  - Query params: `width` (default: 224), `height` (default: 224)
  - Returns: PNG image

- **POST** `/api/audio/prepare-model-input` - Prepare spectrogram for model inference
  - Body: `multipart/form-data` with `audio` file and optional `shape` JSON
  - Returns: Normalized spectrogram data ready for model input

### Hazard Detection
- **POST** `/api/hazard/detect` - Detect hazardous sounds from audio
  - Body: `multipart/form-data` with `audio` file and optional `context` JSON
  - Returns: Detected hazards with prioritization

- **POST** `/api/hazard/detect-stream` - Real-time detection for multiple audio chunks
  - Body: `multipart/form-data` with multiple `audio` files and optional `context` JSON
  - Returns: Aggregated hazard detections

- **GET** `/api/hazard/priorities` - Get hazard priority configuration

## Audio Processing Pipeline

The system implements a complete audio processing pipeline:

1. **Audio Input**: Accepts WAV audio files via file upload
2. **Normalization**: Converts to mono, normalizes sample rate, and normalizes amplitude
3. **STFT**: Applies Short-Time Fourier Transform with windowing (Hamming window)
4. **Mel Filter Bank**: Applies Mel-scale filter bank for frequency warping
5. **Log Scaling**: Applies logarithmic scaling to compress dynamic range
6. **Model Preparation**: Normalizes and reshapes for CNN model input

### Configuration

Key parameters (configurable via `.env`):
- `AUDIO_SAMPLE_RATE`: Target sample rate (default: 16000 Hz)
- `N_FFT`: FFT window size (default: 2048)
- `HOP_LENGTH`: Hop length for STFT (default: 512)
- `N_MELS`: Number of Mel filter banks (default: 128)
- `FMAX`: Maximum frequency for Mel scale (default: 8000 Hz)

## Integration with Trained Model

The backend is designed to work with a separately trained CNN model. To integrate:

1. Place your trained model file in the `models/` directory
2. Update `mockModelInference()` function in `src/routes/hazard.routes.js` with actual model loading and inference code
3. Example integration (if using TensorFlow.js):
```javascript
import * as tf from '@tensorflow/tfjs-node';

const model = await tf.loadLayersModel(process.env.MODEL_PATH);
const input = tf.tensor4d([spectrogramData], [1, 224, 224, 1]);
const prediction = model.predict(input);
```

## Project Structure

```
backend/
├── src/
│   ├── server.js              # Express server setup
│   ├── routes/
│   │   ├── audio.routes.js    # Audio processing endpoints
│   │   └── hazard.routes.js   # Hazard detection endpoints
│   └── utils/
│       ├── audioProcessor.js  # Audio processing pipeline
│       └── hazardPriority.js  # Hazard prioritization logic
├── uploads/                   # Temporary file storage
├── models/                    # Place trained models here
├── .env.example              # Environment variables template
├── package.json
└── README.md
```

## Environment Variables

See `.env.example` for all available configuration options.

## Testing

You can test the API using tools like Postman or curl:

```bash
# Test audio processing
curl -X POST http://localhost:3000/api/audio/process \
  -F "audio=@path/to/audio.wav"

# Test hazard detection
curl -X POST http://localhost:3000/api/hazard/detect \
  -F "audio=@path/to/audio.wav" \
  -F 'context={"location":{"type":"indoor"}}'
```

## Notes

- Uploaded audio files are automatically cleaned up after processing
- The system currently uses mock model inference - replace with your trained model
- Spectrogram conversion follows the methodology described in the research paper (Log-Mel Spectrograms with STFT)

## License

MIT



## Emotion detection - hand movement
cd path\to\your\project\backend

py -m venv .venv-hand
.\.venv-hand\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install opencv-python mediapipe numpy


