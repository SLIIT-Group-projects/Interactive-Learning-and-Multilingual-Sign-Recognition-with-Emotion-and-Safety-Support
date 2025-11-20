# Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support
AI-powered system for hearing-impaired children that integrates multilingual sign recognition, interactive learning, emotion detection, and environmental safety alerts.
1.Camera input

Webcam captures frames (images) of the child in front of the camera.

2.Face emotion

Detect the face in the frame.

Crop & preprocess face (resize, normalize).

Pass it into your face emotion model (pre-trained or trained on FER2013 etc.).

Get probabilities for emotions (happy, sad, angry, neutral, …).

Pick dominant emotion → e.g., HAPPY.

3.Hand movement

Use MediaPipe Hands (or similar) on the same frame.

Get wrist landmarks (x, y) for each hand.

Compare current wrist position with previous frame → compute speed (distance / time).

Over a small window (e.g., last 1–2 seconds), compute average speed.

Convert speed to arousal level:

Low / Medium / High.

4.Fusion / decision

Combine Face emotion + Hand arousal:

Happy + High → Excited Happy

Angry + High → Highly Agitated Angry

Neutral + High → Hyperactive

Sad + Low → Low-energy Sad

Hands do not decide emotion type; they modify the intensity.

Output

Show final label on screen in real time (e.g., Excited Happy).

Optionally log it for later analysis.