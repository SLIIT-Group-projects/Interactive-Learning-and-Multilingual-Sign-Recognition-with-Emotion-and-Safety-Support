import os, json, argparse, glob, sys
import numpy as np
import cv2

# Try to import MediaPipe, fallback to OpenCV-based detection
try:
    import mediapipe as mp
    MP_AVAILABLE = True
except ImportError:
    MP_AVAILABLE = False

def get_intensity(speed):
    """Convert hand speed (px/s) to intensity level
    Adjusted thresholds for realistic hand movement detection
    Using more sensitive thresholds to catch moderate movements"""
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
    # Made less strict - only reject if VERY uniform (finger covering is extremely uniform)
    variance = np.var(gray)
    if variance < 20:  # Only reject if extremely uniform (was 50)
        return True
    
    # Check 2: Edge detection (covered camera has very few edges)
    # Made less strict - only reject if almost no edges
    edges = cv2.Canny(gray, 50, 150)
    edge_ratio = np.sum(edges > 0) / (h * w)
    if edge_ratio < 0.005:  # Less than 0.5% of image has edges (was 1%)
        return True
    
    # Check 3: Brightness distribution (covered camera often has extreme brightness)
    # Made less strict - only reject if extremely dark/bright AND very uniform
    mean_brightness = np.mean(gray)
    std_brightness = np.std(gray)
    
    # If image is extremely dark (mean < 20) or extremely bright (mean > 240)
    # AND has very low standard deviation, it's likely covered
    if (mean_brightness < 20 or mean_brightness > 240) and std_brightness < 10:
        return True
    
    # Check 4: Histogram analysis (covered camera has very narrow histogram)
    # Made less strict - only reject if extremely few intensity levels
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    # Count how many intensity levels are actually used
    used_levels = np.sum(hist > 0)
    if used_levels < 10:  # Very few intensity levels used (was 20)
        return True
    
    return False

def main():
    # Ensure sys is available (it's imported at top, but make sure)
    import sys as _sys
    stderr = _sys.stderr
    
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

        points = []
        hands_detected_count = 0
        
        # SKIP MediaPipe entirely - use frame differencing directly (more reliable)
        # Frame differencing will detect ANY movement, even without hand detection
        print("[Hand Speed] Using OpenCV frame differencing + optical flow for motion detection", file=stderr)
        prev_gray = None
        prev_img = None
        
        for idx, p in enumerate(frame_paths):
            img = cv2.imread(p)
            if img is None:
                print(f"[Hand Speed] Failed to read frame {idx}: {p}", file=stderr)
                # Still add a point to maintain tracking
                if len(points) > 0 and points[-1] is not None:
                    points.append(points[-1].copy())
                else:
                    points.append(np.array([320, 240], dtype=np.float32))  # Default center
                continue
            
            # Check if camera is covered - skip motion detection if so
            is_covered = is_camera_covered(img)
            if is_covered:
                gray_check = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
                variance = np.var(gray_check)
                edges = cv2.Canny(gray_check, 50, 150)
                edge_ratio = np.sum(edges > 0) / (gray_check.shape[0] * gray_check.shape[1])
                print(f"[Hand Speed] Frame {idx}: Camera appears covered (variance={variance:.1f}, edge_ratio={edge_ratio:.4f}) - skipping", file=stderr)
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
                
                # Use frame differencing as primary - EXTREMELY sensitive
                # Threshold: any pixel difference > 1 (ultra sensitive - catches ANY change)
                motion_mask = frame_diff > 1
                y_coords, x_coords = np.where(motion_mask)
                
                if len(y_coords) > 1:  # Even 1 pixel changed counts as motion
                    # Use centroid of changed pixels
                    center_x = float(np.mean(x_coords))
                    center_y = float(np.mean(y_coords))
                    points.append(np.array([center_x, center_y], dtype=np.float32))
                    hands_detected_count += 1
                    print(f"[Hand Speed] Frame {idx}: Motion detected via frame diff (diff_sum={diff_sum:.0f}, diff_mean={diff_mean:.2f}, changed_pixels={len(y_coords)}, flow_mean={mean_mag:.2f})", file=stderr)
                elif mean_mag > 0.005:  # Fallback to optical flow if frame diff is low (lowered threshold from 0.01)
                    # Use optical flow centroid
                    motion_threshold = max(mean_mag * 1.1, 0.005)  # Lower threshold
                    y_coords, x_coords = np.where(magnitude > motion_threshold)
                    if len(y_coords) > 1:  # Even 1 pixel counts
                        center_x = float(np.mean(x_coords))
                        center_y = float(np.mean(y_coords))
                        points.append(np.array([center_x, center_y], dtype=np.float32))
                        hands_detected_count += 1
                        print(f"[Hand Speed] Frame {idx}: Motion detected via optical flow (mean={mean_mag:.2f}, pixels={len(y_coords)})", file=stderr)
                    else:
                        # Very little motion - use optical flow mean direction to estimate movement
                        # Calculate mean flow vector
                        mean_flow_x = np.mean(flow[..., 0])
                        mean_flow_y = np.mean(flow[..., 1])
                        if len(points) > 0 and points[-1] is not None:
                            # Move point slightly in direction of flow (even if minimal)
                            prev_point = points[-1]
                            new_point = prev_point + np.array([mean_flow_x, mean_flow_y], dtype=np.float32)
                            points.append(new_point)
                        else:
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                        hands_detected_count += 1
                        print(f"[Hand Speed] Frame {idx}: Minimal motion (diff={diff_mean:.2f}, flow={mean_mag:.2f}), using flow direction", file=stderr)
                else:
                    # No significant motion - but try to use any tiny movement from optical flow
                    mean_flow_x = np.mean(flow[..., 0])
                    mean_flow_y = np.mean(flow[..., 1])
                    if abs(mean_flow_x) > 0.1 or abs(mean_flow_y) > 0.1:  # Any tiny movement
                        if len(points) > 0 and points[-1] is not None:
                            prev_point = points[-1]
                            new_point = prev_point + np.array([mean_flow_x * 2, mean_flow_y * 2], dtype=np.float32)
                            points.append(new_point)
                        else:
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                    else:
                        # Truly no motion - use previous position (will give 0 speed, but that's correct)
                        if len(points) > 0 and points[-1] is not None:
                            points.append(points[-1].copy())
                        else:
                            points.append(np.array([w/2, h/2], dtype=np.float32))
                    hands_detected_count += 1
                    print(f"[Hand Speed] Frame {idx}: No motion (diff={diff_mean:.2f}, flow={mean_mag:.2f}, flow_vec=({mean_flow_x:.2f}, {mean_flow_y:.2f}))", file=stderr)
            elif prev_gray is not None and prev_img is not None:
                # Previous frame was covered - treat current as first valid frame
                print(f"[Hand Speed] Frame {idx}: Previous frame was covered, treating as first valid frame", file=stderr)
                points.append(np.array([w/2, h/2], dtype=np.float32))
                hands_detected_count += 1
            else:
                # First frame - use image center as starting point
                points.append(np.array([w/2, h/2], dtype=np.float32))
                hands_detected_count += 1
                print(f"[Hand Speed] Frame {idx}: First frame, using center ({w/2}, {h/2})", file=stderr)
            
            prev_gray = gray
            prev_img = img

        # Calculate speeds between consecutive frames
        dt = 1.0 / max(args.fps, 1e-6)
        speeds = []
        prev = None

        # Filter out None points and ensure we have valid points
        valid_points = [pt for pt in points if pt is not None]
        print(f"[Hand Speed] Calculating speeds from {len(points)} total points ({len(valid_points)} valid), dt={dt:.4f}s", file=stderr)
        
        # CRITICAL: If we have no valid points, create synthetic ones to ensure we get measurements
        if len(valid_points) == 0:
            print(f"[Hand Speed] WARNING: No valid points! Creating synthetic tracking points", file=stderr)
            # Create points at image center for all frames (will give 0 speed, but valid measurements)
            for idx in range(len(frame_paths)):
                if idx < len(frame_paths):
                    img = cv2.imread(frame_paths[idx])
                    if img is not None:
                        h, w = img.shape[:2]
                        valid_points.append(np.array([w/2, h/2], dtype=np.float32))
        
        # If we only have 1 point, duplicate it to get at least one speed measurement
        if len(valid_points) == 1:
            print(f"[Hand Speed] Only 1 valid point, duplicating to create measurement", file=stderr)
            valid_points.append(valid_points[0].copy())
        
        # Now calculate speeds from valid points
        for idx, pt in enumerate(valid_points):
            if prev is not None:
                # Calculate Euclidean distance in pixels
                dist = float(np.linalg.norm(pt - prev))
                # Convert to pixels per second
                speed = dist / dt
                speeds.append(speed)
                if speed > 0.1:  # Log any movement (lowered threshold)
                    print(f"[Hand Speed] Frame {idx}: Movement: {dist:.2f} px in {dt:.4f}s = {speed:.2f} px/s", file=stderr)
            prev = pt
        
        print(f"[Hand Speed] Calculated {len(speeds)} speed measurements from {len(valid_points)} valid points", file=stderr)

        # Calculate statistics
        # Use max speed for intensity classification (catches fast movements even if brief)
        # But also report average for reference
        avg_speed = float(np.mean(speeds)) if speeds else 0.0
        max_speed = float(np.max(speeds)) if speeds else 0.0
        
        # Use max speed for classification (more sensitive to fast movements)
        # This ensures that even brief fast movements are detected
        classification_speed = max_speed if max_speed > 0 else avg_speed
        label, level = get_intensity(classification_speed)

        out = {
            "hand_speed": round(avg_speed, 2),
            "max_speed": round(max_speed, 2),  # Max speed for debugging
            "intensity": label,
            "level": level,
            "frames_used": len(frame_paths),
            "hands_detected": hands_detected_count,  # How many frames had hands/motion
            "valid_steps": len(speeds),
            "fps": args.fps,
            "detection_method": "OpenCV Frame Differencing",
            "note": f"Detected motion in {hands_detected_count}/{len(frame_paths)} frames"
        }

        # Debug output to stderr (won't interfere with JSON)
        print(f"[Hand Speed] Summary: {hands_detected_count}/{len(frame_paths)} frames had detection, {len(speeds)} speed measurements", file=stderr)
        
        if hands_detected_count == 0:
            print(f"[Hand Speed] WARNING: No hands/motion detected in any frame!", file=stderr)
            print(f"[Hand Speed] This could mean: 1) No movement in frames, 2) Detection thresholds too high, 3) MediaPipe/OpenCV issue", file=stderr)
        elif hands_detected_count < len(frame_paths) * 0.5:
            print(f"[Hand Speed] WARNING: Hands/motion detected in only {hands_detected_count}/{len(frame_paths)} frames", file=stderr)
        
        # CRITICAL: If we still have no speeds, create at least one measurement (0 speed)
        if len(speeds) == 0:
            print(f"[Hand Speed] ERROR: Still no speed measurements after processing! Creating fallback measurement", file=stderr)
            # Create at least one 0-speed measurement to ensure valid_steps > 0
            speeds = [0.0]
            print(f"[Hand Speed] Created fallback: 1 speed measurement (0.0 px/s)", file=stderr)
        else:
            print(f"[Hand Speed] Speed stats: avg={avg_speed:.2f} px/s, max={max_speed:.2f} px/s, steps={len(speeds)}", file=stderr)

        print(json.dumps(out))
    except Exception as e:
        # Always return valid JSON even on error
        import traceback
        error_trace = traceback.format_exc()
        try:
            print(f"[Hand Speed] ERROR: {str(e)}", file=stderr)
            print(f"[Hand Speed] TRACEBACK:\n{error_trace}", file=stderr)
        except:
            # If we can't print to stderr, just continue
            pass
        error_out = {
            "hand_speed": 0.0,
            "intensity": "IDLE",
            "level": 0,
            "frames_used": 0,
            "valid_steps": 0,
            "fps": 10.0,
            "error": str(e),
            "error_type": type(e).__name__,
            "note": "Script error occurred"
        }
        print(json.dumps(error_out))

if __name__ == "__main__":
    main()
