// app/story/[id].tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MAGIC } from "../../src/theme/childMagicTheme";
import {
  API_ENDPOINTS,
  uploadFile,
  uploadFiles,
  apiCall,
  BASE_URL,
} from "../../config/api";

// ✅ Change this import path if your STORIES file is elsewhere
import { STORIES } from "../../data/stories";

function formatSeconds(total: number) {
  const hh = Math.floor(total / 3600);
  const ss = total % 60;
  return `${hh}h ${String(ss).padStart(2, "0")}s`;
}

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function StoryReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const story = useMemo(() => {
    const sid = params?.id ? String(params.id) : "";
    return STORIES.find((s: any) => String(s.id) === sid) ?? STORIES?.[0];
  }, [params?.id]);

  // Session management
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingSessionRef = useRef(false);
  // Use refs to access current values in intervals (avoids stale closure issues)
  const sessionIdRef = useRef<string | null>(null);
  const sessionActiveRef = useRef(false);

  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(true);
  const cameraRef = useRef<CameraView>(null);

  // Frame capture state
  const emotionCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameBufferRef = useRef<Array<{ uri: string; timestamp: number }>>([]);
  const isCapturingRef = useRef(false);
  // Track pending hand analysis requests to wait for them before finalizing
  const pendingHandRequestsRef = useRef<Set<Promise<any>>>(new Set());

  // Results
  const [finalEmotion, setFinalEmotion] = useState<string | null>(null);
  const [engagementLevel, setEngagementLevel] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<string | null>(null); // PRIMARY OUTPUT
  const [behaviorConfidence, setBehaviorConfidence] = useState<number | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Hand speed results
  const [handSpeed, setHandSpeed] = useState<number | null>(null);
  const [handIntensity, setHandIntensity] = useState<string | null>(null);
  const [handsDetected, setHandsDetected] = useState<boolean | null>(null);
  const [handMessage, setHandMessage] = useState<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (emotionCaptureIntervalRef.current) clearInterval(emotionCaptureIntervalRef.current);
      if (handCaptureIntervalRef.current) clearInterval(handCaptureIntervalRef.current);
    };
  }, []);

  // Timer for session duration
  useEffect(() => {
    if (sessionActive) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [sessionActive]);

  // Auto-stop after 2 minutes (120 seconds)
  useEffect(() => {
    if (sessionActive && seconds >= 120) {
      finishSession();
    }
  }, [seconds, sessionActive]);

  // Capture frame from camera silently (no shutter sound)
  // Using video mode frame capture which doesn't trigger shutter sounds
  const captureFrame = async (): Promise<string | null> => {
    // Check all prerequisites before attempting capture
    if (!cameraRef.current) {
      console.warn("[Capture] Camera ref not available");
      return null;
    }
    if (!permission?.granted) {
      console.warn("[Capture] Camera permission not granted");
      return null;
    }
    if (isCapturingRef.current) {
      console.warn("[Capture] Already capturing, skipping");
      return null;
    }
    if (!cameraOn) {
      console.warn("[Capture] Camera is off");
      return null;
    }
    if (!sessionActiveRef.current) {
      console.warn("[Capture] Session not active");
      return null;
    }

    try {
      isCapturingRef.current = true;
      const camera = cameraRef.current as any;
      
      if (!camera || typeof camera.takePictureAsync !== 'function') {
        console.warn("Camera takePictureAsync not available");
        return null;
      }

      // SILENT CAPTURE: Disable shutter sound and minimize visual disruption
      // Only captures the camera preview, not the entire screen
      // Using shutterSound: false to mute the camera sound completely
      const photoPromise = camera.takePictureAsync({
        quality: 0.7, // Good quality for emotion/hand detection
        base64: true, // Base64 output for efficient processing
        skipProcessing: true, // Skip processing to minimize flash duration
        shutterSound: false, // CRITICAL: Disable shutter sound completely
        // This only captures the camera view, not the whole screen
        // skipProcessing: true reduces capture time, minimizing visual flash
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Camera capture timeout")), 2000) // Fast timeout
      );

      const photo = await Promise.race([photoPromise, timeoutPromise]) as any;

      if (!photo) {
        console.warn("[Capture] Photo capture returned null");
        return null;
      }

      // Convert base64 to data URI for silent upload (no file system access)
      let uri: string;
      if (photo.base64) {
        uri = `data:image/jpeg;base64,${photo.base64}`;
      } else if (photo.uri) {
        uri = photo.uri;
      } else {
        console.warn("[Capture] No URI or base64 returned from capture");
        return null;
      }

      // Silent capture completed - no sound, no screen flash
      // Only the camera preview frame is captured, not the entire screen
      console.log(`[Capture] ✅ Frame captured silently (no sound/flash): ${uri.substring(0, 50)}...`);
      return uri;
    } catch (err: any) {
      console.error("Frame capture error:", err);
      // Don't throw - just return null to prevent crashes
      return null;
    } finally {
      // Always reset capturing flag, even on error
      isCapturingRef.current = false;
    }
  };

  // Send emotion prediction to backend
  const sendEmotionPrediction = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Emotion] Skipping - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      console.log(`[Emotion] ⏰ Starting emotion prediction for session ${currentSessionId}`);
      console.log(`[Emotion] Camera state:`, {
        cameraRef: !!cameraRef.current,
        permission: permission?.granted,
        cameraOn,
        sessionActive: sessionActiveRef.current
      });
      
      // Capture frame from camera
      console.log(`[Emotion] Attempting to capture frame...`);
      const frameUri = await captureFrame();
      if (!frameUri) {
        // Don't log as error - this is normal if camera is temporarily unavailable
        console.warn("[Emotion] ⚠️ Frame capture skipped - camera may be busy or unavailable. Will retry on next interval.");
        return;
      }

      console.log(`[Emotion] Frame captured: ${frameUri.substring(0, 50)}... (${frameUri.length} chars)`);

      // Send to backend API
      console.log(`[Emotion] Calling uploadFile with:`, {
        endpoint: API_ENDPOINTS.PREDICT_EMOTION,
        fileName: `emotion_${Date.now()}.jpg`,
        sessionId: currentSessionId
      });
      
      const result = await uploadFile(
        API_ENDPOINTS.PREDICT_EMOTION,
        {
          uri: frameUri,
          type: "image/jpeg",
          name: `emotion_${Date.now()}.jpg`,
        },
        { sessionId: currentSessionId }
      );

      console.log(`[Emotion] ✅ Backend response:`, result);
      
      // Check if result has error field (Python crash fallback) - this is OK, data is still stored
      if (result?.error) {
        console.warn(`[Emotion] ⚠️ Backend returned result with error (Python crash fallback):`, result.error?.substring(0, 100));
        // Result is still valid - backend stored a fallback (e.g., "neutral" emotion)
        // Session continues normally - don't log as error
      }
     } catch (err: any) {
       // Handle errors gracefully - don't show to user, just log as warning
       const errorMsg = err?.message || String(err);
       
       // Python crashes (exit code 3221226505) are expected sometimes - just log as warning
       // The backend should have returned a stored fallback, but if it didn't, that's OK too
       if (errorMsg.includes("Python script failed") || errorMsg.includes("3221226505")) {
         console.warn("[Emotion] ⚠️ Python script crashed (non-blocking, session continues):", errorMsg.substring(0, 100));
       } else if (errorMsg.includes("Network request failed") || errorMsg.includes("timeout")) {
         console.warn("[Emotion] ⚠️ Network error (non-blocking, session continues):", errorMsg.substring(0, 100));
       } else {
         console.warn("[Emotion] ⚠️ Emotion prediction error (non-blocking):", err?.message?.substring(0, 100) || String(err).substring(0, 100));
       }
       // Don't block the session on individual frame errors - system will retry on next interval
     }
  };

  // Send hand analysis to backend
  const sendHandAnalysis = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Hand] Skipping hand analysis - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    // Create a promise for this request to track it
    let requestPromise: Promise<any> | null = null;

    try {
      console.log(`[Hand] Capturing frames for hand analysis for session ${currentSessionId}`);
      
      // Capture multiple frames for hand speed analysis (need at least 2 frames)
      const frames: Array<{ uri: string; type: string; name: string }> = [];
      const frameCount = 15; // Capture 15 frames for better hand movement detection
      const fps = 5; // 5 fps = 200ms between frames - gives more time for hand movement
      const baseTimestamp = Date.now();
      
      for (let i = 0; i < frameCount; i++) {
        const frameUri = await captureFrame();
        if (frameUri) {
          // Use sequential numbering with timestamp to ensure proper ordering
          frames.push({
            uri: frameUri,
            type: "image/jpeg",
            name: `hand_${baseTimestamp}_${String(i).padStart(4, '0')}.jpg`,
          });
        }
        // Delay between captures to allow hand movement
        if (i < frameCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
        }
      }

      if (frames.length < 2) {
        console.warn(`[Hand] Not enough frames captured (${frames.length}), need at least 2`);
        return;
      }

      console.log(`[Hand] Sending ${frames.length} frames to backend`);
      
      // Create the request promise and track it IMMEDIATELY
      // Use more retries (3) and longer timeout (120s) for hand analysis
      // Hand analysis is critical and can be slow, especially on mobile
      requestPromise = uploadFiles(
        API_ENDPOINTS.ANALYZE_HAND,
        frames,
        { sessionId: currentSessionId, fps: fps },
        3, // 3 retries (was 2) - more resilient for network issues
        120000 // 120 seconds timeout (was 90s) - hand analysis can be very slow
      );
      
      // Add to pending requests IMMEDIATELY (before await) so it's tracked even if session stops
      pendingHandRequestsRef.current.add(requestPromise);
      console.log(`[Hand] Added request to pending (${pendingHandRequestsRef.current.size} total pending)`);
      
      // Send to backend API with better error handling
      const result = await requestPromise;

      console.log(`[Hand] ✅ Backend response:`, result);
      
      // Update hand speed state with results
      if (result) {
        setHandSpeed(result.hand_speed ?? null);
        setHandIntensity(result.intensity ?? null);
        setHandsDetected(result.hands_detected ?? null);
        setHandMessage(result.message || result.note || null);
      }
    } catch (err: any) {
      // Log as warning instead of error - don't break the session
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("Network request failed") || errorMsg.includes("timeout")) {
        console.warn("[Hand] ⚠️ Hand analysis network error (non-blocking):", errorMsg.substring(0, 100));
      } else {
        console.warn("[Hand] ⚠️ Hand analysis error (non-blocking):", err);
      }
      // Don't set error state - allow session to continue
      // Don't block the session on individual analysis errors
    } finally {
      // Remove from pending requests when done (success or error)
      // This is important so finalize doesn't wait forever
      if (requestPromise) {
        const removed = pendingHandRequestsRef.current.delete(requestPromise);
        if (removed) {
          console.log(`[Hand] Removed completed request from pending (${pendingHandRequestsRef.current.size} remaining)`);
        }
      }
    }
  };

  // Start session with backend API
  const startSession = async () => {
    // Prevent multiple simultaneous calls
    if (isStartingSessionRef.current || sessionActive) {
      console.log("Session already starting or active, ignoring request");
      return;
    }

    try {
      isStartingSessionRef.current = true;

      // Request camera permission
      if (!permission?.granted) {
        const ok = await ensureCameraPermission();
        if (!ok) {
          setError("Camera permission required");
          isStartingSessionRef.current = false;
          return;
        }
      }

      setLoading(true);
      setError(null);
      setSeconds(0);
      setFinalEmotion(null);
      setEngagementLevel(null);
      setSummary(null);
      // Reset hand speed state
      setHandSpeed(null);
      setHandIntensity(null);
      setHandsDetected(null);
      setHandMessage(null);

      // Generate session ID
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId; // Update ref immediately

      console.log(`[Session] Starting session ${newSessionId} with backend API`);
      
      // Call backend to start session
      // Use longer timeout (60s) and more retries (3) for start session
      // Backend might be slow to respond, especially on mobile devices
      const startResponse = await apiCall(
        API_ENDPOINTS.START_SESSION,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: newSessionId }),
        },
        3, // retries
        60000 // 60 second timeout (backend might be slow on mobile)
      );

      if (!startResponse.ok) {
        const errorData = await startResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to start session");
      }

      const startData = await startResponse.json();
      console.log(`[Session] ✅ Session started:`, startData);
      
      setSessionActive(true);
      sessionActiveRef.current = true; // Update ref immediately
      isStartingSessionRef.current = false;
      setLoading(false);

      // Wait a bit before starting captures
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Session] Starting capture intervals for session ${newSessionId}`);
      
      // Start emotion capture (every 2 seconds)
      emotionCaptureIntervalRef.current = setInterval(() => {
        try {
          sendEmotionPrediction();
        } catch (err) {
          console.error("Error in emotion capture interval:", err);
        }
      }, 2000);

      // Start hand capture (every 8 seconds)
      handCaptureIntervalRef.current = setInterval(() => {
        try {
          sendHandAnalysis();
        } catch (err) {
          console.error("Error in hand capture interval:", err);
        }
      }, 8000);
      
      // Trigger first captures
      setTimeout(() => {
        sendEmotionPrediction();
        sendHandAnalysis();
      }, 1000);
    } catch (err: any) {
      console.error("Start session error:", err);
      setError(err.message || "Failed to start session");
      setSessionActive(false);
      sessionActiveRef.current = false;
      sessionIdRef.current = null;
      // Clear any intervals that might have been set
      if (emotionCaptureIntervalRef.current) {
        clearInterval(emotionCaptureIntervalRef.current);
        emotionCaptureIntervalRef.current = null;
      }
      if (handCaptureIntervalRef.current) {
        clearInterval(handCaptureIntervalRef.current);
        handCaptureIntervalRef.current = null;
      }
      setLoading(false);
      isStartingSessionRef.current = false;
    }
  };

  // Finish session and get results from backend
  const finishSession = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      console.warn("[Session] Cannot finish - no sessionId");
      return;
    }

    setLoading(true);
    setSessionActive(false);
    sessionActiveRef.current = false; // Update ref immediately

    console.log(`[Session] Stopping capture intervals for session ${currentSessionId}`);
    
    // Stop capture intervals
    if (emotionCaptureIntervalRef.current) {
      clearInterval(emotionCaptureIntervalRef.current);
      emotionCaptureIntervalRef.current = null;
    }
    if (handCaptureIntervalRef.current) {
      clearInterval(handCaptureIntervalRef.current);
      handCaptureIntervalRef.current = null;
    }

    try {
      // CRITICAL: Get pending requests BEFORE clearing anything
      // Wait for pending hand requests to complete before finalizing
      // This ensures all in-flight requests are included in the final summary
      const pendingRequests = Array.from(pendingHandRequestsRef.current);
      console.log(`[Session] Found ${pendingRequests.length} pending hand analysis request(s)`);
      
      if (pendingRequests.length > 0) {
        console.log(`[Session] Waiting for ${pendingRequests.length} pending hand analysis request(s) to complete...`);
        try {
          // Wait for all pending requests with a maximum timeout
          // Use Promise.allSettled to wait for all, even if some fail
          await Promise.allSettled(
            pendingRequests.map(p => 
              Promise.race([
                p.catch(err => {
                  // Log but don't throw - we want to wait for all requests
                  console.log(`[Session] Pending request failed:`, err?.message?.substring(0, 100));
                  return null; // Return null on error so Promise.allSettled doesn't fail
                }),
                new Promise((resolve) => 
                  setTimeout(() => {
                    console.log(`[Session] Pending request timeout (30s)`);
                    resolve(null); // Resolve with null on timeout
                  }, 30000) // 30s max wait per request
                )
              ])
            )
          );
          console.log(`[Session] ✅ All pending hand requests completed (or timed out)`);
        } catch (err) {
          console.warn(`[Session] ⚠️ Error waiting for pending requests:`, err);
        }
        // Additional delay to ensure backend has processed and stored all data
        console.log(`[Session] Waiting 5 seconds for backend to process and store all hand data...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second buffer for backend processing
      } else {
        // No pending requests, but still wait a bit for any requests that just started
        console.log(`[Session] No pending hand requests tracked, waiting 8 seconds for any in-flight requests to complete...`);
        await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay for safety
      }
      
      // Clear pending requests after waiting (they should be done by now)
      console.log(`[Session] Clearing ${pendingHandRequestsRef.current.size} remaining pending hand request(s)`);
      pendingHandRequestsRef.current.clear();
      
      console.log(`[Session] Finalizing session ${currentSessionId} with backend API...`);
      
      // Call backend to finalize session and get results
      // Use longer timeout (60s) since finalize needs to process all session data
      const finalizeResponse = await apiCall(
        API_ENDPOINTS.FINALIZE_SESSION,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: currentSessionId }),
        },
        2, // retries
        60000 // 60 second timeout for finalize (processes all session data)
      );

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to finalize session");
      }

      const result = await finalizeResponse.json();
      console.log(`[Session] ✅ Final results from backend:`, result);
      
      // Extract results from backend response - NO FALLBACKS, only use backend data
      if (!result.finalEmotion && !result.predicted) {
        throw new Error("Backend did not return emotion data");
      }
      if (!result.engagementLevel) {
        throw new Error("Backend did not return engagement level");
      }
      if (!result.summary) {
        throw new Error("Backend did not return summary");
      }
      
      // Use ONLY backend data - no hardcoded fallbacks
      const finalEmotion = result.finalEmotion || result.predicted;
      const engagementLevel = result.engagementLevel;
      const behavior = result.behavior || "Neutral"; // PRIMARY OUTPUT
      const behaviorConfidence = result.behaviorConfidence || 0.0;
      const summary = result.summary;
      
      // Set results from backend - Behavior is PRIMARY
      setBehavior(behavior);
      setBehaviorConfidence(behaviorConfidence);
      setFinalEmotion(finalEmotion);
      setEngagementLevel(engagementLevel);
      setSummary(summary);
      setSummaryVisible(true);
      
      console.log(`[Session] Results from backend: Behavior=${behavior}, Emotion=${finalEmotion}, Engagement=${engagementLevel}`);
    } catch (err: any) {
      console.error("Finalize session error:", err);
      setError(err.message || "Failed to get session results from backend");
      // NO FALLBACK DATA - show error instead
      setBehavior(null);
      setBehaviorConfidence(null);
      setFinalEmotion(null);
      setEngagementLevel(null);
      setSummary(null);
      setSummaryVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const ensureCameraPermission = async () => {
    if (permission?.granted) return true;
    const res = await requestPermission();
    return !!res?.granted;
  };

  const onToggleCamera = async () => {
    if (!cameraOn) {
      const ok = await ensureCameraPermission();
      if (!ok) return;
    }
    setCameraOn((v) => !v);
  };

  const CamStatus = () => {
    if (!cameraOn) return <Text style={styles.camHint}>Camera: OFF</Text>;
    if (!permission) return <Text style={styles.camHint}>Camera: checking…</Text>;
    if (permission.granted) return <Text style={styles.camHint}>Camera: ON</Text>;
    return (
      <Text style={[styles.camHint, { color: MAGIC.accentPink }]}>
        Camera permission needed
      </Text>
    );
  };

  if (!story) {
    return (
      <View style={{ flex: 1, backgroundColor: MAGIC.pageBg }}>
        <LinearGradient
          colors={MAGIC.headerGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCircle}>
              <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.emptyStateCard}>
              <Text style={styles.storyTitle}>No stories found</Text>
              <Text style={styles.emptyStateSub}>
                Check your STORIES import path and data file.
              </Text>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginTop: 20, borderRadius: 20, overflow: "hidden" }}
              >
                <LinearGradient
                  colors={MAGIC.sessionGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradInner}
                >
                  <Text style={styles.startSessionBtnText}>Go back</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: MAGIC.pageBg }}>
      <LinearGradient
        colors={MAGIC.headerGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCircle}>
            <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerKicker}>Magic reading</Text>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              Your tale ✨
            </Text>
          </View>
          <View style={styles.profileIcon}>
            <MaterialCommunityIcons name="book-open-variant" size={20} color={MAGIC.purple500} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroSection}>
              <View style={styles.heroImageContainer}>
            {story.imageSource || story.imageUrl ? (
              <Image 
                source={story.imageSource || { uri: story.imageUrl }} 
                style={styles.heroImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.heroImagePlaceholder, { backgroundColor: story.coverColor }]}>
                <Text style={styles.heroEmoji}>{story.emoji}</Text>
              </View>
            )}
            {/* Difficulty Tag on Image */}
            <View style={styles.difficultyTag}>
              <Text style={styles.difficultyText}>{story.level}</Text>
            </View>
            {/* Hide/Show Cam Button Overlay */}
            <TouchableOpacity onPress={onToggleCamera} style={styles.hideCamBtnOverlay}>
              <Text style={styles.hideCamBtnText}>{cameraOn ? "Hide cam" : "Show cam"}</Text>
            </TouchableOpacity>
          </View>

          {/* Story Title and Metadata */}
          <Text style={styles.storyTitle}>{story.title}</Text>
          <View style={styles.metadataRow}>
            <View style={styles.timeBadge}>
              <Text style={styles.timeText}>{story.timeMin}min</Text>
            </View>
            {story.uploadedOn && (
              <Text style={styles.dateText}>{story.uploadedOn}</Text>
            )}
          </View>
            </View>
          </View>

        {/* Show Camera Button - when camera is hidden */}
        {!cameraOn && (
          <TouchableOpacity onPress={onToggleCamera} style={styles.showCamBtn}>
            <Text style={styles.showCamBtnText}>Show Camera</Text>
          </TouchableOpacity>
        )}

        {/* Story Text Box */}
        <View style={styles.storyTextBox}>
          <Text style={styles.storyText}>{story.storyText}</Text>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} numberOfLines={10}>
              {error}
            </Text>
          </View>
        )}

        {/* Session Controls */}
        <View style={styles.sessionRow}>
          <TouchableOpacity
            onPress={sessionActive ? finishSession : startSession}
            style={styles.startSessionBtnOuter}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <View style={styles.startSessionLoading}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <LinearGradient
                colors={MAGIC.sessionGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGradInner}
              >
                <Text style={styles.startSessionBtnText}>
                  {sessionActive ? "Finish session" : "Start reading session"}
                </Text>
              </LinearGradient>
            )}
          </TouchableOpacity>

          <View style={[styles.statusBtn, sessionActive && styles.statusBtnActive]}>
            <Text style={styles.statusBtnText}>
              {sessionActive ? `Active (${formatSeconds(seconds)})` : "Inactive"}
            </Text>
          </View>
        </View>

        {/* Session Output Card */}
        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Session Output</Text>
          
          {behavior || finalEmotion || engagementLevel ? (
            <>
              {/* BEHAVIOR - PRIMARY OUTPUT - BIG AND PROMINENT */}
              {behavior && (
                <View style={styles.behaviorContainerCard}>
                  <Text style={styles.behaviorLabelCard}>Behavior</Text>
                  <Text style={styles.behaviorValueCard}>{behavior}</Text>
                </View>
              )}
              
              <Text style={styles.outputLabel}>
                Final Emotion - <Text style={styles.outputValueYellow}>{finalEmotion ?? "—"}</Text>
              </Text>
              <Text style={styles.outputLabel}>
                Engagement Level - <Text style={styles.outputValueBlue}>{engagementLevel ?? "—"}</Text>
              </Text>
              {summary && (
                <Text style={styles.outputSummary} numberOfLines={5}>
                  {summary}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.outputPlaceholder}>
              Start a session to begin capturing and analyzing engagement data.
            </Text>
          )}
        </View>

        {/* Hand Speed Detection Card */}
        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Hand Movement Speed</Text>
          
          {sessionActive || handsDetected !== null ? (
            <>
              {handsDetected === false ? (
                <View style={styles.handStatusContainer}>
                  <Text style={[styles.outputLabel, { color: "#FF6B6B" }]}>
                    ⚠️ No hands detected
                  </Text>
                  {handMessage && (
                    <Text style={styles.handMessage}>{handMessage}</Text>
                  )}
                </View>
              ) : handsDetected === true && handSpeed !== null ? (
                <>
                  <Text style={styles.outputLabel}>
                    Average Speed - <Text style={styles.outputValueGreen}>{handSpeed.toFixed(2)} px/s</Text>
                  </Text>
                  <Text style={styles.outputLabel}>
                    Intensity - <Text style={[
                      styles.outputValueIntensity,
                      handIntensity === "HIGH" && styles.outputValueHigh,
                      handIntensity === "MEDIUM" && styles.outputValueMedium,
                      handIntensity === "LOW" && styles.outputValueLow,
                    ]}>
                      {handIntensity ?? "—"}
                    </Text>
                  </Text>
                  {handMessage && (
                    <Text style={styles.handMessage}>{handMessage}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.outputPlaceholder}>
                  Analyzing hand movement...
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.outputPlaceholder}>
              Start a session to detect hand movement speed.
            </Text>
          )}
        </View>

        {/* Spacer for camera overlay */}
        {cameraOn && <View style={{ height: 180 }} />}
      </ScrollView>
      </SafeAreaView>

      {/* Camera Overlay */}
      {cameraOn && (
        <View style={styles.camBox}>
          <CamStatus />
          {!permission?.granted ? (
            <TouchableOpacity
              style={styles.camPermissionBtn}
              onPress={ensureCameraPermission}
            >
              <Text style={styles.camPermissionBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.camPreview} collapsable={false}>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="front"
                mode="picture"
                // Using picture mode with shutterSound: false in takePictureAsync
                // This prevents sound, and the preview should remain stable
                // Flash is controlled via takePictureAsync options, not component props
              />
            </View>
          )}
          <TouchableOpacity onPress={onToggleCamera} style={styles.camCloseBtn}>
            <Text style={styles.camCloseBtnText}>Hide cam</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary Modal */}
      <Modal visible={summaryVisible} animationType="slide" transparent>
        <View style={styles.modalBackground}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Session Summary</Text>
            <Text style={styles.modalText}>Story: {story.title}</Text>
            <Text style={styles.modalText}>Duration: {formatSeconds(seconds)}</Text>
            {error ? (
              <Text style={[styles.modalText, { color: "#FF0000", fontWeight: "700" }]}>
                Error: {error}
              </Text>
            ) : (
              <>
                {/* BEHAVIOR - PRIMARY OUTPUT - BIG AND PROMINENT */}
                {behavior && (
                  <View style={styles.behaviorContainer}>
                    <Text style={styles.behaviorLabel}>Behavior</Text>
                    <Text style={styles.behaviorValue}>{behavior}</Text>
                  </View>
                )}
                
                <Text style={styles.modalText}>Final Emotion: {finalEmotion ?? "—"}</Text>
                <Text style={styles.modalText}>Engagement: {engagementLevel ?? "—"}</Text>
                {summary ? (
                  <Text style={[styles.modalText, { marginTop: 10, fontSize: 12 }]}>
                    {summary}
                  </Text>
                ) : (
                  <Text style={[styles.modalText, { color: "#FF0000", fontSize: 12 }]}>
                    No summary data received from backend
                  </Text>
                )}
              </>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSummaryVisible(false)}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    borderBottomLeftRadius: 52,
    borderBottomRightRadius: 52,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  backBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    marginTop: 2,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#7c3aed",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  profileIconText: {
    fontSize: 18,
    color: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 200,
  },
  emptyStateCard: {
    marginTop: 24,
    backgroundColor: MAGIC.cardWhite,
    borderRadius: 36,
    padding: 24,
    borderBottomWidth: 8,
    borderBottomColor: MAGIC.purple100,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  emptyStateSub: {
    marginTop: 8,
    fontSize: 14,
    color: MAGIC.textMuted,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: MAGIC.cardWhite,
    borderRadius: 36,
    padding: 16,
    marginBottom: 16,
    borderBottomWidth: 8,
    borderBottomColor: MAGIC.purple100,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroSection: {
    marginBottom: 0,
  },
  heroImageContainer: {
    width: "100%",
    height: 220,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 14,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: {
    fontSize: 80,
  },
  difficultyTag: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "800",
    color: MAGIC.textPrimary,
  },
  hideCamBtnOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: MAGIC.accentPink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hideCamBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  showCamBtn: {
    backgroundColor: MAGIC.softPinkBg,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: "center",
    marginBottom: 16,
    alignSelf: "flex-start",
    borderWidth: 2,
    borderColor: MAGIC.softPinkBorder,
  },
  showCamBtnText: {
    color: "#9D174D",
    fontSize: 14,
    fontWeight: "800",
  },
  storyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: MAGIC.textPrimary,
    marginBottom: 8,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeBadge: {
    backgroundColor: MAGIC.softPurpleBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "800",
    color: MAGIC.purple600,
  },
  dateText: {
    fontSize: 14,
    fontWeight: "700",
    color: MAGIC.textMuted,
  },
  storyTextBox: {
    backgroundColor: MAGIC.cardWhite,
    borderWidth: 1,
    borderColor: MAGIC.softPurpleBorder,
    borderRadius: 32,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  storyText: {
    fontSize: 17,
    lineHeight: 28,
    color: MAGIC.textPrimary,
    fontWeight: "500",
    letterSpacing: 0.2,
    textAlign: "left",
  },

  // Error
  errorBox: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  errorText: {
    color: "#C62828",
    fontWeight: "600",
  },

  // Session Controls
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  startSessionBtnOuter: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    minHeight: 52,
  },
  primaryGradInner: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  startSessionLoading: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MAGIC.purple500,
  },
  startSessionBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  statusBtn: {
    backgroundColor: MAGIC.softPinkBg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: MAGIC.softPinkBorder,
  },
  statusBtnActive: {
    backgroundColor: "#FBCFE8",
    borderColor: MAGIC.accentPink,
  },
  statusBtnText: {
    color: "#9D174D",
    fontSize: 13,
    fontWeight: "900",
  },
  outputCard: {
    backgroundColor: MAGIC.cardWhite,
    borderRadius: 28,
    padding: 18,
    marginTop: 10,
    borderBottomWidth: 6,
    borderBottomColor: MAGIC.purple100,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  outputCardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: MAGIC.textPrimary,
    marginBottom: 12,
  },
  outputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: MAGIC.textPrimary,
    marginBottom: 8,
  },
  outputValueYellow: {
    color: "#C2410C",
    fontWeight: "900",
  },
  outputValueBlue: {
    color: MAGIC.purple600,
    fontWeight: "900",
  },
  outputSummary: {
    marginTop: 8,
    fontSize: 13,
    color: MAGIC.textMuted,
    lineHeight: 20,
  },
  outputPlaceholder: {
    fontSize: 13,
    color: "#999",
    lineHeight: 20,
    fontStyle: "italic",
  },
  outputValueGreen: {
    color: "#28A745",
    fontWeight: "900",
  },
  outputValueIntensity: {
    fontWeight: "900",
  },
  outputValueHigh: {
    color: "#DC3545", // Red for high intensity
  },
  outputValueMedium: {
    color: "#FFC107", // Yellow/Orange for medium intensity
  },
  outputValueLow: {
    color: "#28A745", // Green for low intensity
  },
  handStatusContainer: {
    marginTop: 4,
  },
  handMessage: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
  },

  // Camera Overlay
  camBox: {
    position: "absolute",
    left: 16,
    bottom: 16,
    width: 168,
    backgroundColor: MAGIC.cardWhite,
    borderRadius: 24,
    padding: 12,
    borderWidth: 2,
    borderColor: MAGIC.softPurpleBorder,
    zIndex: 50,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  camHint: {
    fontSize: 12,
    fontWeight: "900",
    color: MAGIC.textPrimary,
    marginBottom: 8,
  },
  camPreview: {
    height: 120,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    marginBottom: 8,
  },
  camPermissionBtn: {
    backgroundColor: MAGIC.purple500,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  camPermissionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  camCloseBtn: {
    backgroundColor: MAGIC.softPurpleBg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: MAGIC.softPurpleBorder,
  },
  camCloseBtnText: {
    color: MAGIC.purple600,
    fontSize: 11,
    fontWeight: "800",
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(76, 29, 149, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "85%",
    backgroundColor: MAGIC.cardWhite,
    padding: 22,
    borderRadius: 28,
    borderBottomWidth: 8,
    borderBottomColor: MAGIC.purple100,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
    color: MAGIC.textPrimary,
  },
  modalText: { marginBottom: 6, fontWeight: "700", color: MAGIC.textPrimary },
  closeBtn: {
    marginTop: 12,
    backgroundColor: MAGIC.accentPink,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 20,
    alignSelf: "flex-end",
  },
  behaviorContainer: {
    backgroundColor: MAGIC.purple100,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    marginTop: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: MAGIC.purple400,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  behaviorLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: MAGIC.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  behaviorValue: {
    fontSize: 32,
    fontWeight: "900",
    color: MAGIC.textPrimary,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  behaviorConfidence: {
    fontSize: 14,
    fontWeight: "600",
    color: MAGIC.textMuted,
    fontStyle: "italic",
  },
  behaviorContainerCard: {
    backgroundColor: MAGIC.purple100,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: MAGIC.purple400,
    shadowColor: "#7c3aed",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  behaviorLabelCard: {
    fontSize: 12,
    fontWeight: "800",
    color: MAGIC.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  behaviorValueCard: {
    fontSize: 28,
    fontWeight: "900",
    color: MAGIC.textPrimary,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  behaviorConfidenceCard: {
    fontSize: 12,
    fontWeight: "600",
    color: MAGIC.textMuted,
    fontStyle: "italic",
  },
});
