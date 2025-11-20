import cv2
import time
import math
import mediapipe as mp

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1)
mp_draw = mp.solutions.drawing_utils

prev_wrist = None
prev_time = time.time()

def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)
    now = time.time()

    if result.multi_hand_landmarks:
        for handLms in result.multi_hand_landmarks:
            mp_draw.draw_landmarks(frame, handLms, mp_hands.HAND_CONNECTIONS)

            wrist = handLms.landmark[0]   # wrist = landmark 0
            wrist_px = (int(wrist.x * w), int(wrist.y * h))

            if prev_wrist is not None:
                speed = distance(wrist_px, prev_wrist) / (now - prev_time)

                cv2.putText(frame, f"Speed: {int(speed)}",
                            (10, 40),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            1, (0, 255, 0), 2)

            prev_wrist = wrist_px
            prev_time = now

    cv2.imshow("Hand Speed Demo", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
