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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
        console.error("[Emotion] ❌ Failed to capture frame - check camera permissions and state");
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
    } catch (err: any) {
      console.error("[Emotion] Emotion prediction error:", err);
      // Don't block the session on individual frame errors
    }
  };

  // Record video using MediaRecorder API (web) or expo-camera (native)
  const recordVideoForHandAnalysis = async (duration: number = 2000): Promise<string | null> => {
    if (Platform.OS === 'web') {
      // Web: Use MediaRecorder API
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false 
        });
        
        const chunks: Blob[] = [];
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8'
        });
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        return new Promise((resolve, reject) => {
          mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            console.log(`[Hand] Video recorded (web): ${blob.size} bytes`);
            resolve(url);
          };
          
          mediaRecorder.onerror = (error) => {
            stream.getTracks().forEach(track => track.stop());
            reject(error);
          };
          
          mediaRecorder.start();
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          }, duration);
        });
      } catch (err: any) {
        console.warn(`[Hand] MediaRecorder failed: ${err.message}`);
        return null;
      }
    } else {
      // Native: Use expo-camera
      if (cameraRef.current && permission?.granted && cameraOn) {
        try {
          const camera = cameraRef.current as any;
          if (camera.recordAsync) {
            const video = await camera.recordAsync({
              maxDuration: duration / 1000,
              quality: '720p',
              mute: true,
            });
            return video?.uri || null;
          }
        } catch (err: any) {
          console.warn(`[Hand] Native video recording failed: ${err.message}`);
        }
      }
      return null;
    }
  };

  // Send hand analysis to backend - using high-frequency frame capture for accurate speed detection
  const sendHandAnalysis = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Hand] Skipping hand analysis - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      console.log(`[Hand] Starting high-frequency frame capture for session ${currentSessionId}`);
      
      // Use frame-based capture as PRIMARY method (more reliable than video)
      // Capture at high frequency for accurate speed detection
      const frames: Array<{ uri: string; type: string; name: string }> = [];
      const frameCount = 30; // More frames for better speed detection
      const targetFps = 20; // Higher FPS for more accurate speed calculation
      const frameInterval = 1000 / targetFps; // ~50ms between frames
      
      const startTime = Date.now();
      
      console.log(`[Hand] Capturing ${frameCount} frames at target FPS: ${targetFps}`);
      
      for (let i = 0; i < frameCount; i++) {
        const frameStartTime = Date.now();
        const frameUri = await captureFrame();
        
        if (frameUri) {
          frames.push({
            uri: frameUri,
            type: "image/jpeg",
            name: `hand_${Date.now()}_${i}.jpg`,
          });
        }
        
        // Precise timing: maintain consistent frame rate
        if (i < frameCount - 1) {
          const elapsed = Date.now() - frameStartTime;
          const waitTime = Math.max(0, frameInterval - elapsed);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
      
      const actualDuration = Date.now() - startTime;
      const actualFps = frames.length > 0 ? (frames.length / actualDuration) * 1000 : 0;
      
      console.log(`[Hand] Captured ${frames.length} frames in ${actualDuration}ms (actual FPS: ${actualFps.toFixed(2)})`);

      if (frames.length < 5) {
        console.warn(`[Hand] Not enough frames captured (${frames.length}), need at least 5`);
        return;
      }

      console.log(`[Hand] Sending ${frames.length} frames to backend with FPS: ${actualFps.toFixed(2)}`);
      
      const result = await uploadFiles(
        API_ENDPOINTS.ANALYZE_HAND,
        frames,
        { sessionId: currentSessionId, fps: actualFps.toFixed(2) }
      );

      console.log(`[Hand] ✅ Backend response:`, result);
    } catch (err: any) {
      console.error("[Hand] Hand analysis error:", err);
      // Don't block the session on individual analysis errors
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

      // Generate session ID
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId; // Update ref immediately

      console.log(`[Session] Starting session ${newSessionId} with backend API`);
      
      // Call backend to start session
      const startResponse = await apiCall(
        API_ENDPOINTS.START_SESSION,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: newSessionId }),
        }
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
      console.log(`[Session] Finalizing session ${currentSessionId} with backend API...`);
      
      // Call backend to finalize session and get results
      const finalizeResponse = await apiCall(
        API_ENDPOINTS.FINALIZE_SESSION,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: currentSessionId }),
        }
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
      const summary = result.summary;
      
      // Set results from backend
      setFinalEmotion(finalEmotion);
      setEngagementLevel(engagementLevel);
      setSummary(summary);
      setSummaryVisible(true);
      
      console.log(`[Session] Results from backend: Emotion=${finalEmotion}, Engagement=${engagementLevel}`);
    } catch (err: any) {
      console.error("Finalize session error:", err);
      setError(err.message || "Failed to get session results from backend");
      // NO FALLBACK DATA - show error instead
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
  profileIconText: {
    fontSize: 18,
    color: "#FFFFFF",
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
