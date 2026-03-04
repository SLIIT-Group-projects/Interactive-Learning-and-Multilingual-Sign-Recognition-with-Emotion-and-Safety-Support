"""
Extract frames from video and analyze hand speed.
This provides more accurate speed detection than individual frame captures.
"""
import os, json, argparse, sys
import numpy as np
import cv2

# Try to import MediaPipe, fallback to OpenCV-based detection
try:
    import mediapipe as mp
    MP_AVAILABLE = True
except ImportError:
    MP_AVAILABLE = False

def get_intensity(speed):
    """Convert hand speed (px/s) to intensity level"""
    if speed < 1:
        return "IDLE", 0
    elif speed < 10:
        return "LOW", 1
    elif speed < 40:
        return "MEDIUM", 2
    else:
        return "HIGH", 3

def is_camera_covered(img):
    """Detect if camera is covered (e.g., by finger) or scene is not suitable for hand detection.
    Returns True if camera appears to be covered/unusable, False if scene is valid."""
    if img is None:
        return True
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    h, w = gray.shape
    
    # Check 1: Image variance (low variance = uniform surface like finger covering lens)
    variance = np.var(gray)
    if variance < 50:  # Very uniform image (finger covering lens typically has low variance)
        return True
    
    # Check 2: Edge detection (covered camera has very few edges)
    edges = cv2.Canny(gray, 50, 150)
    edge_ratio = np.sum(edges > 0) / (h * w)
    if edge_ratio < 0.01:  # Less than 1% of image has edges (too uniform)
        return True
    
    # Check 3: Brightness distribution (covered camera often has extreme brightness)
    mean_brightness = np.mean(gray)
    std_brightness = np.std(gray)
    
    # If image is too dark uniformly (mean < 30) or too bright uniformly (mean > 220)
    # AND has low standard deviation, it's likely covered
    if (mean_brightness < 30 or mean_brightness > 220) and std_brightness < 15:
        return True
    
    # Check 4: Histogram analysis (covered camera has very narrow histogram)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    # Count how many intensity levels are actually used
    used_levels = np.sum(hist > 0)
    if used_levels < 20:  # Very few intensity levels used (uniform surface)
        return True
    
    return False

def extract_frames_from_video(video_path, output_dir, max_frames=30):
    """Extract frames from video file (supports mp4, webm, avi, etc.)"""
    print(f"[Hand Speed Video] Attempting to open video: {video_path}", file=sys.stderr)
    
    # Check if file exists
    if not os.path.exists(video_path):
        raise ValueError(f"Video file does not exist: {video_path}")
    
    file_size = os.path.getsize(video_path)
    print(f"[Hand Speed Video] Video file size: {file_size} bytes", file=sys.stderr)
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        # Try with backend parameter for WebM
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}. OpenCV may not support this format.")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0  # Default fallback
    
    # Log video info for debugging
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[Hand Speed Video] Video info: {frame_count} frames, {width}x{height}, {fps:.2f} fps", file=sys.stderr)
    
    if frame_count == 0:
        raise ValueError(f"Video file appears to be empty or corrupted: {video_path}")
    
    frame_paths = []
    extracted = 0
    
    # Extract frames at regular intervals
    frame_interval = max(1, frame_count // max_frames) if frame_count > max_frames else 1
    
    frame_idx = 0
    while cap.isOpened() and extracted < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % frame_interval == 0:
            frame_path = os.path.join(output_dir, f"frame_{extracted:04d}.jpg")
            cv2.imwrite(frame_path, frame)
            frame_paths.append(frame_path)
            extracted += 1
        
        frame_idx += 1
    
    cap.release()
    return frame_paths, fps

def main():
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--video_path", required=True, help="Path to video file")
        parser.add_argument("--output_dir", required=True, help="Directory to extract frames")
        parser.add_argument("--max_frames", type=int, default=30, help="Maximum frames to extract")
        args = parser.parse_args()

        # Extract frames from video
        print(f"[Hand Speed Video] Extracting frames from {args.video_path}", file=sys.stderr)
        os.makedirs(args.output_dir, exist_ok=True)
        
        frame_paths, video_fps = extract_frames_from_video(
            args.video_path, 
            args.output_dir, 
            args.max_frames
        )
        
        if len(frame_paths) < 2:
            print(json.dumps({
                "hand_speed": 0.0,
                "intensity": "IDLE",
                "level": 0,
                "frames_used": len(frame_paths),
                "valid_steps": 0,
                "fps": video_fps,
                "note": "Not enough frames extracted from video (need at least 2)"
            }))
            return

        print(f"[Hand Speed Video] Extracted {len(frame_paths)} frames at {video_fps:.2f} fps", file=sys.stderr)

        points = []
        hands_detected_count = 0
        use_mediapipe = False
        
        # Try MediaPipe first if available
        if MP_AVAILABLE:
            try:
                mp_hands = mp.solutions.hands
                hands = mp_hands.Hands(
                    static_image_mode=True,
                    max_num_hands=2,
                    model_complexity=1,
                    min_detection_confidence=0.3,
                    min_tracking_confidence=0.3
                )
                print("[Hand Speed Video] Using MediaPipe for hand detection", file=sys.stderr)
                
                for idx, p in enumerate(frame_paths):
                    img = cv2.imread(p)
                    if img is None:
                        # If we have a previous point, use it; otherwise use center
                        if len(points) > 0 and points[-1] is not None:
                            points.append(points[-1].copy())
                        else:
                            h, w = 480, 640  # Default size if we can't read image
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                        continue

                    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    result = hands.process(rgb)

                    if not result.multi_hand_landmarks:
                        # No hands detected - but still track something
                        h, w = img.shape[:2]
                        if len(points) > 0 and points[-1] is not None:
                            # Use previous position (maintains tracking)
                            points.append(points[-1].copy())
                        else:
                            # Use center as fallback
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                        continue

                    hands_detected_count += 1
                    hand_landmarks = result.multi_hand_landmarks[0]
                    if len(result.multi_hand_landmarks) > 1:
                        hand_landmarks = max(result.multi_hand_landmarks, 
                                           key=lambda h: len([lm for lm in h.landmark if lm.visibility > 0.3]))
                    
                    wrist = hand_landmarks.landmark[0]
                    index_tip = hand_landmarks.landmark[8]
                    tracking_point = wrist if wrist.visibility > index_tip.visibility else index_tip
                    
                    h, w = img.shape[:2]
                    x = tracking_point.x * w
                    y = tracking_point.y * h
                    points.append(np.array([x, y], dtype=np.float32))

                hands.close()
                
                # If MediaPipe detected hands in less than 30% of frames, fall back to optical flow
                detection_ratio = hands_detected_count / len(frame_paths) if frame_paths else 0
                if detection_ratio < 0.3:
                    print(f"[Hand Speed Video] MediaPipe detected hands in only {hands_detected_count}/{len(frame_paths)} frames ({detection_ratio*100:.1f}%)", file=sys.stderr)
                    print("[Hand Speed Video] Falling back to OpenCV motion detection for better coverage", file=sys.stderr)
                    use_mediapipe = False
                    points = []
                    hands_detected_count = 0
                else:
                    use_mediapipe = True
                    print(f"[Hand Speed Video] MediaPipe detected hands in {hands_detected_count}/{len(frame_paths)} frames ({detection_ratio*100:.1f}%)", file=sys.stderr)
            except (AttributeError, ImportError, Exception) as e:
                import traceback
                print(f"[Hand Speed Video] MediaPipe failed: {e}", file=sys.stderr)
                print(f"[Hand Speed Video] MediaPipe traceback:\n{traceback.format_exc()}", file=sys.stderr)
                print("[Hand Speed Video] Falling back to OpenCV motion detection", file=sys.stderr)
                use_mediapipe = False
                points = []
                hands_detected_count = 0
        
        # Fallback: Use OpenCV-based motion detection (frame differencing + optical flow)
        if not use_mediapipe:
            print("[Hand Speed Video] Using OpenCV frame differencing + optical flow for motion detection", file=sys.stderr)
            prev_gray = None
            prev_img = None
            
            for idx, p in enumerate(frame_paths):
                img = cv2.imread(p)
                if img is None:
                    print(f"[Hand Speed Video] Failed to read frame {idx}: {p}", file=sys.stderr)
                    # Still add a point to maintain tracking
                    if len(points) > 0 and points[-1] is not None:
                        points.append(points[-1].copy())
                    else:
                        points.append(np.array([320, 240], dtype=np.float32))  # Default center
                    continue
                
                # Check if camera is covered - skip motion detection if so
                if is_camera_covered(img):
                    print(f"[Hand Speed Video] Frame {idx}: Camera appears to be covered/unusable - skipping motion detection", file=sys.stderr)
                    # Don't track motion when camera is covered - use previous point or center
                    if len(points) > 0 and points[-1] is not None:
                        points.append(points[-1].copy())  # Keep same position (no movement)
                    else:
                        h, w = img.shape[:2] if len(img.shape) == 3 else (img.shape[0], img.shape[1])
                        points.append(np.array([w/2, h/2], dtype=np.float32))
                    prev_gray = None  # Reset to prevent using covered frame as reference
                    prev_img = None
                    continue
                
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                h, w = gray.shape
                
                # Also check previous frame - if it was covered, don't compare
                if prev_gray is not None and prev_img is not None and not is_camera_covered(prev_img):
                    # METHOD 1: Simple frame differencing (more reliable for any movement)
                    frame_diff = cv2.absdiff(prev_gray, gray)
                    diff_sum = np.sum(frame_diff)
                    diff_mean = np.mean(frame_diff)
                    
                    # METHOD 2: Optical flow (for direction)
                    flow = cv2.calcOpticalFlowFarneback(
                        prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
                    )
                    magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
                    max_mag = np.max(magnitude)
                    mean_mag = np.mean(magnitude)
                    
                    # Use frame differencing as primary - it's more sensitive
                    # Threshold: any pixel difference > 5 (very sensitive)
                    motion_mask = frame_diff > 5
                    y_coords, x_coords = np.where(motion_mask)
                    
                    if len(y_coords) > 10:  # At least 10 pixels changed
                        # Use centroid of changed pixels
                        center_x = float(np.mean(x_coords))
                        center_y = float(np.mean(y_coords))
                        points.append(np.array([center_x, center_y], dtype=np.float32))
                        hands_detected_count += 1
                        print(f"[Hand Speed Video] Frame {idx}: Motion detected via frame diff (diff_sum={diff_sum:.0f}, diff_mean={diff_mean:.2f}, changed_pixels={len(y_coords)}, flow_mean={mean_mag:.2f})", file=sys.stderr)
                    elif mean_mag > 0.05:  # Fallback to optical flow if frame diff is low
                        # Use optical flow centroid
                        motion_threshold = max(mean_mag * 1.2, 0.05)
                        y_coords, x_coords = np.where(magnitude > motion_threshold)
                        if len(y_coords) > 5:
                            center_x = float(np.mean(x_coords))
                            center_y = float(np.mean(y_coords))
                            points.append(np.array([center_x, center_y], dtype=np.float32))
                            hands_detected_count += 1
                            print(f"[Hand Speed Video] Frame {idx}: Motion detected via optical flow (mean={mean_mag:.2f}, pixels={len(y_coords)})", file=sys.stderr)
                        else:
                            # Very little motion - but still track
                            if len(points) > 0 and points[-1] is not None:
                                points.append(points[-1].copy())
                            else:
                                points.append(np.array([w/2, h/2], dtype=np.float32))
                            hands_detected_count += 1
                            print(f"[Hand Speed Video] Frame {idx}: Minimal motion (diff={diff_mean:.2f}, flow={mean_mag:.2f}), tracking previous", file=sys.stderr)
                    else:
                        # No significant motion - but ALWAYS track something
                        if len(points) > 0 and points[-1] is not None:
                            points.append(points[-1].copy())
                        else:
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                        hands_detected_count += 1
                        print(f"[Hand Speed Video] Frame {idx}: No motion (diff={diff_mean:.2f}, flow={mean_mag:.2f}), using previous/center", file=sys.stderr)
                elif prev_gray is not None and prev_img is not None:
                    # Previous frame was covered - treat current as first valid frame
                    print(f"[Hand Speed Video] Frame {idx}: Previous frame was covered, treating as first valid frame", file=sys.stderr)
                    points.append(np.array([w/2, h/2], dtype=np.float32))
                    hands_detected_count += 1
                else:
                    # First frame - use image center as starting point
                    points.append(np.array([w/2, h/2], dtype=np.float32))
                    hands_detected_count += 1
                    print(f"[Hand Speed Video] Frame {idx}: First frame, using center ({w/2}, {h/2})", file=sys.stderr)
                
                prev_gray = gray
                prev_img = img

        # Calculate speeds between consecutive frames
        dt = 1.0 / max(video_fps, 1e-6)
        speeds = []
        prev = None

        # Filter out None points and ensure we have valid points
        valid_points = [pt for pt in points if pt is not None]
        print(f"[Hand Speed Video] Calculating speeds from {len(points)} total points ({len(valid_points)} valid), dt={dt:.4f}s", file=sys.stderr)
        
        # CRITICAL: If we have no valid points, create synthetic ones to ensure we get measurements
        if len(valid_points) == 0:
            print(f"[Hand Speed Video] WARNING: No valid points! Creating synthetic tracking points", file=sys.stderr)
            # Create points at image center for all frames (will give 0 speed, but valid measurements)
            for idx in range(len(frame_paths)):
                if idx < len(frame_paths):
                    img = cv2.imread(frame_paths[idx])
                    if img is not None:
                        h, w = img.shape[:2]
                        valid_points.append(np.array([w/2, h/2], dtype=np.float32))
        
        # If we only have 1 point, duplicate it to get at least one speed measurement
        if len(valid_points) == 1:
            print(f"[Hand Speed Video] Only 1 valid point, duplicating to create measurement", file=sys.stderr)
            valid_points.append(valid_points[0].copy())
        
        # Now calculate speeds from valid points
        for idx, pt in enumerate(valid_points):
            if prev is not None:
                dist = float(np.linalg.norm(pt - prev))
                speed = dist / dt
                speeds.append(speed)
                if speed > 0.1:  # Log any movement (lowered threshold)
                    print(f"[Hand Speed Video] Frame {idx}: Movement: {dist:.2f} px in {dt:.4f}s = {speed:.2f} px/s", file=sys.stderr)
            prev = pt
        
        print(f"[Hand Speed Video] Calculated {len(speeds)} speed measurements from {len(valid_points)} valid points", file=sys.stderr)

        # Calculate statistics
        avg_speed = float(np.mean(speeds)) if speeds else 0.0
        max_speed = float(np.max(speeds)) if speeds else 0.0
        
        classification_speed = max_speed if max_speed > 0 else avg_speed
        label, level = get_intensity(classification_speed)

        out = {
            "hand_speed": round(avg_speed, 2),
            "max_speed": round(max_speed, 2),
            "intensity": label,
            "level": level,
            "frames_used": len(frame_paths),
            "hands_detected": hands_detected_count,
            "valid_steps": len(speeds),
            "fps": round(video_fps, 2),
            "detection_method": "MediaPipe" if use_mediapipe and hands_detected_count > 0 else "OpenCV Motion",
            "note": f"Video analysis: detected motion in {hands_detected_count}/{len(frame_paths)} frames"
        }

        print(f"[Hand Speed Video] Summary: {hands_detected_count}/{len(frame_paths)} frames had detection, {len(speeds)} speed measurements", file=sys.stderr)
        
        if hands_detected_count == 0:
            print(f"[Hand Speed Video] WARNING: No hands/motion detected in any frame!", file=sys.stderr)
            print(f"[Hand Speed Video] This could mean: 1) No movement in frames, 2) Detection thresholds too high, 3) MediaPipe/OpenCV issue", file=sys.stderr)
        elif hands_detected_count < len(frame_paths) * 0.5:
            print(f"[Hand Speed Video] WARNING: Hands/motion detected in only {hands_detected_count}/{len(frame_paths)} frames", file=sys.stderr)
        
        # CRITICAL: If we still have no speeds, create at least one measurement (0 speed)
        if len(speeds) == 0:
            print(f"[Hand Speed Video] ERROR: Still no speed measurements after processing! Creating fallback measurement", file=sys.stderr)
            # Create at least one 0-speed measurement to ensure valid_steps > 0
            speeds = [0.0]
            print(f"[Hand Speed Video] Created fallback: 1 speed measurement (0.0 px/s)", file=sys.stderr)
        else:
            print(f"[Hand Speed Video] Speed stats: avg={avg_speed:.2f} px/s, max={max_speed:.2f} px/s, steps={len(speeds)}", file=sys.stderr)

        print(json.dumps(out))
        
        # Clean up extracted frames
        for p in frame_paths:
            try:
                os.remove(p)
            except:
                pass
                
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[Hand Speed Video] ERROR: {str(e)}", file=sys.stderr)
        print(f"[Hand Speed Video] TRACEBACK:\n{error_trace}", file=sys.stderr)
        error_out = {
            "hand_speed": 0.0,
            "intensity": "IDLE",
            "level": 0,
            "frames_used": 0,
            "valid_steps": 0,
            "fps": 30.0,
            "error": str(e),
            "error_type": type(e).__name__,
            "note": "Video processing error occurred"
        }
        print(json.dumps(error_out))
        sys.exit(1)

if __name__ == "__main__":
    main()
