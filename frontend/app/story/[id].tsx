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
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
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
        skipProcessing: false, // Keep processing for better image quality
        shutterSound: false, // CRITICAL: Disable shutter sound completely
        // This only captures the camera view, not the whole screen
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
          captureFrame().then(async (uri) => {
            if (uri) {
              // Keep data URI as-is - uploadFiles will convert to Blob
              frames.push({
                uri: uri,
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
          <TouchableOpacity style={styles.startSessionBtn} onPress={() => router.back()}>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Story page</Text>
        <TouchableOpacity style={styles.profileBtn}>
          <View style={styles.profileIcon} />
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

        {/* Session Output Card */}
        <View style={styles.outputCard}>
          <Text style={styles.outputCardTitle}>Session Output</Text>
          
          {finalEmotion || engagementLevel ? (
            <>
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

        {/* Spacer for camera overlay */}
        {cameraOn && <View style={{ height: 180 }} />}
      </ScrollView>

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
                animateShutter={false}
                flash="off"
                // animateShutter: false prevents screen flash during capture
                // flash: 'off' ensures no flash light is used
                // shutterSound: false in takePictureAsync prevents sounds
                // Only captures the camera preview frame silently without any visual/audio feedback
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
  safe: { flex: 1, backgroundColor: "#F0F8FF" }, // Light blue background

  // Header
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
  backIcon: {
    fontSize: 24,
    color: "#000000",
    fontWeight: "700",
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
  },

  // Content
  content: {
    padding: 16,
    paddingBottom: 200,
  },

  // Hero Section
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

  // Story Text Box
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
      ios: "Georgia", // Elegant serif font perfect for stories on iOS
      android: "serif", // Elegant serif on Android (Roboto Serif or Noto Serif)
      default: "Georgia, serif",
    }),
    letterSpacing: 0.3,
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
    backgroundColor: "#FFD700", // Yellow
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBtnActive: {
    backgroundColor: "#FFD700", // Yellow when active
  },
  statusBtnText: {
    color: "#212121",
    fontSize: 14,
    fontWeight: "800",
  },

  // Session Output Card
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

  // Camera Overlay
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
});
