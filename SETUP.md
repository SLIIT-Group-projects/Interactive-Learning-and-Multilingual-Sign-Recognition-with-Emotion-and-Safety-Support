# ASL Learning App - Setup Guide

Complete setup instructions for running the ASL Alphabet Recognition application.

## 📋 Prerequisites

Before starting, ensure you have:

- **Python 3.8+** (check with `python --version`)
- **Node.js 16+** and npm (check with `node --version` and `npm --version`)
- **Git** (to clone the repository)
- **Dataset**: ASL alphabet dataset (see Dataset section below)

## 📦 Dataset Requirements

The model requires an ASL alphabet dataset. You have two options:

### Option 1: Use Pre-extracted Landmarks (Recommended)
- Place your dataset in `Model/dataset_landmarks/`
- Structure: `Model/dataset_landmarks/asl_alphabet_train/asl_alphabet_train/[A-Z]/`
- Each letter folder should contain JSON files with extracted landmarks

### Option 2: Use Raw Images
- Place your dataset in `Model/dataset_raw/`
- Structure: `Model/dataset_raw/asl_alphabet_train/asl_alphabet_train/[A-Z]/`
- Each letter folder should contain image files (JPG/PNG)
- You'll need to extract landmarks first using `extract_landmarks.py`

**Note**: The dataset is not included in this repository due to size constraints. You'll need to obtain it separately or use your own dataset.

## 🚀 Setup Steps

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd ASL_learning
```

### Step 2: Prepare the Dataset

1. **If using raw images**, extract landmarks first:
   ```bash
   cd Model
   python extract_landmarks.py
   ```
   This will create the `dataset_landmarks` directory with extracted features.

2. **If using pre-extracted landmarks**, ensure your dataset is in the correct location:
   ```
   Model/dataset_landmarks/asl_alphabet_train/asl_alphabet_train/
   ├── A/
   │   ├── *.json
   ├── B/
   │   ├── *.json
   └── ...
   ```

### Step 3: Train the Model

**⚠️ IMPORTANT**: The trained model (`asl_model.h5`) is not included in this repository. You must train it first.

```bash
cd Model
python train_asl_model.py
```

This will:
- Load landmark data from your dataset
- Train a neural network model
- Save the model as `asl_model.h5` in the `Model/` directory
- Generate training history plots and confusion matrices

**Training Time**: Depending on your dataset size and hardware, this may take 30 minutes to several hours.

**Alternative**: For training with raw images using EfficientNetB0, use the Google Colab notebook:
- Open `Model/train_efficientnet_colab.ipynb` in Google Colab
- Follow the instructions in the notebook

### Step 4: Install Backend Dependencies

```bash
# From project root
pip install -r requirements.txt
```

Or install individually:
```bash
pip install opencv-python mediapipe numpy tqdm tensorflow scikit-learn matplotlib flask flask-cors pillow
```

### Step 5: Install Frontend Dependencies

```bash
cd frontend
npm install
```

If you encounter issues with `react-dom`, run:
```bash
npx expo install react-dom
```

### Step 6: Configure Network Settings

**For Mobile Device Connection**:

1. Find your computer's IP address:
   - **Windows**: Run `ipconfig` in Command Prompt/PowerShell
   - **Mac/Linux**: Run `ifconfig` or `ip addr`
   - Look for your Wi-Fi adapter's IPv4 address (e.g., `192.168.1.2`)

2. Update the API URL in `frontend/screens/PlayGame.js`:
   ```javascript
   const API_URL = __DEV__
     ? "http://YOUR_IP_ADDRESS:5000"  // Replace with your IP
     : "http://YOUR_IP_ADDRESS:5000";
   ```

3. **Important**: 
   - Your phone and laptop must be on the **same Wi-Fi network**
   - If you change networks, update the IP address again

### Step 7: Configure Firewall (Windows)

If you're on Windows, allow port 5000 through the firewall:

**Option A: Using PowerShell (Run as Administrator)**
```powershell
cd Model
.\fix_firewall.ps1
```

**Option B: Using Batch File (Run as Administrator)**
```cmd
cd Model
.\add_firewall_rule.bat
```

**Option C: Manual**
1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" and enter port `5000`
6. Allow the connection → Next → Apply to all profiles → Finish

### Step 8: Run the Application

You need **two terminals** running simultaneously:

#### Terminal 1: Backend API Server

```bash
cd Model
python api_server.py
```

You should see:
```
Model loaded successfully from asl_model.h5
Starting Flask server on http://0.0.0.0:5000
```

**Test the API**: Open `http://localhost:5000/health` in your browser. You should see:
```json
{"status":"healthy","model_loaded":true}
```

#### Terminal 2: Frontend (React Native/Expo)

```bash
cd frontend
npm start
```

Or:
```bash
npx expo start
```

This will:
- Start the Expo development server
- Show a QR code for scanning with Expo Go app
- Provide options to open on Android/iOS simulator or web browser

**To run on mobile**:
1. Install "Expo Go" app on your phone
2. Scan the QR code from the terminal
3. Make sure your phone and laptop are on the same Wi-Fi network

**To run on web**:
- Press `w` in the terminal to open in web browser
- Note: Camera functionality may be limited in web browsers

## 🧪 Verify Installation

1. **Backend**: Visit `http://localhost:5000/health` - should return `{"status":"healthy","model_loaded":true}`
2. **Frontend**: The app should load without errors
3. **Camera**: Navigate to "Play Game" screen - camera should open
4. **API Connection**: Try capturing a gesture - should receive predictions from the backend

## 📁 Project Structure

```
ASL_learning/
├── Model/                    # Backend and ML models
│   ├── asl_model.h5         # Trained model (generated after training)
│   ├── api_server.py        # Flask API server
│   ├── train_asl_model.py  # Training script
│   ├── extract_landmarks.py # Landmark extraction
│   ├── dataset_landmarks/   # Extracted landmarks dataset
│   └── dataset_raw/         # Raw images dataset
├── frontend/                 # React Native app
│   ├── screens/
│   │   └── PlayGame.js      # Main game screen
│   └── package.json
├── requirements.txt         # Python dependencies
└── SETUP.md                 # This file
```

## 🔧 Troubleshooting

### Issue: "Model not loaded" error

**Solution**: 
- Make sure you've trained the model (Step 3)
- Check that `asl_model.h5` exists in the `Model/` directory
- Verify the model path in `api_server.py` is correct

### Issue: "Could not connect to API server"

**Solutions**:
1. Check that the backend is running (`python Model/api_server.py`)
2. Verify the IP address in `PlayGame.js` matches your computer's IP
3. Ensure both devices are on the same Wi-Fi network
4. Check firewall settings (Windows may block port 5000)
5. Test the API URL in your phone's browser: `http://YOUR_IP:5000/health`

### Issue: Camera not working

**Solutions**:
1. Grant camera permissions to the app
2. Check that `expo-camera` is installed: `npm install expo-camera`
3. On Android, ensure the app has camera permissions in device settings
4. Try restarting the Expo development server

### Issue: "Module not found" errors

**Solutions**:
1. Reinstall dependencies:
   ```bash
   # Backend
   pip install -r requirements.txt
   
   # Frontend
   cd frontend
   npm install
   ```
2. Clear npm cache: `npm cache clean --force`
3. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Issue: Training script crashes or runs out of memory

**Solutions**:
1. Reduce batch size in `train_asl_model.py`
2. Use a smaller subset of letters for initial testing
3. For large datasets, use the Google Colab notebook with GPU support
4. Ensure you have enough RAM (8GB+ recommended)

### Issue: Different Wi-Fi network

**Solution**: 
- Update the IP address in `frontend/screens/PlayGame.js` to match your new network
- Find your new IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Restart the frontend after changing the IP

## 📚 Additional Resources

- **Model Training**: See `Model/README_IMPROVEMENTS.md` for model architecture details
- **API Documentation**: See `Model/README_API.md` for API endpoint details
- **Camera Setup**: See `SETUP_CAMERA.md` for detailed camera configuration

## 🆘 Getting Help

If you encounter issues not covered here:

1. Check the error messages in the terminal/console
2. Verify all prerequisites are installed correctly
3. Ensure all steps were followed in order
4. Check that your dataset is in the correct format and location

## ✅ Quick Start Checklist

- [ ] Python 3.8+ installed
- [ ] Node.js 16+ installed
- [ ] Dataset downloaded and placed in correct location
- [ ] Model trained (`asl_model.h5` exists)
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] IP address configured in `PlayGame.js`
- [ ] Firewall configured (Windows)
- [ ] Backend server running
- [ ] Frontend app running
- [ ] Tested API connection (`/health` endpoint)
- [ ] Camera permissions granted

---

**Happy Learning! 🎉**

