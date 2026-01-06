import os, json, argparse, glob
import numpy as np
import cv2
import mediapipe as mp

def get_intensity(speed):
    if speed < 60:
        return "IDLE", 0
    elif speed < 200:
        return "LOW", 1
    elif speed < 400:
        return "MEDIUM", 2
    else:
        return "HIGH", 3

def main():
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--frames_dir", required=True)
        parser.add_argument("--fps", type=float, default=10.0)
        args = parser.parse_args()

        frame_paths = sorted(
            glob.glob(os.path.join(args.frames_dir, "*.jpg")) +
            glob.glob(os.path.join(args.frames_dir, "*.png"))
        )

        if len(frame_paths) < 2:
            print(json.dumps({
                "hand_speed": 0.0,
                "intensity": "IDLE",
                "level": 0,
                "frames_used": len(frame_paths),
                "valid_steps": 0,
                "fps": args.fps,
                "note": "Not enough frames (need at least 2)"
            }))
            return

        mp_hands = mp.solutions.hands
        hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        points = []
        for p in frame_paths:
            img = cv2.imread(p)
            if img is None:
                points.append(None)
                continue

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)

            if not result.multi_hand_landmarks:
                points.append(None)
                continue

            wrist = result.multi_hand_landmarks[0].landmark[0]
            h, w = img.shape[:2]
            points.append(np.array([wrist.x * w, wrist.y * h], dtype=np.float32))

        hands.close()

        dt = 1.0 / max(args.fps, 1e-6)
        speeds = []
        prev = None

        for pt in points:
            if pt is None:
                continue
            if prev is not None:
                dist = float(np.linalg.norm(pt - prev))
                speeds.append(dist / dt)
            prev = pt

        avg_speed = float(np.mean(speeds)) if speeds else 0.0
        label, level = get_intensity(avg_speed)

        out = {
            "hand_speed": round(avg_speed, 2),
            "intensity": label,
            "level": level,
            "frames_used": len(frame_paths),
            "valid_steps": len(speeds),
            "fps": args.fps
        }

        print(json.dumps(out))
    except Exception as e:
        # Always return valid JSON even on error
        error_out = {
            "hand_speed": 0.0,
            "intensity": "IDLE",
            "level": 0,
            "frames_used": 0,
            "valid_steps": 0,
            "fps": 10.0,
            "error": str(e),
            "note": "Script error occurred"
        }
        print(json.dumps(error_out))
        import sys
        sys.exit(1)

if __name__ == "__main__":
    main()
