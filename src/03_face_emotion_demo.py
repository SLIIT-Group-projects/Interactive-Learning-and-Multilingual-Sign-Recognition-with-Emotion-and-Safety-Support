import cv2
from deepface import DeepFace

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Optional: flip like a mirror
    frame = cv2.flip(frame, 1)

    try:
        # Analyze emotions; DeepFace may return a list
        result = DeepFace.analyze(
            frame,
            actions=['emotion'],
            enforce_detection=False
        )

        # Handle both old (dict) and new (list) formats
        if isinstance(result, list):
            result = result[0]

        emotion = result.get('dominant_emotion', 'unknown')

        cv2.putText(
            frame,
            f"Emotion: {emotion}",
            (10, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2
        )

    except Exception as e:
        # If something goes wrong, show a small message on screen
        cv2.putText(
            frame,
            "No face / error",
            (10, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 0, 255),
            2
        )

    cv2.imshow("Face Emotion Demo", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
