# ASL Learning App

AI-powered system for hearing-impaired children that integrates ASL alphabet recognition, interactive learning, and real-time gesture feedback.

## 🎯 Features

- **Real-time ASL Recognition**: Capture and recognize ASL alphabet signs using your device camera
- **Interactive Learning**: Practice ASL letters with instant feedback
- **Parent Dashboard**: Monitor your child's learning progress
- **Child Dashboard**: Track achievements and progress
- **Mobile-First**: Built with React Native (Expo) for iOS and Android

## 🚀 Quick Start

**⚠️ Important**: This project requires training a model before use. The trained model is not included in the repository.

### Prerequisites
- Python 3.8+
- Node.js 16+
- ASL alphabet dataset

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ASL_learning
   ```

2. **Follow the complete setup guide**: See [SETUP.md](SETUP.md) for detailed instructions

3. **Quick setup**:
   ```bash
   # Install Python dependencies
   cd backend/models/games
   pip install flask flask-cors pillow opencv-python mediapipe tensorflow numpy
   
   # Install frontend dependencies
   cd ../../../frontend
   npm install
   
   # Run backend API server (Terminal 1)
   cd ../backend/models/games
   python api_server.py
   
   # Run frontend (Terminal 2)
   cd ../../../frontend
   npm start
   ```

## 📖 Documentation

- **[SETUP.md](SETUP.md)** - Complete setup and installation guide
- **[model/README_IMPROVEMENTS.md](model/README_IMPROVEMENTS.md)** - Model architecture and improvements
- **[model/README_API.md](model/README_API.md)** - API documentation

## 🏗️ Project Structure

```
Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support/
├── backend/
│   └── models/
│       ├── games/              # ASL recognition: api_server.py, asl_model.h5
│       ├── model_server.py     # Hazard detection model server
│       └── predict.py          # Hazard detection prediction
├── frontend/                   # React Native mobile app
└── SETUP.md                    # Setup instructions
```

## 🔧 Tech Stack

- **Backend**: Python, TensorFlow/Keras, Flask, MediaPipe
- **Frontend**: React Native, Expo, NativeWind (Tailwind CSS)
- **ML Model**: Custom neural network with enhanced feature extraction

## 📝 Notes

- The trained model (`asl_model.h5`) should be in `backend/models/games/` directory
- Both devices (phone and laptop) must be on the same Wi-Fi network for mobile testing
- The API server runs on port 5000 by default

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[Add your license here]

---

For detailed setup instructions, troubleshooting, and configuration, see **[SETUP.md](SETUP.md)**.
