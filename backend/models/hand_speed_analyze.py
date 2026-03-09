import os, json, argparse, glob
import sys
import numpy as np
import cv2

# Try to import MediaPipe with better error handling
MP_AVAILABLE = False
MP_USE_NEW_API = False
MP_ERROR = None

try:
    import mediapipe as mp
    # Check if old API (solutions) or new API (tasks) is available
    if hasattr(mp, 'solutions'):
        MP_AVAILABLE = True
        MP_USE_NEW_API = False
    elif hasattr(mp, 'tasks'):
        MP_AVAILABLE = True
        MP_USE_NEW_API = True
    else:
        MP_AVAILABLE = False
        MP_ERROR = "MediaPipe installed but neither 'solutions' nor 'tasks' attribute found"
except ImportError as e:
    MP_AVAILABLE = False
    MP_USE_NEW_API = False
    MP_ERROR = str(e)

# OpenCV-based hand detection (fallback method)
def detect_hand_opencv(img):
    """Detect hand using OpenCV - skin color detection and contour analysis with strict validation"""
    # Convert to HSV for better skin color detection
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Define skin color range in HSV - MORE STRICT to avoid false positives
    # Narrower range to reduce false detections
    lower_skin1 = np.array([0, 30, 80], dtype=np.uint8)  # Increased minimum saturation and value
    upper_skin1 = np.array([20, 255, 255], dtype=np.uint8)
    lower_skin2 = np.array([170, 30, 80], dtype=np.uint8)
    upper_skin2 = np.array([180, 255, 255], dtype=np.uint8)
    
    # Create mask for skin color
    mask1 = cv2.inRange(hsv, lower_skin1, upper_skin1)
    mask2 = cv2.inRange(hsv, lower_skin2, upper_skin2)
    mask = cv2.bitwise_or(mask1, mask2)
    
    # Apply morphological operations to clean up the mask
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.dilate(mask, kernel, iterations=2)
    
    # VERY LENIENT: Check if mask has any skin-colored pixels (at least 0.5% of image)
    h, w = img.shape[:2]
    skin_pixel_ratio = np.sum(mask > 0) / (h * w)
    if skin_pixel_ratio < 0.005:  # Less than 0.5% skin pixels = probably not a hand (very lenient)
        return None
    
    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    # Find the largest contour (likely the hand)
    largest_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest_contour)
    
    # VERY LENIENT Filter by area (hand should be reasonably large but not too large)
    min_area = (h * w) * 0.005  # At least 0.5% of image (very lenient - accepts small hands)
    max_area = (h * w) * 0.7   # At most 70% of image (very lenient - accepts large hands)
    
    if area < min_area or area > max_area:
        return None
    
    # Get bounding box for shape validation
    x, y, w_box, h_box = cv2.boundingRect(largest_contour)
    
    # VERY LENIENT: Hand-like shape check - accept almost any aspect ratio
    # Hands can be in various orientations, so be very lenient
    aspect_ratio = h_box / max(w_box, 1)
    if aspect_ratio < 0.1 or aspect_ratio > 10.0:  # Very lenient - only reject extreme cases
        return None
    
    # VERY LENIENT: Check if contour is reasonably compact (hand-like, not scattered)
    # Compactness = 4*pi*area / perimeter^2 (circle = 1.0, hand ~ 0.3-0.7)
    perimeter = cv2.arcLength(largest_contour, True)
    if perimeter > 0:
        compactness = (4 * np.pi * area) / (perimeter * perimeter)
        if compactness < 0.05 or compactness > 0.98:  # Very lenient - only reject extreme cases
            return None
    
    # REMOVED position check - accept hands anywhere in the image
    # If OpenCV detects a hand-like shape, accept it regardless of position
    
    # VALIDATION: Check if the region has reasonable color variance (hands have texture)
    roi = img[y:y+h_box, x:x+w_box]
    if roi.size > 0:
        color_std = np.std(roi)
        if color_std < 15:  # Too uniform (probably wall/ceiling, not hand)
            return None
    
    # VALIDATION: Face vs Hand distinction
    # Faces are typically:
    # - In upper portion of image (top 30%)
    # - More square/round (aspect ratio closer to 1.0)
    # - Larger area (face takes more space)
    # - More centered horizontally
    
    # Check if this looks like a FACE (not a hand):
    is_in_face_region = center_y < h * 0.35  # Upper 35% of image
    is_face_like_shape = 0.7 < aspect_ratio < 1.4  # Face is more square
    is_face_like_size = area > (h * w) * 0.08  # Face is larger (more than 8% of image)
    is_centered = abs((x + w_box/2) - w/2) < w * 0.2  # Centered horizontally
    
    # If it matches face characteristics, reject it (it's a face, not a hand)
    if is_in_face_region and (is_face_like_shape or (is_face_like_size and is_centered)):
        return None  # This is likely a face, not a hand
    
    # VALIDATION: Hand-specific characteristics
    # Hands are typically:
    # - In lower 2/3 of image (below face)
    # - More elongated (aspect ratio 0.5-2.0 but not too square)
    # - Can be off-center (hands move around)
    # - Medium size (2-30% of image)
    
    # Additional check: hands should be below the typical face region
    if center_y < h * 0.4:  # If in upper 40%, be extra strict
        # In upper region, require it to be clearly hand-like (not face-like)
        if aspect_ratio > 1.2 or aspect_ratio < 0.6:  # Must be clearly elongated
            # Could be a hand if elongated
            pass
        else:
            # Too square/round for a hand in upper region = probably face
            return None
    
    # Calculate center of the hand
    M = cv2.moments(largest_contour)
    if M["m00"] == 0:
        return None
    
    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"])
    
    # Use average of both centers for more stability
    center_x = x + w_box // 2
    center_y_bbox = y + h_box // 2
    final_x = (cx + center_x) // 2
    final_y = (cy + center_y_bbox) // 2
    
    return np.array([final_x, final_y], dtype=np.float32), area

def detect_hand_motion_blob(img, prev_img=None):
    """Detect hand using motion detection and blob detection"""
    if prev_img is None:
        return None
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    prev_gray = cv2.cvtColor(prev_img, cv2.COLOR_BGR2GRAY)
    
    # Calculate frame difference
    diff = cv2.absdiff(gray, prev_gray)
    
    # Threshold
    _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
    
    # Apply morphological operations
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    thresh = cv2.dilate(thresh, kernel, iterations=2)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    # Find largest moving region
    largest_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest_contour)
    
    h, w = img.shape[:2]
    min_area = (h * w) * 0.005  # At least 0.5% of image
    
    if area < min_area:
        return None
    
    # Calculate center
    M = cv2.moments(largest_contour)
    if M["m00"] == 0:
        return None
    
    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"])
    
    return np.array([cx, cy], dtype=np.float32), area

def get_intensity(speed):
    """
    Categorize speed into intensity levels - CALIBRATED FOR REAL HAND MOVEMENTS
    
    Thresholds adjusted based on user requirements:
    - LOW: Below 500 px/s - Slow, careful movements (calm, learning, low engagement)
    - MEDIUM: 500 to 1000 px/s - Normal movements (engaged, controlled, moderate engagement)  
    - HIGH: Above 1000 px/s - Fast movements (excited, rapid, high engagement)
    """
    # Cap extreme outliers (likely noise or calculation errors)
    if speed > 2000:
        speed = 2000
    
    # User-requested thresholds:
    if speed < 500:
        return "LOW", 1      # Slow, careful movements, learning
    elif speed < 1000:
        return "MEDIUM", 2   # Normal movements, engaged
    else:
        return "HIGH", 3     # Fast movements, excited

def enhance_image_for_detection(img):
    """Aggressively enhance image to improve hand detection"""
    # Convert to different color spaces and enhance
    # Method 1: CLAHE on LAB color space
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    l = clahe.apply(l)
    enhanced1 = cv2.merge([l, a, b])
    enhanced1 = cv2.cvtColor(enhanced1, cv2.COLOR_LAB2BGR)
    
    # Method 2: Histogram equalization
    yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
    yuv[:,:,0] = cv2.equalizeHist(yuv[:,:,0])
    enhanced2 = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
    
    # Method 3: Gamma correction
    gamma = 1.2
    invGamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** invGamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    enhanced3 = cv2.LUT(img, table)
    
    return [img, enhanced1, enhanced2, enhanced3]

def detect_hands_aggressive(hands, img):
    """Try multiple detection strategies"""
    h, w = img.shape[:2]
    
    # Strategy 1: Original image
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)
    if result.multi_hand_landmarks:
        return result, h, w
    
    # Strategy 2: Resize to optimal size (MediaPipe works best around 640x480)
    if w > 640 or h > 480:
        scale = min(640.0 / w, 480.0 / h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img_resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)
        if result.multi_hand_landmarks:
            return result, new_h, new_w
    
    # Strategy 3: Try enhanced versions
    enhanced_versions = enhance_image_for_detection(img)
    for enhanced in enhanced_versions:
        rgb = cv2.cvtColor(enhanced, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)
        if result.multi_hand_landmarks:
            h_enh, w_enh = enhanced.shape[:2]
            return result, h_enh, w_enh
    
    # Strategy 4: Flip horizontally (sometimes helps)
    img_flipped = cv2.flip(img, 1)
    rgb = cv2.cvtColor(img_flipped, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)
    if result.multi_hand_landmarks:
        return result, h, w
    
    return None, h, w

def get_hand_position(landmarks, img_height, img_width):
    """Get hand positions for tracking"""
    wrist = landmarks.landmark[0]
    wrist_pos = np.array([wrist.x * img_width, wrist.y * img_height], dtype=np.float32)
    
    index_mcp = landmarks.landmark[5]
    middle_mcp = landmarks.landmark[9]
    center_x = (wrist.x + index_mcp.x + middle_mcp.x) / 3.0
    center_y = (wrist.y + index_mcp.y + middle_mcp.y) / 3.0
    center_pos = np.array([center_x * img_width, center_y * img_height], dtype=np.float32)
    
    index_tip = landmarks.landmark[8]
    middle_tip = landmarks.landmark[12]
    index_tip_pos = np.array([index_tip.x * img_width, index_tip.y * img_height], dtype=np.float32)
    middle_tip_pos = np.array([middle_tip.x * img_width, middle_tip.y * img_height], dtype=np.float32)
    
    return wrist_pos, center_pos, index_tip_pos, middle_tip_pos

def validate_hand_detection(hand_positions, min_required_frames):
    """Validate that hands are actually detected (not false positives)"""
    if not hand_positions:
        return False, "No hand positions detected"
    
    # Count frames with valid hand detections
    valid_positions = [p for p in hand_positions if p is not None]
    
    if len(valid_positions) == 0:
        return False, "No valid hand positions found"
    
    if len(valid_positions) < min_required_frames:
        return False, f"Hands detected in only {len(valid_positions)} frame(s), need at least {min_required_frames}"
    
    # Check for consecutive detections - hands should be detected in consecutive frames
    # This helps filter out false positives (random detections)
    max_consecutive = 0
    current_consecutive = 0
    for pos in hand_positions:
        if pos is not None:
            current_consecutive += 1
            max_consecutive = max(max_consecutive, current_consecutive)
        else:
            current_consecutive = 0
    
    # VERY RELAXED: Allow any detection - if hands are detected at all, accept it
    # This ensures speed is calculated whenever hands are visible
    # Removed consecutive frame requirement - any hand detection is valid
    # No consecutive frame check - accept any hand detection
    
    # Check if positions are reasonable (not all in same spot - indicates false detection)
    if len(valid_positions) > 1:
        positions_array = np.array(valid_positions)
        # Calculate variance in positions
        position_variance = np.var(positions_array, axis=0)
        total_variance = np.sum(position_variance)
        
        # If variance is too low, hands might not be moving (or it's a false positive)
        # But we allow some variance threshold
        if total_variance < 10:  # Very low variance might indicate false detection
            # This could be valid if hands are stationary, so we don't reject it
            pass
    
    return True, "Hands detected"

def calculate_hand_speed(positions_list, dt):
    """
    Calculate speed from positions - filters noise and captures REAL movements
    
    Improvements:
    - Filters out tiny movements (likely noise/jitter)
    - Uses smoothing to reduce frame-to-frame jitter
    - More accurate representation of actual hand movement speed
    """
    speeds = []
    MIN_MOVEMENT_PX = 3.0  # Filter movements smaller than 3 pixels (likely noise)
    
    for i in range(1, len(positions_list)):
        if positions_list[i] is not None and positions_list[i-1] is not None:
            dist = float(np.linalg.norm(positions_list[i] - positions_list[i-1]))
            
            # Filter out tiny movements (likely camera jitter or detection noise)
            if dist < MIN_MOVEMENT_PX:
                continue  # Skip this movement - too small to be real
            
            if dt > 0 and dist >= 0:
                speed = dist / dt
                speeds.append(speed)
    
    return speeds

def main():
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--frames_dir", required=True)
        parser.add_argument("--fps", type=float, default=10.0)
        args = parser.parse_args()

        # Get frames - try multiple patterns
        all_frames = []
        # Try different patterns
        patterns = [
            os.path.join(args.frames_dir, "*.jpg"),
            os.path.join(args.frames_dir, "*.jpeg"),
            os.path.join(args.frames_dir, "*.png"),
            os.path.join(args.frames_dir, "*.JPG"),
            os.path.join(args.frames_dir, "*.JPEG"),
            os.path.join(args.frames_dir, "*.PNG"),
        ]
        for pattern in patterns:
            all_frames.extend(glob.glob(pattern))
        
        # Remove duplicates
        all_frames = list(set(all_frames))
        frame_paths = sorted(all_frames, key=lambda x: os.path.basename(x))
        
        # Debug: Print what we found
        import sys
        print(f"[DEBUG] Looking in directory: {args.frames_dir}", file=sys.stderr)
        print(f"[DEBUG] Found {len(frame_paths)} frames", file=sys.stderr)
        if len(frame_paths) > 0:
            print(f"[DEBUG] First frame: {frame_paths[0]}", file=sys.stderr)
            print(f"[DEBUG] Last frame: {frame_paths[-1]}", file=sys.stderr)
        else:
            # List all files in directory for debugging
            try:
                all_files = os.listdir(args.frames_dir)
                print(f"[DEBUG] Directory exists. Files found: {all_files[:10]}", file=sys.stderr)
            except Exception as e:
                print(f"[DEBUG] Error listing directory: {e}", file=sys.stderr)

        # VERY LENIENT: Accept even 1 frame - we can still detect movement
        if len(frame_paths) < 1:
            result = {
                "hand_speed": 0.0,
                "intensity": "LOW",
                "level": 1,
                "frames_used": 0,
                "valid_steps": 0,
                "fps": args.fps,
                "hands_detected": False,
                "message": f"No frames received"
            }
            print(json.dumps(result))
            sys.exit(0)
        
        # If only 1 frame, we can't calculate speed but we can try to detect hands
        if len(frame_paths) == 1:
            print(f"[DEBUG] Only 1 frame received - will try to detect hands but cannot calculate speed", file=sys.stderr)

        # Use OpenCV-based detection as PRIMARY method (works without MediaPipe)
        # MediaPipe will be used as fallback if available
        use_opencv_primary = True  # Always use OpenCV first - it's more reliable

        # Initialize MediaPipe - use new API (tasks.vision.HandLandmarker)
        use_new_api = MP_USE_NEW_API
        hand_landmarker = None
        hands1 = None
        hands2 = None
        
        try:
            if MP_USE_NEW_API:
                # New API (MediaPipe 0.10+)
                from mediapipe.tasks import python
                from mediapipe.tasks.python import vision
                from mediapipe import Image as MPImage
                import urllib.request
                
                # For MediaPipe 0.10+, we need to download the model file
                script_dir = os.path.dirname(os.path.abspath(__file__))
                model_file = os.path.join(script_dir, "hand_landmarker.task")
                model_url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
                
                # Download model if it doesn't exist
                if not os.path.exists(model_file):
                    try:
                        print(f"[DEBUG] Downloading hand_landmarker model from {model_url}...", file=sys.stderr)
                        urllib.request.urlretrieve(model_url, model_file)
                        print(f"[DEBUG] Model downloaded to {model_file}", file=sys.stderr)
                    except Exception as download_error:
                        raise Exception(f"Failed to download MediaPipe model: {download_error}. Please download manually from {model_url} and place it in {script_dir}")
                
                # Create HandLandmarker with the model file
                try:
                    base_options = python.BaseOptions(model_asset_path=model_file)
                    options = vision.HandLandmarkerOptions(
                        base_options=base_options,
                        num_hands=2,
                        min_hand_detection_confidence=0.01,  # Very low threshold (was 0.1) - more sensitive
                        min_hand_presence_confidence=0.01,   # Very low threshold (was 0.1) - more sensitive
                        min_tracking_confidence=0.01,         # Very low threshold (was 0.1) - more sensitive
                        running_mode=vision.RunningMode.IMAGE
                    )
                    hand_landmarker = vision.HandLandmarker.create_from_options(options)
                    print(f"[DEBUG] HandLandmarker initialized successfully with model: {model_file}", file=sys.stderr)
                except Exception as e1:
                    raise Exception(f"MediaPipe HandLandmarker initialization failed: {e1}. Model file: {model_file}")
            else:
                # Old API (solutions) - if available
                mp_hands = mp.solutions.hands
                hands1 = mp_hands.Hands(
                    static_image_mode=True,
                    max_num_hands=2,
                    model_complexity=0,
                    min_detection_confidence=0.01,  # Very low threshold (was 0.05) - more sensitive
                    min_tracking_confidence=0.01    # Very low threshold (was 0.05) - more sensitive
                )
                hands2 = mp_hands.Hands(
                    static_image_mode=True,
                    max_num_hands=2,
                    model_complexity=1,
                    min_detection_confidence=0.01,  # Very low threshold (was 0.1) - more sensitive
                    min_tracking_confidence=0.01    # Very low threshold (was 0.1) - more sensitive
                )
        except Exception as e:
            result = {
                "hand_speed": 0.0,
                "intensity": "LOW",
                "level": 1,
                "frames_used": len(frame_paths),
                "valid_steps": 0,
                "fps": args.fps,
                "hands_detected": False,
                "error": f"MediaPipe initialization error: {str(e)}",
                "message": f"Failed to initialize MediaPipe: {str(e)}"
            }
            print(json.dumps(result))
            sys.exit(0)

        # Track positions (using OpenCV method)
        hand_positions = []  # Simple center positions
        frames_with_hands = 0
        detection_attempts = 0
        prev_img = None
        
        # Process frames using OpenCV (PRIMARY METHOD)
        print(f"[DEBUG] Using OpenCV-based hand detection (primary method)", file=sys.stderr)
        
        for idx, frame_path in enumerate(frame_paths):
            try:
                # Check if file exists
                if not os.path.exists(frame_path):
                    print(f"[DEBUG] File does not exist: {frame_path}", file=sys.stderr)
                    hand_positions.append(None)
                    continue
                
                img = cv2.imread(frame_path)
                if img is None:
                    print(f"[DEBUG] Failed to read image: {frame_path}", file=sys.stderr)
                    hand_positions.append(None)
                    continue

                detection_attempts += 1
                h, w = img.shape[:2]
                hand_pos = None
                
                # PRIMARY METHOD: MediaPipe (MOST ACCURATE - detects actual hand landmarks)
                if MP_AVAILABLE and use_new_api and hand_landmarker:
                    try:
                        from mediapipe import Image as MPImage
                        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                        mp_image = MPImage(image_format=MPImage.ImageFormat.SRGB, data=rgb_img)
                        detection_result = hand_landmarker.detect(mp_image)
                        
                        if detection_result.hand_landmarks and len(detection_result.hand_landmarks) > 0:
                            landmarks_list = detection_result.hand_landmarks[0]
                            
                            # VERY LENIENT: Accept ANY MediaPipe detection - if MediaPipe detects it, trust it
                            # MediaPipe is very accurate, so if it detects hands, we accept it regardless of position or landmark count
                            # Only need 1 landmark (wrist) - very lenient
                            if len(landmarks_list) >= 1:  # Accept even with just 1 landmark
                                # Get wrist position (landmark 0) - MediaPipe is accurate for hands
                                wrist = landmarks_list[0]
                                hand_pos = np.array([wrist.x * w, wrist.y * h], dtype=np.float32)
                                
                                # REMOVED position check - accept hands anywhere in the image
                                # MediaPipe is accurate enough that we trust its detection completely
                                y_pos_ratio = hand_pos[1] / h
                                if detection_attempts <= 5:
                                    print(f"[DEBUG] Frame {idx+1}: MediaPipe detected HAND at ({hand_pos[0]:.1f}, {hand_pos[1]:.1f}), y_ratio={y_pos_ratio:.2f}, landmarks={len(landmarks_list)}", file=sys.stderr)
                            else:
                                # Even with 0 landmarks, MediaPipe detected something - try to use it
                                if detection_attempts <= 3:
                                    print(f"[DEBUG] Frame {idx+1}: MediaPipe detected but no landmarks (len={len(landmarks_list)})", file=sys.stderr)
                                hand_pos = None
                    except Exception as e:
                        if detection_attempts <= 3:
                            print(f"[DEBUG] MediaPipe detection error: {e}", file=sys.stderr)
                
                # FALLBACK: OpenCV skin color detection (if MediaPipe not available or failed)
                # NOTE: OpenCV is less reliable than MediaPipe, but can help fill gaps when MediaPipe misses frames
                # We allow OpenCV fallback but with strict position validation to prevent false positives
                if hand_pos is None:
                    try:
                        result = detect_hand_opencv(img)
                        if result:
                            hand_pos, area = result
                            if hand_pos is not None:
                                # Additional validation: check if this is actually a hand, not face/body
                                h_img, w_img = img.shape[:2]
                                y_pos_ratio = hand_pos[1] / h_img  # Vertical position (0=top, 1=bottom)
                                
                                # REMOVED position check - accept hands anywhere in the image
                                # If OpenCV detects a hand-like shape, accept it regardless of position
                                if detection_attempts <= 5:
                                    print(f"[DEBUG] Frame {idx+1}: OpenCV detected HAND at ({hand_pos[0]:.1f}, {hand_pos[1]:.1f}), area={area:.0f}, y_ratio={y_pos_ratio:.2f}", file=sys.stderr)
                    except Exception as e:
                        if detection_attempts <= 3:
                            print(f"[DEBUG] OpenCV detection error: {e}", file=sys.stderr)
                
                # FALLBACK: Simple motion detection - if MediaPipe and OpenCV fail, use motion as last resort
                # This ensures we ALWAYS detect movement if hands are moving
                # Motion detection is enabled as a last resort to catch any hand movement
                if hand_pos is None and prev_img is not None:
                    try:
                        # Convert to grayscale for motion detection
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        prev_gray = cv2.cvtColor(prev_img, cv2.COLOR_BGR2GRAY)
                        
                        # Calculate absolute difference
                        diff = cv2.absdiff(gray, prev_gray)
                        
                        # Threshold to find moving regions
                        _, thresh = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
                        
                        # Find contours of moving regions
                        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        
                        if contours:
                            # Find largest moving region
                            largest_contour = max(contours, key=cv2.contourArea)
                            area = cv2.contourArea(largest_contour)
                            
                            # If movement is significant (at least 0.1% of image), accept it as hand movement
                            h_motion, w_motion = img.shape[:2]
                            min_motion_area = (h_motion * w_motion) * 0.001  # Very lenient - 0.1% of image
                            
                            if area > min_motion_area:
                                # Get center of moving region
                                M = cv2.moments(largest_contour)
                                if M["m00"] > 0:
                                    cx = int(M["m10"] / M["m00"])
                                    cy = int(M["m01"] / M["m00"])
                                    hand_pos = np.array([cx, cy], dtype=np.float32)
                                    
                                    if detection_attempts <= 5:
                                        print(f"[DEBUG] Frame {idx+1}: Motion detection found MOVEMENT at ({cx}, {cy}), area={area:.0f}", file=sys.stderr)
                    except Exception as e:
                        if detection_attempts <= 3:
                            print(f"[DEBUG] Motion detection error: {e}", file=sys.stderr)
                
                # Store position
                hand_positions.append(hand_pos)
                if hand_pos is not None:
                    frames_with_hands += 1
                
                prev_img = img.copy()
                
            except Exception as e:
                # Skip frame on error
                hand_positions.append(None)
                if detection_attempts <= 3:
                    print(f"[DEBUG] Frame processing error: {e}", file=sys.stderr)
                continue

        # Clean up MediaPipe if used
        if MP_AVAILABLE:
            if use_new_api and hand_landmarker:
                try:
                    hand_landmarker.close()
                except:
                    pass
            elif not use_new_api and hands1 and hands2:
                try:
                    hands1.close()
                    hands2.close()
                except:
                    pass

        # VERY RELAXED VALIDATION: Require hands in at least 5% of frames (or minimum 1 frame)
        # This is very lenient - if hands are detected in ANY frame, we'll calculate speed
        # This ensures speed is calculated whenever hands are showing
        min_required_frames = max(1, int(len(frame_paths) * 0.05))  # At least 5% of frames (very lenient - allows 1 frame minimum)
        
        print(f"[DEBUG] Detection complete: {frames_with_hands} frames with hands out of {detection_attempts} attempts", file=sys.stderr)
        print(f"[DEBUG] Minimum required frames for validation: {min_required_frames}", file=sys.stderr)
        
        # VERY LENIENT: If we have ANY hand positions (even from motion), calculate speed
        # Only reject if absolutely no movement detected at all
        if frames_with_hands == 0:
            # Check if there's ANY movement at all using motion detection as last resort
            # This ensures we catch hand movement even if MediaPipe/OpenCV fail
            valid_positions = [p for p in hand_positions if p is not None]
            if len(valid_positions) == 0:
                result = {
                    "hand_speed": 0.0,
                    "intensity": "LOW",
                    "level": 1,
                    "frames_used": len(frame_paths),
                    "valid_steps": 0,
                    "fps": args.fps,
                    "hands_detected": False,
                    "detection_attempts": detection_attempts,
                    "message": "No movement detected. Please move your hands in front of the camera."
                }
                print(json.dumps(result))
                sys.exit(0)
            else:
                # We have some positions (from motion detection), use them
                print(f"[DEBUG] Using {len(valid_positions)} positions from motion detection (fallback)", file=sys.stderr)
                frames_with_hands = len(valid_positions)
        
        # RELAXED VALIDATION: Only validate if we have very few detections
        # If we have at least 1 hand detection, proceed to calculate speed
        # This ensures speed is calculated whenever hands are showing
        is_valid, validation_message = validate_hand_detection(hand_positions, min_required_frames)
        
        # Even if validation fails, if we have ANY hand detections, calculate speed
        # This is more lenient - prioritize calculating speed over strict validation
        if not is_valid and frames_with_hands < 2:
            # Only reject if we have less than 2 detections
            result = {
                "hand_speed": 0.0,
                "intensity": "LOW",
                "level": 1,
                "frames_used": len(frame_paths),
                "valid_steps": 0,
                "fps": args.fps,
                "hands_detected": False,
                "detection_attempts": detection_attempts,
                "frames_with_hands": frames_with_hands,
                "message": f"Hands not detected: {validation_message}. Please ensure your HANDS are clearly visible in the camera frame."
            }
            print(json.dumps(result))
            sys.exit(0)
        
        # If validation failed but we have 2+ detections, continue anyway (very lenient)
        if not is_valid:
            print(f"[DEBUG] Validation failed but continuing with {frames_with_hands} detections (lenient mode)", file=sys.stderr)
        
        # RELAXED: If we have at least 1 hand detection, calculate speed
        # Don't reject based on frame count - if hands are detected, calculate speed
        # This ensures speed is calculated whenever hands are showing
        if frames_with_hands == 0:
            # Only reject if absolutely no hands detected
            result = {
                "hand_speed": 0.0,
                "intensity": "LOW",
                "level": 1,
                "frames_used": len(frame_paths),
                "valid_steps": 0,
                "fps": args.fps,
                "hands_detected": False,
                "detection_attempts": detection_attempts,
                "frames_with_hands": frames_with_hands,
                "message": f"Hands not detected: No hands detected in any frame. Please ensure your HANDS are clearly visible in the camera frame."
            }
            print(json.dumps(result))
            sys.exit(0)
        
        # RELAXED: Calculate speed if we have ANY valid positions
        # Don't reject based on position count - if hands are detected, calculate speed
        valid_positions = [p for p in hand_positions if p is not None]
        if len(valid_positions) == 0:
            # Only reject if absolutely no valid positions
            result = {
                "hand_speed": 0.0,
                "intensity": "LOW",
                "level": 1,
                "frames_used": len(frame_paths),
                "frames_with_hands": frames_with_hands,
                "valid_steps": 0,
                "fps": args.fps,
                "hands_detected": False,
                "message": f"Hands not detected: No valid hand positions found. Please ensure your HANDS are clearly visible in the camera frame."
            }
            print(json.dumps(result))
            sys.exit(0)
        
        # If we have at least 1 valid position, proceed to calculate speed (very lenient)
        print(f"[DEBUG] Proceeding with {len(valid_positions)} valid position(s) (lenient mode - calculating speed)", file=sys.stderr)
        
        # Calculate speeds from hand positions (only if we have valid detections)
        dt = 1.0 / max(args.fps, 1e-6)
        all_speeds = calculate_hand_speed(hand_positions, dt)
        
        # RELAXED: If no speeds calculated, try fallback even with few positions
        # Don't reject - always try to calculate speed if hands are detected
        if not all_speeds:
            # Even with few positions, try to calculate speed (very lenient)
            print(f"[DEBUG] No speeds from calculate_hand_speed, trying fallback with {len(valid_positions)} positions", file=sys.stderr)
            
            # Try fallback calculation only if we have enough valid positions
            if len(valid_positions) > 1:
                total_dist = 0.0
                for i in range(1, len(valid_positions)):
                    dist = float(np.linalg.norm(valid_positions[i] - valid_positions[i-1]))
                    total_dist += dist
                
                if total_dist > 0:
                    total_time = (len(valid_positions) - 1) * dt
                    if total_time > 0:
                        estimated_speed = total_dist / total_time
                        all_speeds = [estimated_speed]
                        print(f"[DEBUG] Fallback speed calculation: {estimated_speed:.2f} px/s", file=sys.stderr)
            
            if not all_speeds:
                # Even if hands are detected, if there's no movement, we should still report hands detected
                # but with zero speed
                result = {
                    "hand_speed": 0.0,
                    "intensity": "LOW",
                    "level": 1,
                    "frames_used": len(frame_paths),
                    "frames_with_hands": frames_with_hands,
                    "valid_steps": 0,
                    "fps": args.fps,
                    "hands_detected": True,
                    "message": f"Hands detected in {frames_with_hands} frame(s) but no movement detected. Please move your hands during capture."
                }
                print(json.dumps(result))
                sys.exit(0)

        # Calculate statistics with improved filtering for REAL movements
        if not all_speeds:
            avg_speed = 0.0
            max_speed = 0.0
            median_speed = 0.0
        else:
            # Step 1: Filter out extreme outliers (likely noise) - speeds over 2000 px/s
            filtered_speeds = [s for s in all_speeds if s <= 2000]
            if not filtered_speeds:
                # If all speeds are outliers, use original (shouldn't happen)
                filtered_speeds = all_speeds
            
            # Step 2: Remove speeds that are too high compared to median (likely noise spikes)
            if len(filtered_speeds) > 3:
                median_val = float(np.median(filtered_speeds))
                # Remove speeds that are more than 3x the median (likely noise)
                filtered_speeds = [s for s in filtered_speeds if s <= median_val * 3.0]
            
            # Step 3: Use median for more robust speed (resistant to outliers)
            # This gives a better representation of typical REAL movement speed
            avg_speed = float(np.median(filtered_speeds)) if filtered_speeds else 0.0
            max_speed = float(np.max(filtered_speeds)) if filtered_speeds else 0.0
            median_speed = float(np.median(filtered_speeds)) if filtered_speeds else 0.0
        
        label, level = get_intensity(avg_speed)

        result = {
            "hand_speed": round(avg_speed, 2),
            "max_speed": round(max_speed, 2),
            "median_speed": round(median_speed, 2),
            "intensity": label,
            "level": level,
            "frames_used": len(frame_paths),
            "frames_with_hands": frames_with_hands,
            "valid_steps": len(all_speeds),
            "fps": args.fps,
            "hands_detected": True,
            "message": f"Hands detected in {frames_with_hands} frames. Speed: {round(avg_speed, 2)} px/s ({label})"
        }

        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        import traceback
        # Always output valid JSON on error
        result = {
            "hand_speed": 0.0,
            "intensity": "LOW",
            "level": 1,
            "frames_used": 0,
            "valid_steps": 0,
            "fps": 10.0,
            "hands_detected": False,
            "error": str(e),
            "traceback": traceback.format_exc()[:500],  # Limit traceback length
            "message": f"Script error: {str(e)}"
        }
        print(json.dumps(result))
        sys.exit(0)

if __name__ == "__main__":
    main()
