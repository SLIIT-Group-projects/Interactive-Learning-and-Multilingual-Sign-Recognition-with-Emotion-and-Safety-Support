import cv2
import mediapipe as mp
import time
import math

mp_hands = mp.solutions.hands
mp_draw  = mp.solutions.drawing_utils

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

prev_time = None
prev_wrist = None
prev_tip = None

smoothed_speed = 0.0
ALPHA = 0.2

# Tune thresholds for combined speed
IDLE_T = 60
LOW_T  = 200
MED_T  = 400

def dist(p1, p2):
    dx = p1[0] - p2[0]
    dy = p1[1] - p2[1]
    return math.sqrt(dx*dx + dy*dy)

def get_intensity(speed):
    if speed < IDLE_T:
        return "IDLE", 0
    elif speed < LOW_T:
        return "LOW", 1
    elif speed < MED_T:
        return "MEDIUM", 2
    else:
        return "HIGH", 3

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    h, w = frame.shape[:2]

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    curr_time = time.time()

    if results.multi_hand_landmarks:
        hand_landmarks = results.multi_hand_landmarks[0]
        mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

        # Wrist (0) and index fingertip (8)
        wrist_lm = hand_landmarks.landmark[0]
        tip_lm   = hand_landmarks.landmark[8]

        wrist_px = (int(wrist_lm.x * w), int(wrist_lm.y * h))
        tip_px   = (int(tip_lm.x * w), int(tip_lm.y * h))

        wrist_speed = 0.0
        tip_speed = 0.0

        if prev_time is not None:
            dt = curr_time - prev_time
            if dt > 0 and prev_wrist is not None and prev_tip is not None:
                wrist_speed = dist(wrist_px, prev_wrist) / dt
                tip_speed   = dist(tip_px, prev_tip) / dt

        # Combine: use the maximum (captures either hand or finger motion)
        raw_speed = max(wrist_speed, tip_speed)

        smoothed_speed = (1 - ALPHA) * smoothed_speed + ALPHA * raw_speed

        intensity_label, intensity_level = get_intensity(smoothed_speed)

        cv2.putText(frame, f"Wrist: {wrist_speed:.1f} px/s | Finger: {tip_speed:.1f} px/s", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.putText(frame, f"Combined speed: {smoothed_speed:.1f} px/s", (10, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        cv2.putText(frame, f"Intensity: {intensity_label} (L{intensity_level})", (10, 95),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)

        prev_wrist = wrist_px
        prev_tip = tip_px
        prev_time = curr_time

    else:
        prev_wrist = None
        prev_tip = None
        prev_time = curr_time
        smoothed_speed = 0.0
        cv2.putText(frame, "No hand detected", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

    cv2.imshow("Hand + Finger Intensity", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
