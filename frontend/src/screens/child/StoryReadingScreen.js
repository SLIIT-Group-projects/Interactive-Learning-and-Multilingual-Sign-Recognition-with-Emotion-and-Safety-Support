// React Navigation version of StoryReaderScreen
// This is a copy of app/story/[id].tsx but adapted for React Navigation
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
import { useRoute, useNavigation } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MAGIC } from "../../theme/childMagicTheme";
import {
  API_ENDPOINTS,
  uploadFile,
  uploadFiles,
  apiCall,
  BASE_URL,
} from "../../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { saveStoryEmotionSession } from "../../services/firestore/emotionService";

// Import stories data
import { STORIES } from "../../../data/stories";

function formatSeconds(total) {
  const hh = Math.floor(total / 3600);
  const ss = total % 60;
  return `${hh}h ${String(ss).padStart(2, "0")}s`;
}

// Generate unique session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function StoryReaderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  // Get storyId from React Navigation route params instead of Expo Router
  const storyId = route.params?.storyId || route.params?.id;

  const story = useMemo(() => {
    const sid = storyId ? String(storyId) : "";
    return STORIES.find((s) => String(s.id) === sid) ?? STORIES?.[0];
  }, [storyId]);

  // Get user data for saving emotion session
  const { userData } = useAuth();
  const childId = userData?.uid || null;
  const parentId = userData?.parentId || null;

  // Session management
  const [sessionId, setSessionId] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);
  const isStartingSessionRef = useRef(false);
  // Use refs to access current values in intervals (avoids stale closure issues)
  const sessionIdRef = useRef(null);
  const sessionActiveRef = useRef(false);

  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(true);
  const cameraRef = useRef(null);

  // Frame capture state
  const emotionCaptureIntervalRef = useRef(null);
  const handCaptureIntervalRef = useRef(null);
  const frameBufferRef = useRef([]);
  const isCapturingRef = useRef(false);
  // Track pending hand analysis requests to wait for them before finalizing
  const pendingHandRequestsRef = useRef(new Set());

  // Results
  const [finalEmotion, setFinalEmotion] = useState(null);
  const [engagementLevel, setEngagementLevel] = useState(null);
  const [behavior, setBehavior] = useState(null); // PRIMARY OUTPUT
  const [behaviorConfidence, setBehaviorConfidence] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Hand speed results
  const [handSpeed, setHandSpeed] = useState(null);
  const [handIntensity, setHandIntensity] = useState(null);
  const [handsDetected, setHandsDetected] = useState(null);
  const [handMessage, setHandMessage] = useState(null);

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

  // Update behavior in real-time when hand/emotion data changes
  useEffect(() => {
    // CRITICAL: If we have hand speed > 0, hands ARE detected (regardless of flag)
    const handsActuallyDetected = (handSpeed !== null && handSpeed > 0) || handsDetected === true;
    
    // If we have both emotion and hand data, calculate behavior
    if (finalEmotion && handsActuallyDetected && handSpeed !== null && handSpeed > 0) {
      const handLevel = handIntensity === "HIGH" ? 3 : handIntensity === "MEDIUM" ? 2 : 1;
      const isHighArousal = handIntensity === "HIGH" || handLevel >= 3;
      const isMediumArousal = handIntensity === "MEDIUM" || handLevel === 2;
      
      const emotionLower = finalEmotion.toLowerCase();
      let calculatedBehavior = "Neutral";
      
      if (emotionLower === "happy") {
        calculatedBehavior = isHighArousal ? "Excited Happy" : isMediumArousal ? "Happy" : "Calm Happy";
      } else if (emotionLower === "angry") {
        calculatedBehavior = isHighArousal ? "Highly Agitated Angry" : isMediumArousal ? "Angry" : "Controlled Anger";
      } else if (emotionLower === "sad") {
        calculatedBehavior = isHighArousal ? "Distressed" : isMediumArousal ? "Sad" : "Low-energy Sad";
      } else if (emotionLower === "fear") {
        calculatedBehavior = isHighArousal ? "Panicked" : isMediumArousal ? "Fear" : "Nervous";
      } else if (emotionLower === "disgust") {
        calculatedBehavior = isHighArousal ? "Strong Disgust" : isMediumArousal ? "Disgust" : "Mild Disgust";
      } else if (emotionLower === "surprise") {
        calculatedBehavior = isHighArousal ? "Strong Shock" : isMediumArousal ? "Surprise" : "Mild Surprise";
      } else {
        calculatedBehavior = isHighArousal ? "Hyperactive" : isMediumArousal ? "Neutral" : "Calm Neutral";
      }
      
      const calculatedEngagement = isHighArousal ? "HIGH" : isMediumArousal ? "MEDIUM" : "LOW";
      
      // Update state
      if (behavior !== calculatedBehavior) {
        setBehavior(calculatedBehavior);
      }
      if (engagementLevel !== calculatedEngagement) {
        setEngagementLevel(calculatedEngagement);
      }
    } else if ((!finalEmotion || !handsActuallyDetected) && behavior !== "Cannot detect") {
      // Missing either emotion or hands
      setBehavior("Cannot detect");
      setEngagementLevel("LOW");
    }
  }, [finalEmotion, handSpeed, handIntensity, handsDetected]);

  // Capture frame from camera silently (no shutter sound)
  const captureFrame = async () => {
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
    // Allow capture even if session just ended (for pending requests)
    // This ensures we can capture frames for in-flight hand analysis requests
    if (!sessionActiveRef.current && !isCapturingRef.current) {
      // Only warn on first check, allow capture to continue if already in progress
      console.warn("[Capture] Session not active, but allowing capture for pending request");
    }

    try {
      isCapturingRef.current = true;
      const camera = cameraRef.current;
      
      if (!camera || typeof camera.takePictureAsync !== 'function') {
        console.warn("Camera takePictureAsync not available");
        return null;
      }

      // SILENT CAPTURE: Disable shutter sound and minimize visual disruption
      const photoPromise = camera.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: true,
        shutterSound: false,
      });

      // No timeout - allow camera to take as long as needed
      const photo = await photoPromise;

      if (!photo) {
        console.warn("[Capture] Photo capture returned null");
        return null;
      }

      // Convert base64 to data URI
      let uri;
      if (photo.base64) {
        uri = `data:image/jpeg;base64,${photo.base64}`;
      } else if (photo.uri) {
        uri = photo.uri;
      } else {
        console.warn("[Capture] No URI or base64 returned from capture");
        return null;
      }

      console.log(`[Capture] ✅ Frame captured silently (no sound/flash): ${uri.substring(0, 50)}...`);
      return uri;
    } catch (err) {
      console.error("Frame capture error:", err);
      return null;
    } finally {
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
      
      const frameUri = await captureFrame();
      if (!frameUri) {
        console.warn("[Emotion] ⚠️ Frame capture skipped - camera may be busy or unavailable. Will retry on next interval.");
        return;
      }

      console.log(`[Emotion] Frame captured: ${frameUri.substring(0, 50)}... (${frameUri.length} chars)`);
      
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
      
      // Update emotion in real-time so behavior can be calculated when hand data arrives
      if (result?.predicted && result.predicted !== "no_face_detected" && result.predicted !== "unknown") {
        setFinalEmotion(result.predicted);
        
        // If we already have hand data, calculate behavior immediately
        if (handsDetected === true && handSpeed !== null && handSpeed > 0) {
          const handLevel = handIntensity === "HIGH" ? 3 : handIntensity === "MEDIUM" ? 2 : 1;
          const isHighArousal = handIntensity === "HIGH" || handLevel >= 3;
          const isMediumArousal = handIntensity === "MEDIUM" || handLevel === 2;
          const isLowArousal = handIntensity === "LOW" || handLevel === 1;
          
          const emotionLower = result.predicted.toLowerCase();
          let calculatedBehavior = "Neutral";
          
          if (emotionLower === "happy") {
            if (isHighArousal) calculatedBehavior = "Excited Happy";
            else if (isMediumArousal) calculatedBehavior = "Happy";
            else calculatedBehavior = "Calm Happy";
          } else if (emotionLower === "angry") {
            if (isHighArousal) calculatedBehavior = "Highly Agitated Angry";
            else if (isMediumArousal) calculatedBehavior = "Angry";
            else calculatedBehavior = "Controlled Anger";
          } else if (emotionLower === "sad") {
            if (isHighArousal) calculatedBehavior = "Distressed";
            else if (isMediumArousal) calculatedBehavior = "Sad";
            else calculatedBehavior = "Low-energy Sad";
          } else if (emotionLower === "fear") {
            if (isHighArousal) calculatedBehavior = "Panicked";
            else if (isMediumArousal) calculatedBehavior = "Fear";
            else calculatedBehavior = "Nervous";
          } else if (emotionLower === "disgust") {
            if (isHighArousal) calculatedBehavior = "Strong Disgust";
            else if (isMediumArousal) calculatedBehavior = "Disgust";
            else calculatedBehavior = "Mild Disgust";
          } else if (emotionLower === "surprise") {
            if (isHighArousal) calculatedBehavior = "Strong Shock";
            else if (isMediumArousal) calculatedBehavior = "Surprise";
            else calculatedBehavior = "Mild Surprise";
          } else {
            if (isHighArousal) calculatedBehavior = "Hyperactive";
            else if (isMediumArousal) calculatedBehavior = "Neutral";
            else calculatedBehavior = "Calm Neutral";
          }
          
          setBehavior(calculatedBehavior);
          if (isHighArousal) setEngagementLevel("HIGH");
          else if (isMediumArousal) setEngagementLevel("MEDIUM");
          else setEngagementLevel("LOW");
          
          console.log(`[Emotion] ✅ Updated behavior in real-time: ${calculatedBehavior} (emotion=${result.predicted}, intensity=${handIntensity})`);
        }
      }
      
      if (result?.error) {
        console.warn(`[Emotion] ⚠️ Backend returned result with error (Python crash fallback):`, result.error?.substring(0, 100));
      }
    } catch (err) {
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("Python script failed") || errorMsg.includes("3221226505")) {
        console.warn("[Emotion] ⚠️ Python script crashed (non-blocking, session continues):", errorMsg.substring(0, 100));
      } else if (errorMsg.includes("Network request failed") || errorMsg.includes("timeout")) {
        console.warn("[Emotion] ⚠️ Network error (non-blocking, session continues):", errorMsg.substring(0, 100));
      } else {
        console.warn("[Emotion] ⚠️ Emotion prediction error (non-blocking):", err?.message?.substring(0, 100) || String(err).substring(0, 100));
      }
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

    let requestPromise = null;

    try {
      console.log(`[Hand] Capturing frames for hand analysis for session ${currentSessionId}`);
      
      const frames = [];
      const frameCount = 15;
      const fps = 5;
      const baseTimestamp = Date.now();
      
      // Capture frames - continue even if session ends during capture
      for (let i = 0; i < frameCount; i++) {
        // Check session status but continue capturing anyway
        const isActive = sessionActiveRef.current;
        if (!isActive && i > 0) {
          console.log(`[Hand] Session ended during capture, but continuing with ${frames.length} frames already captured`);
        }
        
        const frameUri = await captureFrame();
        if (frameUri) {
          frames.push({
            uri: frameUri,
            type: "image/jpeg",
            name: `hand_${baseTimestamp}_${String(i).padStart(4, '0')}.jpg`,
          });
        } else {
          console.warn(`[Hand] Frame ${i + 1} capture failed, continuing...`);
        }
        
        if (i < frameCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
        }
      }

      // VERY LENIENT: Accept even 1 frame - backend will use motion detection
      if (frames.length < 1) {
        console.warn(`[Hand] No frames captured (${frames.length})`);
        return;
      }
      
      // If we have at least 1 frame, send it - backend can use motion detection
      if (frames.length === 1) {
        console.log(`[Hand] Only 1 frame captured, but sending anyway (backend will use motion detection)`);
      }

      console.log(`[Hand] Sending ${frames.length} frames to backend`);
      
      // No timeout - allow hand analysis to take as long as needed
      requestPromise = uploadFiles(
        API_ENDPOINTS.ANALYZE_HAND,
        frames,
        { sessionId: currentSessionId, fps: fps },
        3,
        0 // 0 = no timeout
      );
      
      pendingHandRequestsRef.current.add(requestPromise);
      console.log(`[Hand] Added request to pending (${pendingHandRequestsRef.current.size} total pending)`);
      
      const result = await requestPromise;

      console.log(`[Hand] ✅ Backend response:`, result);
      
      if (result) {
        const newSpeed = result.hand_speed ?? null;
        const newIntensity = result.intensity ?? null;
        const newDetected = result.hands_detected ?? null;
        
        setHandSpeed(newSpeed);
        setHandIntensity(newIntensity);
        setHandsDetected(newDetected);
        setHandMessage(result.message || result.note || null);
        
        // If hands are detected and we have emotion data, calculate behavior in real-time
        if (newDetected === true && newSpeed !== null && newSpeed > 0 && finalEmotion) {
          // Calculate behavior using latest data
          const handLevel = newIntensity === "HIGH" ? 3 : newIntensity === "MEDIUM" ? 2 : 1;
          const isHighArousal = newIntensity === "HIGH" || handLevel >= 3;
          const isMediumArousal = newIntensity === "MEDIUM" || handLevel === 2;
          const isLowArousal = newIntensity === "LOW" || handLevel === 1;
          
          const emotionLower = finalEmotion.toLowerCase();
          let calculatedBehavior = "Neutral";
          
          if (emotionLower === "happy") {
            if (isHighArousal) calculatedBehavior = "Excited Happy";
            else if (isMediumArousal) calculatedBehavior = "Happy";
            else calculatedBehavior = "Calm Happy";
          } else if (emotionLower === "angry") {
            if (isHighArousal) calculatedBehavior = "Highly Agitated Angry";
            else if (isMediumArousal) calculatedBehavior = "Angry";
            else calculatedBehavior = "Controlled Anger";
          } else if (emotionLower === "sad") {
            if (isHighArousal) calculatedBehavior = "Distressed";
            else if (isMediumArousal) calculatedBehavior = "Sad";
            else calculatedBehavior = "Low-energy Sad";
          } else if (emotionLower === "fear") {
            if (isHighArousal) calculatedBehavior = "Panicked";
            else if (isMediumArousal) calculatedBehavior = "Fear";
            else calculatedBehavior = "Nervous";
          } else if (emotionLower === "disgust") {
            if (isHighArousal) calculatedBehavior = "Strong Disgust";
            else if (isMediumArousal) calculatedBehavior = "Disgust";
            else calculatedBehavior = "Mild Disgust";
          } else if (emotionLower === "surprise") {
            if (isHighArousal) calculatedBehavior = "Strong Shock";
            else if (isMediumArousal) calculatedBehavior = "Surprise";
            else calculatedBehavior = "Mild Surprise";
          } else {
            // neutral or unknown
            if (isHighArousal) calculatedBehavior = "Hyperactive";
            else if (isMediumArousal) calculatedBehavior = "Neutral";
            else calculatedBehavior = "Calm Neutral";
          }
          
          // Update behavior and engagement in real-time
          setBehavior(calculatedBehavior);
          if (isHighArousal) setEngagementLevel("HIGH");
          else if (isMediumArousal) setEngagementLevel("MEDIUM");
          else setEngagementLevel("LOW");
          
          console.log(`[Hand] ✅ Updated behavior in real-time: ${calculatedBehavior} (emotion=${finalEmotion}, intensity=${newIntensity})`);
        }
      }
    } catch (err) {
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("Network request failed") || errorMsg.includes("timeout")) {
        console.warn("[Hand] ⚠️ Hand analysis network error (non-blocking):", errorMsg.substring(0, 100));
      } else {
        console.warn("[Hand] ⚠️ Hand analysis error (non-blocking):", err);
      }
    } finally {
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
    if (isStartingSessionRef.current || sessionActive) {
      console.log("Session already starting or active, ignoring request");
      return;
    }

    try {
      isStartingSessionRef.current = true;

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
      setHandSpeed(null);
      setHandIntensity(null);
      setHandsDetected(null);
      setHandMessage(null);

      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;

      console.log(`[Session] Starting session ${newSessionId} with backend API`);
      
      // No timeout - allow start session to take as long as needed
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
        0 // 0 = no timeout
      );

      if (!startResponse.ok) {
        const errorData = await startResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to start session");
      }

      const startData = await startResponse.json();
      console.log(`[Session] ✅ Session started:`, startData);
      
      setSessionActive(true);
      sessionActiveRef.current = true;
      isStartingSessionRef.current = false;
      setLoading(false);

      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Session] Starting capture intervals for session ${newSessionId}`);
      
      emotionCaptureIntervalRef.current = setInterval(() => {
        try {
          sendEmotionPrediction();
        } catch (err) {
          console.error("Error in emotion capture interval:", err);
        }
      }, 2000);

      handCaptureIntervalRef.current = setInterval(() => {
        try {
          sendHandAnalysis();
        } catch (err) {
          console.error("Error in hand capture interval:", err);
        }
      }, 8000);
      
      setTimeout(() => {
        sendEmotionPrediction();
        sendHandAnalysis();
      }, 1000);
    } catch (err) {
      console.error("Start session error:", err);
      setError(err.message || "Failed to start session");
      setSessionActive(false);
      sessionActiveRef.current = false;
      sessionIdRef.current = null;
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
    sessionActiveRef.current = false;

    console.log(`[Session] Stopping capture intervals for session ${currentSessionId}`);
    
    if (emotionCaptureIntervalRef.current) {
      clearInterval(emotionCaptureIntervalRef.current);
      emotionCaptureIntervalRef.current = null;
    }
    if (handCaptureIntervalRef.current) {
      clearInterval(handCaptureIntervalRef.current);
      handCaptureIntervalRef.current = null;
    }

    try {
      const pendingRequests = Array.from(pendingHandRequestsRef.current);
      console.log(`[Session] Found ${pendingRequests.length} pending hand analysis request(s)`);
      
      if (pendingRequests.length > 0) {
        console.log(`[Session] Waiting for ${pendingRequests.length} pending hand analysis request(s) to complete...`);
        try {
          // No timeout - wait for all requests to complete naturally
          await Promise.allSettled(
            pendingRequests.map(p => 
              p.catch(err => {
                console.log(`[Session] Pending request failed:`, err?.message?.substring(0, 100));
                return null;
              })
            )
          );
          console.log(`[Session] ✅ All pending hand requests completed`);
        } catch (err) {
          console.warn(`[Session] ⚠️ Error waiting for pending requests:`, err);
        }
        // No delay - proceed immediately after requests complete
        console.log(`[Session] Proceeding to finalize session...`);
      } else {
        // No delay - proceed immediately
        console.log(`[Session] No pending hand requests tracked, proceeding to finalize...`);
      }
      
      console.log(`[Session] Clearing ${pendingHandRequestsRef.current.size} remaining pending hand request(s)`);
      pendingHandRequestsRef.current.clear();
      
      console.log(`[Session] Finalizing session ${currentSessionId} with backend API...`);
      
      // No timeout - allow finalize to take as long as needed
      const finalizeResponse = await apiCall(
        API_ENDPOINTS.FINALIZE_SESSION,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: currentSessionId }),
        },
        2,
        0 // 0 = no timeout
      );

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to finalize session");
      }

      const result = await finalizeResponse.json();
      console.log(`[Session] ✅ Final results from backend:`, result);
      
      if (!result.finalEmotion && !result.predicted) {
        throw new Error("Backend did not return emotion data");
      }
      if (!result.engagementLevel) {
        throw new Error("Backend did not return engagement level");
      }
      if (!result.summary) {
        throw new Error("Backend did not return summary");
      }
      
      // Get backend results
      let finalEmotion = result.finalEmotion || result.predicted;
      let engagementLevel = result.engagementLevel;
      let behavior = result.behavior || "Neutral";
      let behaviorConfidence = result.behaviorConfidence || 0.0;
      let summary = result.summary;
      
      // CRITICAL: Check if we have newer hand data in state (from real-time updates)
      // If hand data arrived after finalize was called, use it to recalculate behavior
      const latestHandSpeed = handSpeed;
      const latestHandIntensity = handIntensity;
      const latestHandsDetected = handsDetected;
      
      console.log(`[Session] Latest hand data from state: speed=${latestHandSpeed}, intensity=${latestHandIntensity}, detected=${latestHandsDetected}`);
      console.log(`[Session] Backend hand data: detected=${result.handSummary?.handsDetected}, speed=${result.handSummary?.avgSpeed}`);
      
      // If we have newer hand data in state, use it to recalculate behavior
      if (latestHandsDetected === true && latestHandSpeed !== null && latestHandSpeed > 0) {
        console.log(`[Session] Using latest hand data from state to recalculate behavior`);
        
        // Recalculate behavior using latest hand data
        // Map intensity to level
        let handLevel = 1;
        if (latestHandIntensity === "HIGH") handLevel = 3;
        else if (latestHandIntensity === "MEDIUM") handLevel = 2;
        else if (latestHandIntensity === "LOW") handLevel = 1;
        
        // Recalculate behavior using fuseEmotion logic
        const isHighArousal = latestHandIntensity === "HIGH" || handLevel >= 3;
        const isMediumArousal = latestHandIntensity === "MEDIUM" || handLevel === 2;
        const isLowArousal = latestHandIntensity === "LOW" || handLevel === 1;
        
        const emotionLower = finalEmotion.toLowerCase();
        if (emotionLower === "happy") {
          if (isHighArousal) behavior = "Excited Happy";
          else if (isMediumArousal) behavior = "Happy";
          else behavior = "Calm Happy";
        } else if (emotionLower === "angry") {
          if (isHighArousal) behavior = "Highly Agitated Angry";
          else if (isMediumArousal) behavior = "Angry";
          else behavior = "Controlled Anger";
        } else if (emotionLower === "sad") {
          if (isHighArousal) behavior = "Distressed";
          else if (isMediumArousal) behavior = "Sad";
          else behavior = "Low-energy Sad";
        } else if (emotionLower === "fear") {
          if (isHighArousal) behavior = "Panicked";
          else if (isMediumArousal) behavior = "Fear";
          else behavior = "Nervous";
        } else if (emotionLower === "disgust") {
          if (isHighArousal) behavior = "Strong Disgust";
          else if (isMediumArousal) behavior = "Disgust";
          else behavior = "Mild Disgust";
        } else if (emotionLower === "surprise") {
          if (isHighArousal) behavior = "Strong Shock";
          else if (isMediumArousal) behavior = "Surprise";
          else behavior = "Mild Surprise";
        } else {
          // neutral or unknown
          if (isHighArousal) behavior = "Hyperactive";
          else if (isMediumArousal) behavior = "Neutral";
          else behavior = "Calm Neutral";
        }
        
        // Update engagement level based on hand intensity
        if (isHighArousal) engagementLevel = "HIGH";
        else if (isMediumArousal) engagementLevel = "MEDIUM";
        else engagementLevel = "LOW";
        
        // Update summary with latest hand data
        summary = `Analyzed ${result.emotionDistribution ? Object.values(result.emotionDistribution).reduce((a, b) => a + b, 0) : 0} emotion samples and hand movement data. `;
        summary += `Behavior: ${behavior} (${(behaviorConfidence * 100).toFixed(1)}% confidence). `;
        summary += `Dominant emotion: ${finalEmotion} (${(result.emotionDistribution ? 70 : 0)}% avg confidence). `;
        summary += `Hand movement: ${latestHandSpeed.toFixed(1)} px/s average, ${latestHandIntensity} intensity. `;
        summary += `Engagement: ${engagementLevel}.`;
        
        console.log(`[Session] ✅ Recalculated behavior using latest hand data: ${behavior}, engagement: ${engagementLevel}`);
      } else if (latestHandsDetected === false || latestHandSpeed === 0) {
        // Hands not detected in latest state either
        behavior = "Cannot detect";
        behaviorConfidence = 0.0;
        console.log(`[Session] Hands not detected in latest state, behavior set to "Cannot detect"`);
      }
      
      // DON'T show popup - update state and let the page display it
      setBehavior(behavior);
      setBehaviorConfidence(behaviorConfidence);
      setFinalEmotion(finalEmotion);
      setEngagementLevel(engagementLevel);
      setSummary(summary);
      // Removed setSummaryVisible(true) - no popup, show on page
      
      console.log(`[Session] Final results: Behavior=${behavior}, Emotion=${finalEmotion}, Engagement=${engagementLevel}, HandSpeed=${latestHandSpeed}`);

      // Save emotion session to Firebase
      if (childId && parentId && currentSessionId) {
        try {
          const handSummary = {
            handsDetected: latestHandsDetected || result.handSummary?.handsDetected || false,
            avgSpeed: latestHandSpeed || result.handSummary?.avgSpeed || 0,
            intensity: latestHandIntensity || result.handSummary?.intensity || 'LOW',
            avgLevel: latestHandIntensity === "HIGH" ? 3 : (latestHandIntensity === "MEDIUM" ? 2 : 1),
          };

          await saveStoryEmotionSession({
            sessionId: currentSessionId,
            storyId: story?.id || null,
            storyTitle: story?.title || 'Unknown Story',
            childId,
            parentId,
            behavior,
            behaviorConfidence,
            finalEmotion,
            engagementLevel,
            emotionDistribution: result.emotionDistribution || {},
            handSummary,
            duration: seconds, // Session duration in seconds
          });
          console.log('✅ Story emotion session saved to Firebase');
        } catch (saveError) {
          console.warn('⚠️ Failed to save story emotion session to Firebase:', saveError);
          // Don't throw - this is non-critical
        }
      }
    } catch (err) {
      console.error("Finalize session error:", err);
      setError(err.message || "Failed to get session results from backend");
      setBehavior(null);
      setBehaviorConfidence(null);
      setFinalEmotion(null);
      setEngagementLevel(null);
      setSummary(null);
      // Removed setSummaryVisible(true) - no popup, show on page
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
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtnCircle}
            >
              <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.emptyStateCard}>
              <Text style={styles.storyTitle}>Story not found</Text>
              <Text style={styles.emptyStateSub}>Story ID: {storyId}</Text>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
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
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtnCircle}
          >
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
            <View style={styles.difficultyTag}>
              <Text style={styles.difficultyText}>{story.level}</Text>
            </View>
            <TouchableOpacity onPress={onToggleCamera} style={styles.hideCamBtnOverlay}>
              <Text style={styles.hideCamBtnText}>{cameraOn ? "Hide cam" : "Show cam"}</Text>
            </TouchableOpacity>
          </View>

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

        {!cameraOn && (
          <TouchableOpacity onPress={onToggleCamera} style={styles.showCamBtn}>
            <Text style={styles.showCamBtnText}>Show Camera</Text>
          </TouchableOpacity>
        )}

        <View style={styles.storyTextBox}>
          <Text style={styles.storyText}>{story.storyText}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} numberOfLines={10}>
              {error}
            </Text>
          </View>
        )}

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

        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Session Output</Text>
          
          {/* ALWAYS calculate behavior from latest state data (handSpeed, handIntensity, finalEmotion) */}
          {(() => {
            // Calculate behavior in real-time from latest state
            let calculatedBehavior = behavior;
            let calculatedEngagement = engagementLevel;
            let calculatedEmotion = finalEmotion;
            
            // CRITICAL: If we have hand speed > 0, hands ARE detected (regardless of flag)
            const handsActuallyDetected = (handSpeed !== null && handSpeed > 0) || handsDetected === true;
            
            // If we have both emotion and hand data, calculate behavior
            if (calculatedEmotion && handsActuallyDetected && handSpeed !== null && handSpeed > 0) {
              const handLevel = handIntensity === "HIGH" ? 3 : handIntensity === "MEDIUM" ? 2 : 1;
              const isHighArousal = handIntensity === "HIGH" || handLevel >= 3;
              const isMediumArousal = handIntensity === "MEDIUM" || handLevel === 2;
              
              const emotionLower = calculatedEmotion.toLowerCase();
              
              if (emotionLower === "happy") {
                calculatedBehavior = isHighArousal ? "Excited Happy" : isMediumArousal ? "Happy" : "Calm Happy";
              } else if (emotionLower === "angry") {
                calculatedBehavior = isHighArousal ? "Highly Agitated Angry" : isMediumArousal ? "Angry" : "Controlled Anger";
              } else if (emotionLower === "sad") {
                calculatedBehavior = isHighArousal ? "Distressed" : isMediumArousal ? "Sad" : "Low-energy Sad";
              } else if (emotionLower === "fear") {
                calculatedBehavior = isHighArousal ? "Panicked" : isMediumArousal ? "Fear" : "Nervous";
              } else if (emotionLower === "disgust") {
                calculatedBehavior = isHighArousal ? "Strong Disgust" : isMediumArousal ? "Disgust" : "Mild Disgust";
              } else if (emotionLower === "surprise") {
                calculatedBehavior = isHighArousal ? "Strong Shock" : isMediumArousal ? "Surprise" : "Mild Surprise";
              } else {
                calculatedBehavior = isHighArousal ? "Hyperactive" : isMediumArousal ? "Neutral" : "Calm Neutral";
              }
              
              calculatedEngagement = isHighArousal ? "HIGH" : isMediumArousal ? "MEDIUM" : "LOW";
            } else if (!calculatedEmotion || !handsActuallyDetected) {
              calculatedBehavior = "Cannot detect";
              calculatedEngagement = "LOW";
            }
            
            return (
              <>
                {calculatedBehavior && calculatedBehavior !== "Cannot detect" && (
                  <View style={styles.behaviorContainerCard}>
                    <Text style={styles.behaviorLabelCard}>Behavior</Text>
                    <Text style={styles.behaviorValueCard}>{calculatedBehavior}</Text>
                  </View>
                )}
                
                {calculatedBehavior === "Cannot detect" && (
                  <View style={styles.behaviorContainerCard}>
                    <Text style={styles.behaviorLabelCard}>Behavior</Text>
                    <Text style={styles.behaviorValueCard}>Cannot detect</Text>
                  </View>
                )}
                
                <Text style={styles.outputLabel}>
                  Final Emotion - <Text style={styles.outputValueYellow}>{calculatedEmotion ?? "—"}</Text>
                </Text>
                <Text style={styles.outputLabel}>
                  Engagement Level - <Text style={styles.outputValueBlue}>{calculatedEngagement ?? "—"}</Text>
                </Text>
                
                {/* Show summary with actual visible data */}
                {calculatedEmotion && handsActuallyDetected && handSpeed !== null && handSpeed > 0 ? (
                  <Text style={styles.outputSummary} numberOfLines={5}>
                    Behavior: {calculatedBehavior}. Dominant emotion: {calculatedEmotion}. Hand movement: {handSpeed.toFixed(1)} px/s ({handIntensity || "LOW"} intensity). Engagement: {calculatedEngagement}.
                  </Text>
                ) : calculatedEmotion && !handsActuallyDetected ? (
                  <Text style={styles.outputSummary} numberOfLines={5}>
                    Behavior: {calculatedBehavior}. Dominant emotion: {calculatedEmotion}. Hand movement: No hands detected. Engagement: {calculatedEngagement}.
                  </Text>
                ) : !calculatedEmotion && handsActuallyDetected && handSpeed !== null && handSpeed > 0 ? (
                  <Text style={styles.outputSummary} numberOfLines={5}>
                    Behavior: {calculatedBehavior}. Emotion: Not detected. Hand movement: {handSpeed.toFixed(1)} px/s ({handIntensity || "LOW"} intensity). Engagement: {calculatedEngagement}.
                  </Text>
                ) : (
                  <Text style={styles.outputPlaceholder}>
                    Start a session to begin capturing and analyzing engagement data.
                  </Text>
                )}
              </>
            );
          })()}
        </View>

        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Hand Movement Speed</Text>
          
          {sessionActive || handsDetected !== null ? (
            <>
              {/* Use handSpeed > 0 as the primary indicator of hands detected */}
              {(handSpeed === null || handSpeed === 0) && (handsDetected === false || handsDetected === null) ? (
                <View style={styles.handStatusContainer}>
                  <Text style={[styles.outputLabel, { color: "#FF6B6B" }]}>
                    ⚠️ No hands detected
                  </Text>
                  {handMessage && (
                    <Text style={styles.handMessage}>{handMessage}</Text>
                  )}
                </View>
              ) : (handSpeed !== null && handSpeed > 0) || handsDetected === true ? (
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

        {cameraOn && <View style={{ height: 180 }} />}
      </ScrollView>
      </SafeAreaView>

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
              />
            </View>
          )}
          <TouchableOpacity onPress={onToggleCamera} style={styles.camCloseBtn}>
            <Text style={styles.camCloseBtnText}>Hide cam</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* REMOVED POPUP MODAL - All results shown on page in real-time */}
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
    color: "#DC3545",
  },
  outputValueMedium: {
    color: "#FFC107",
  },
  outputValueLow: {
    color: "#28A745",
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
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: { width: "85%", backgroundColor: "#fff", padding: 20, borderRadius: 14 },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10, color: "#212121" },
  modalText: { marginBottom: 6, fontWeight: "700", color: "#333" },
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#07BDD6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
  behaviorContainer: {
    backgroundColor: "#E3F2FD",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    marginTop: 10,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#0A7EA4",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  behaviorLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A7EA4",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  behaviorValue: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0A7EA4",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
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
});
