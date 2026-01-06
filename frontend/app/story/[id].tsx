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
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
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

  // Results
  const [finalEmotion, setFinalEmotion] = useState<string | null>(null);
  const [engagementLevel, setEngagementLevel] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Capture frame from camera
  const captureFrame = async (): Promise<string | null> => {
    // Check all prerequisites before attempting capture
    if (!cameraRef.current || !permission?.granted || isCapturingRef.current || !cameraOn || !sessionActive) {
      return null;
    }

    try {
      isCapturingRef.current = true;
      // CameraView uses takePictureAsync method - check if it exists
      const camera = cameraRef.current as any;
      if (!camera || typeof camera.takePictureAsync !== 'function') {
        console.warn("Camera takePictureAsync not available");
        return null;
      }

      // Add timeout to prevent hanging
      const photoPromise = camera.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: false,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Camera capture timeout")), 5000)
      );

      const photo = await Promise.race([photoPromise, timeoutPromise]) as any;

      if (!photo?.uri) {
        return null;
      }

      // Return photo URI directly (backend can handle resizing if needed)
      return photo.uri;
    } catch (err: any) {
      console.error("Frame capture error:", err);
      // Don't throw - just return null to prevent crashes
      return null;
    } finally {
      isCapturingRef.current = false;
    }
  };

  // Send emotion prediction (every 1 second)
  const sendEmotionPrediction = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Emotion] Skipping - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      console.log(`[Emotion] Capturing frame for session ${currentSessionId}`);
      const frameUri = await captureFrame();
      if (!frameUri) {
        console.warn("[Emotion] Frame capture returned null");
        return;
      }

      console.log(`[Emotion] Uploading frame to backend...`);
      const result = await uploadFile(
        API_ENDPOINTS.PREDICT_EMOTION,
        {
          uri: frameUri,
          type: "image/jpeg",
          name: "emotion_frame.jpg",
        },
        { sessionId: currentSessionId }
      );
      console.log(`[Emotion] Emotion prediction result:`, result);
    } catch (err: any) {
      console.error("[Emotion] Emotion prediction error:", err);
      // Only set error if it's a critical issue, not for every failed frame
      if (err.message?.includes("Network request failed") || err.message?.includes("Cannot connect")) {
        setError(err.message);
      }
    }
  };

  // Send hand analysis (every 5 seconds, 10 frames)
  const sendHandAnalysis = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Hand] Skipping hand analysis - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      console.log(`[Hand] Starting hand analysis capture for session ${currentSessionId}`);
      // Capture 10 frames quickly
      const frames: Array<{ uri: string; type: string; name: string }> = [];
      const capturePromises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        capturePromises.push(
          captureFrame().then((uri) => {
            if (uri) {
              frames.push({
                uri,
                type: "image/jpeg",
                name: `hand_frame_${i}.jpg`,
              });
              console.log(`[Hand] Captured frame ${i + 1}/10`);
            } else {
              console.warn(`[Hand] Frame ${i + 1}/10 capture returned null`);
            }
          }).catch((err) => {
            console.error(`[Hand] Error capturing hand frame ${i + 1}:`, err);
          })
        );
      }

      await Promise.all(capturePromises);

      console.log(`[Hand] Captured ${frames.length}/10 frames successfully`);
      
      if (frames.length === 0) {
        console.warn("[Hand] No frames captured, skipping upload");
        return;
      }

      // Estimate FPS: 10 frames captured quickly, assume ~10fps
      const fps = 10;
      console.log(`[Hand] Uploading ${frames.length} frames to backend...`);
      const result = await uploadFiles(
        API_ENDPOINTS.ANALYZE_HAND,
        frames,
        { sessionId: currentSessionId, fps: String(fps) }
      );
      console.log(`[Hand] Hand analysis result:`, result);
    } catch (err: any) {
      console.error("[Hand] Hand analysis error:", err);
      // Only set error if it's a critical issue
      if (err.message?.includes("Network request failed") || err.message?.includes("Cannot connect")) {
        setError(err.message);
      }
    }
  };

  // Start session
  const startSession = async () => {
    // Prevent multiple simultaneous calls
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

      // First, check if backend is reachable with a health check
      // Skip health check for now to avoid double requests - go straight to start session
      // The start session will handle errors appropriately

      // Generate session ID
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId; // Update ref immediately

      // Start session on backend - use longer timeout for initial connection
      let response;
      try {
        response = await apiCall(
          API_ENDPOINTS.START_SESSION,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: newSessionId }),
          },
          2, // Retries
          15000 // 15 second timeout
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(`Failed to start session: ${errorText}`);
        }
      } catch (apiErr: any) {
        console.error("API call error:", apiErr);
        
        // Provide user-friendly error messages
        let errorMessage = apiErr.message || "Failed to start session";
        
        if (apiErr.message?.includes("Aborted") || apiErr.message?.includes("timed out") || apiErr.name === "AbortError") {
          errorMessage = `Connection timeout. Please check:\n1. Backend is running on port 5000\n2. Server URL is correct: ${BASE_URL}\n3. For real devices, use your laptop's IP address`;
        } else if (apiErr.message?.includes("Network request failed") || apiErr.message?.includes("fetch") || apiErr.message?.includes("Cannot connect")) {
          errorMessage = `Cannot connect to backend at ${BASE_URL}.\n\nPlease ensure:\n1. Backend is running: 'npm run dev' in backend folder\n2. For real devices, update BASE_URL in config/api.ts`;
        }
        
        setError(errorMessage);
        setLoading(false);
        isStartingSessionRef.current = false;
        return; // Exit early on error
      }

      setSessionActive(true);
      sessionActiveRef.current = true; // Update ref immediately
      isStartingSessionRef.current = false;

      // Wait a bit for camera to be ready before starting captures
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Session] Starting capture intervals for session ${newSessionId}`);
      
      // Start emotion capture (every 1 second) - wrap in try-catch to prevent crashes
      emotionCaptureIntervalRef.current = setInterval(() => {
        try {
          sendEmotionPrediction();
        } catch (err) {
          console.error("Error in emotion capture interval:", err);
        }
      }, 1000);

      // Start hand capture (every 5 seconds) - wrap in try-catch to prevent crashes
      handCaptureIntervalRef.current = setInterval(() => {
        try {
          sendHandAnalysis();
        } catch (err) {
          console.error("Error in hand capture interval:", err);
        }
      }, 5000);
      
      // Trigger first captures immediately (don't wait for first interval)
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
    } finally {
      setLoading(false);
      isStartingSessionRef.current = false;
    }
  };

  // Finish session
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
      console.log(`[Session] Finalizing session ${currentSessionId} on backend...`);
      // Finalize session on backend
      const response = await apiCall(API_ENDPOINTS.FINALIZE_SESSION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });

      if (!response.ok) {
        throw new Error("Failed to finalize session");
      }

      const result = await response.json();
      setFinalEmotion(result.finalEmotion || null);
      setEngagementLevel(result.engagementLevel || null);
      setSummary(result.summary || null);
      setSummaryVisible(true);
    } catch (err: any) {
      console.error("Finalize session error:", err);
      setError(err.message || "Failed to finalize session");
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
          <Text style={{ fontSize: 18, fontWeight: "700" }}>No stories found.</Text>
          <Text style={{ marginTop: 8, color: "#666" }}>
            Check your STORIES import path and data file.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={styles.hero}>
            <View style={[styles.heroThumb, { backgroundColor: story.coverColor }]}>
              <Text style={styles.heroEmoji}>{story.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {story.title}
              </Text>
              <Text style={styles.headerSubSmall}>
                {story.level} • {story.timeMin} min
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={onToggleCamera} style={styles.camToggle}>
          <Text style={styles.camToggleText}>{cameraOn ? "Hide Cam" : "Show Cam"}</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.storyTextLarge}>{story.storyText}</Text>
          {!!story.moral && <Text style={styles.moral}>Moral: {story.moral}</Text>}

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
              style={[styles.primaryBtn, sessionActive && styles.finishBtn]}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {sessionActive ? "Finish Session" : "Start Reading Session"}
                </Text>
              )}
            </TouchableOpacity>

            <View style={[styles.pill, sessionActive && styles.pillActive]}>
              <Text style={styles.pillText}>
                {sessionActive ? `Active (${formatSeconds(seconds)})` : "Inactive"}
              </Text>
            </View>
          </View>

          {/* Session Output Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Session Output (From Backend)</Text>

            <Text style={styles.kvText}>
              Final Emotion:{" "}
              <Text style={styles.kvStrong}>{finalEmotion ?? "—"}</Text>
            </Text>

            <Text style={styles.kvText}>
              Engagement Level:{" "}
              <Text style={styles.kvStrong}>{engagementLevel ?? "—"}</Text>
            </Text>

            {summary && (
              <Text style={styles.note} numberOfLines={5}>
                {summary}
              </Text>
            )}

            {!sessionActive && !finalEmotion && (
              <Text style={styles.note}>
                Start a session to begin capturing and analyzing engagement data.
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Camera Overlay */}
        {cameraOn && (
          <View style={styles.camBox}>
            <CamStatus />

            {!permission?.granted ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { paddingVertical: 8, paddingHorizontal: 10 }]}
                onPress={ensureCameraPermission}
              >
                <Text style={styles.primaryBtnText}>Allow Camera</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.camPreview}>
                <CameraView
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing="front"
                  mode="picture"
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Summary Modal */}
      <Modal visible={summaryVisible} animationType="slide" transparent>
        <View style={styles.modalBackground}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Session Summary</Text>
            <Text style={styles.modalText}>Story: {story.title}</Text>
            <Text style={styles.modalText}>Duration: {formatSeconds(seconds)}</Text>
            <Text style={styles.modalText}>Final Emotion: {finalEmotion ?? "—"}</Text>
            <Text style={styles.modalText}>Engagement: {engagementLevel ?? "—"}</Text>
            {summary && (
              <Text style={[styles.modalText, { marginTop: 10, fontSize: 12 }]}>
                {summary}
              </Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7FEFF" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 0.5,
    borderColor: "#EAEAEA",
    backgroundColor: "#FFFFFF",
  },
  backBtn: { paddingVertical: 8, paddingHorizontal: 10, marginRight: 8 },
  backText: { color: "#07BDD6", fontWeight: "800" },

  headerTitle: { fontSize: 18, fontWeight: "900", color: "#212121" },
  headerSub: { marginTop: 2, fontSize: 12, color: "#666" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  heroThumb: {
    width: 84,
    height: 84,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: { fontSize: 40 },
  headerSubSmall: { color: "#666", fontSize: 12, marginTop: 6 },

  camToggle: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#E6F9FC",
    marginLeft: 10,
  },
  camToggleText: { fontWeight: "800", color: "#07BDD6" },

  content: { padding: 16, paddingBottom: 220 },

  storyText: { fontSize: 18, lineHeight: 28, color: "#212121" },
  storyTextLarge: { fontSize: 20, lineHeight: 30, color: "#212121" },
  moral: { marginTop: 12, fontWeight: "800", color: "#444" },

  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  errorText: { color: "#C62828", fontWeight: "600" },

  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    flexWrap: "wrap",
  },
  primaryBtn: {
    backgroundColor: "#07BDD6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 150,
    alignItems: "center",
  },
  finishBtn: { backgroundColor: "#FF4AB3" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900" },

  pill: {
    marginLeft: 10,
    marginTop: 10,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillActive: { backgroundColor: "#D1EC3F" },
  pillText: { fontWeight: "800", color: "#212121" },

  card: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#212121", marginBottom: 10 },

  kvText: { marginTop: 6, color: "#333", fontWeight: "800" },
  kvStrong: { color: "#07BDD6", fontWeight: "900" },

  note: { marginTop: 10, color: "#666", lineHeight: 20, fontWeight: "600" },

  camBox: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 150,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  camHint: { fontSize: 12, fontWeight: "900", color: "#07BDD6", marginBottom: 8 },
  camPreview: {
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EAEAEA",
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
});
