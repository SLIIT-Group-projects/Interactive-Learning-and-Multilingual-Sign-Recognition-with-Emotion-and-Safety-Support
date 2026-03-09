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
  Platform,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  API_ENDPOINTS,
  uploadFile,
  uploadFiles,
  apiCall,
  BASE_URL,
} from "../../../config/api";

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
    if (!sessionActiveRef.current) {
      console.warn("[Capture] Session not active");
      return null;
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

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Camera capture timeout")), 2000)
      );

      const photo = await Promise.race([photoPromise, timeoutPromise]);

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
      
      for (let i = 0; i < frameCount; i++) {
        const frameUri = await captureFrame();
        if (frameUri) {
          frames.push({
            uri: frameUri,
            type: "image/jpeg",
            name: `hand_${baseTimestamp}_${String(i).padStart(4, '0')}.jpg`,
          });
        }
        if (i < frameCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
        }
      }

      if (frames.length < 2) {
        console.warn(`[Hand] Not enough frames captured (${frames.length}), need at least 2`);
        return;
      }

      console.log(`[Hand] Sending ${frames.length} frames to backend`);
      
      requestPromise = uploadFiles(
        API_ENDPOINTS.ANALYZE_HAND,
        frames,
        { sessionId: currentSessionId, fps: fps },
        3,
        120000
      );
      
      pendingHandRequestsRef.current.add(requestPromise);
      console.log(`[Hand] Added request to pending (${pendingHandRequestsRef.current.size} total pending)`);
      
      const result = await requestPromise;

      console.log(`[Hand] ✅ Backend response:`, result);
      
      if (result) {
        setHandSpeed(result.hand_speed ?? null);
        setHandIntensity(result.intensity ?? null);
        setHandsDetected(result.hands_detected ?? null);
        setHandMessage(result.message || result.note || null);
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
          await Promise.allSettled(
            pendingRequests.map(p => 
              Promise.race([
                p.catch(err => {
                  console.log(`[Session] Pending request failed:`, err?.message?.substring(0, 100));
                  return null;
                }),
                new Promise((resolve) => 
                  setTimeout(() => {
                    console.log(`[Session] Pending request timeout (30s)`);
                    resolve(null);
                  }, 30000)
                )
              ])
            )
          );
          console.log(`[Session] ✅ All pending hand requests completed (or timed out)`);
        } catch (err) {
          console.warn(`[Session] ⚠️ Error waiting for pending requests:`, err);
        }
        console.log(`[Session] Waiting 5 seconds for backend to process and store all hand data...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log(`[Session] No pending hand requests tracked, waiting 8 seconds for any in-flight requests to complete...`);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      
      console.log(`[Session] Clearing ${pendingHandRequestsRef.current.size} remaining pending hand request(s)`);
      pendingHandRequestsRef.current.clear();
      
      console.log(`[Session] Finalizing session ${currentSessionId} with backend API...`);
      
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
        60000
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
      
      const finalEmotion = result.finalEmotion || result.predicted;
      const engagementLevel = result.engagementLevel;
      const behavior = result.behavior || "Neutral";
      const behaviorConfidence = result.behaviorConfidence || 0.0;
      const summary = result.summary;
      
      setBehavior(behavior);
      setBehaviorConfidence(behaviorConfidence);
      setFinalEmotion(finalEmotion);
      setEngagementLevel(engagementLevel);
      setSummary(summary);
      setSummaryVisible(true);
      
      console.log(`[Session] Results from backend: Behavior=${behavior}, Emotion=${finalEmotion}, Engagement=${engagementLevel}`);
    } catch (err) {
      console.error("Finalize session error:", err);
      setError(err.message || "Failed to get session results from backend");
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
      <Text style={[styles.camHint, { color: "#FF4AB3" }]}>
        Camera permission needed
      </Text>
    );
  };

  if (!story) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Story not found.</Text>
          <Text style={{ marginTop: 8, color: "#666" }}>
            Story ID: {storyId}
          </Text>
          <TouchableOpacity style={styles.startSessionBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.startSessionBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="chevron-left" size={28} color="#212121" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Story page</Text>
        <TouchableOpacity style={styles.profileBtn}>
          <View style={styles.profileIcon}>
            <MaterialIcons name="person" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Section with Story Image */}
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
            style={styles.startSessionBtn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startSessionBtnText}>
                {sessionActive ? "Finish Session" : "Start Reading Session"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={[styles.statusBtn, sessionActive && styles.statusBtnActive]}>
            <Text style={styles.statusBtnText}>
              {sessionActive ? `Active(${formatSeconds(seconds)})` : "Inactive"}
            </Text>
          </View>
        </View>

        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Session Output</Text>
          
          {behavior || finalEmotion || engagementLevel ? (
            <>
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

        {cameraOn && <View style={{ height: 180 }} />}
      </ScrollView>

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
    </SafeAreaView>
  );
}

// Copy styles from app/story/[id].tsx
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F0F8FF" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000000",
  },
  profileBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0A7EA4",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 200,
  },
  heroSection: {
    marginBottom: 20,
  },
  heroImageContainer: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
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
    fontWeight: "700",
    color: "#212121",
  },
  hideCamBtnOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#0A7EA4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hideCamBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  showCamBtn: {
    backgroundColor: "#0A7EA4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  showCamBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  storyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#212121",
    marginBottom: 8,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeBadge: {
    backgroundColor: "#FFF9E6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0A7EA4",
  },
  storyTextBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0A7EA4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  storyText: {
    fontSize: 17,
    lineHeight: 28,
    color: "#212121",
    fontFamily: Platform.select({
      ios: "Georgia",
      android: "serif",
      default: "Georgia, serif",
    }),
    letterSpacing: 0.3,
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
  startSessionBtn: {
    flex: 1,
    backgroundColor: "#0A7EA4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  startSessionBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  statusBtn: {
    backgroundColor: "#FFD700",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBtnActive: {
    backgroundColor: "#FFD700",
  },
  statusBtnText: {
    color: "#212121",
    fontSize: 14,
    fontWeight: "800",
  },
  outputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  outputCardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#212121",
    marginBottom: 12,
  },
  outputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#212121",
    marginBottom: 8,
  },
  outputValueYellow: {
    color: "#FF8C00",
    fontWeight: "900",
  },
  outputValueBlue: {
    color: "#0A7EA4",
    fontWeight: "900",
  },
  outputSummary: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
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
    width: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  camHint: {
    fontSize: 12,
    fontWeight: "900",
    color: "#212121",
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
    backgroundColor: "#0A7EA4",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  camPermissionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  camCloseBtn: {
    backgroundColor: "#0A7EA4",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  camCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
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
    backgroundColor: "#E3F2FD",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#0A7EA4",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  behaviorLabelCard: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0A7EA4",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  behaviorValueCard: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0A7EA4",
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
});
