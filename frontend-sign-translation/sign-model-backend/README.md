# Sign Language Detection Backend

Python Flask server for running Keras sign language detection model.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure your model file is in the correct location:
   - `model/sinhala-model/sinhala_sign_model_final.keras`

3. Update `CLASS_LABELS` in `app.py` with your actual class labels (the signs your model was trained to recognize).

4. Start the server:
```bash
python app.py
```

The server will run on `http://localhost:5000`

## API Endpoints

### Health Check
- **GET** `/health`
- Returns server and model status

### Predict Sign
- **POST** `/predict`
- Accepts image file or base64 encoded image
- Returns prediction with confidence scores

## For Mobile Development

When testing on a physical device or emulator, you'll need to:

1. Find your computer's IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`

2. Update the API URL in the frontend to use your IP:
   - Example: `http://192.168.1.100:5000/predict`

3. Make sure your phone/emulator and computer are on the same network.




