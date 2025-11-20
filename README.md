# Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support
AI-powered system for hearing-impaired children that integrates multilingual sign recognition, interactive learning, emotion detection, and environmental safety alerts.

QUICK SETUP — HAND SPEED ENV (venv-mediapipe)
1. Create env
    python -m venv venv-mediapipe
2. Activate
    .\venv-mediapipe\Scripts\activate
3. Install dependencies
    pip install opencv-python numpy mediapipe==0.10.14
4. Run hand demo
    python src/02_hand_speed_demo.py


QUICK SETUP — FACE EMOTION ENV (venv-deepface)
1. Create env
    python -m venv venv-deepface
2. Activate
    .\venv-deepface\Scripts\activate
3. Install DeepFace + OpenCV
    pip install deepface opencv-python numpy
4. Run face demo
    python src/03_face_emotion_demo.py

🔁 SWITCHING BETWEEN THEM
Hand:
    deactivate
    .\venv-mediapipe\Scripts\activate
    python src/02_hand_speed_demo.py

Face:
    deactivate
    .\venv-deepface\Scripts\activate
    python src/03_face_emotion_demo.py

