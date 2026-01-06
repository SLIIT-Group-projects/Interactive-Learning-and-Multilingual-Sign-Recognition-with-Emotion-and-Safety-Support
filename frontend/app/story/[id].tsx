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

  // Send emotion prediction (MOCKED - no API calls)
  const sendEmotionPrediction = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Emotion] Skipping - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      // MOCK MODE: Simulate emotion detection without API calls
      // This prevents crashes and allows frontend demo
      console.log(`[Emotion] Mock mode - simulating emotion detection for session ${currentSessionId}`);
      
      // Simulate frame capture (optional - can skip actual camera capture too)
      // const frameUri = await captureFrame();
      
      // Simulate emotion prediction with realistic data
      const mockEmotions = ['Happy', 'Neutral', 'Excited', 'Calm', 'Focused'];
      const mockIntensities = ['Low', 'Medium', 'High'];
      const randomEmotion = mockEmotions[Math.floor(Math.random() * mockEmotions.length)];
      const randomIntensity = mockIntensities[Math.floor(Math.random() * mockIntensities.length)];
      
      // Store mock result (simulating backend response)
      console.log(`[Emotion] Mock result: ${randomEmotion} (${randomIntensity})`);
      
      // Update UI with mock data (this would normally come from backend)
      // For now, we'll just log it and let the finalize session handle the display
    } catch (err: any) {
      console.error("[Emotion] Emotion prediction error:", err);
      // Don't show errors in mock mode
    }
  };

  // Send hand analysis (MOCKED - no API calls)
  const sendHandAnalysis = async () => {
    const currentSessionId = sessionIdRef.current;
    const isActive = sessionActiveRef.current;
    
    if (!currentSessionId || !isActive) {
      console.log(`[Hand] Skipping hand analysis - sessionId: ${currentSessionId}, active: ${isActive}`);
      return;
    }

    try {
      // MOCK MODE: Simulate hand movement analysis without API calls
      console.log(`[Hand] Mock mode - simulating hand analysis for session ${currentSessionId}`);
      
      // Simulate hand movement detection
      const mockSpeeds = [0.5, 1.2, 2.1, 0.8, 1.5];
      const mockLevels = ['Low', 'Medium', 'High'];
      const randomSpeed = mockSpeeds[Math.floor(Math.random() * mockSpeeds.length)];
      const randomLevel = mockLevels[Math.floor(Math.random() * mockLevels.length)];
      
      // Store mock result
      console.log(`[Hand] Mock result: Speed=${randomSpeed}, Level=${randomLevel}`);
      
      // Update UI with mock data (this would normally come from backend)
      // For now, we'll just log it
    } catch (err: any) {
      console.error("[Hand] Hand analysis error:", err);
      // Don't show errors in mock mode
    }
  };

  // Start session (MOCK MODE - no API calls)
  const startSession = async () => {
    // Prevent multiple simultaneous calls
    if (isStartingSessionRef.current || sessionActive) {
      console.log("Session already starting or active, ignoring request");
      return;
    }

    try {
      isStartingSessionRef.current = true;

      // Optional: Request camera permission (can skip for mock mode)
      // if (!permission?.granted) {
      //   const ok = await ensureCameraPermission();
      //   if (!ok) {
      //     setError("Camera permission required");
      //     isStartingSessionRef.current = false;
      //     return;
      //   }
      // }

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

      // MOCK MODE: No backend API calls - start session locally
      console.log(`[Session] Starting MOCK session ${newSessionId} (no API calls)`);
      
      setSessionActive(true);
      sessionActiveRef.current = true; // Update ref immediately
      isStartingSessionRef.current = false;
      setLoading(false);

      // Wait a bit before starting mock captures
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Session] Starting mock capture intervals for session ${newSessionId}`);
      
      // Start mock emotion capture (every 2 seconds)
      emotionCaptureIntervalRef.current = setInterval(() => {
        try {
          sendEmotionPrediction();
        } catch (err) {
          console.error("Error in emotion capture interval:", err);
        }
      }, 2000);

      // Start mock hand capture (every 8 seconds)
      handCaptureIntervalRef.current = setInterval(() => {
        try {
          sendHandAnalysis();
        } catch (err) {
          console.error("Error in hand capture interval:", err);
        }
      }, 8000);
      
      // Trigger first mock captures
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

  // Finish session (MOCK MODE - returns hardcoded results)
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
      // MOCK MODE: Return hardcoded results without API calls
      console.log(`[Session] Finalizing MOCK session ${currentSessionId}...`);
      
      // Simulate session duration
      const duration = seconds;
      
      // Emotion mapping based on arousal level
      const emotionMap: Record<string, Record<string, string>> = {
        HIGH: {
          'Happy': 'Excited Happy',
          'Angry': 'Highly Agitated Angry',
          'Neutral': 'Hyperactive',
          'Sad': 'Distressed',
          'Fear': 'Panicked',
          'Surprise': 'Strong Shock',
          'Disgust': 'Strong Disgust',
        },
        MEDIUM: {
          'Happy': 'Happy',
          'Angry': 'Angry',
          'Neutral': 'Neutral',
          'Sad': 'Sad',
          'Fear': 'Fear',
          'Surprise': 'Surprise',
          'Disgust': 'Disgust',
        },
        LOW: {
          'Happy': 'Calm Happy',
          'Angry': 'Controlled Anger',
          'Neutral': 'Calm Neutral',
          'Sad': 'Low-energy Sad',
          'Fear': 'Nervous',
          'Surprise': 'Mild Surprise',
          'Disgust': 'Mild Disgust',
        },
      };
      
      // Base emotions
      const baseEmotions = ['Happy', 'Angry', 'Neutral', 'Sad', 'Fear', 'Surprise', 'Disgust'];
      
      // Determine arousal level based on session duration and activity
      // HIGH: long sessions (>45s) or very short intense sessions (<10s)
      // MEDIUM: moderate sessions (10-45s)
      // LOW: very short sessions or based on randomness
      let arousalLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      if (duration > 45) {
        arousalLevel = Math.random() > 0.3 ? 'HIGH' : 'MEDIUM'; // Mostly HIGH for long sessions
      } else if (duration < 10) {
        arousalLevel = Math.random() > 0.5 ? 'LOW' : 'MEDIUM'; // LOW or MEDIUM for short sessions
      } else {
        // Medium duration: mix of all three
        const rand = Math.random();
        if (rand > 0.66) {
          arousalLevel = 'HIGH';
        } else if (rand > 0.33) {
          arousalLevel = 'MEDIUM';
        } else {
          arousalLevel = 'LOW';
        }
      }
      
      // Select base emotion randomly (can be weighted if needed)
      const baseEmotion = baseEmotions[Math.floor(Math.random() * baseEmotions.length)];
      
      // Apply emotion mapping based on arousal
      const finalEmotion = emotionMap[arousalLevel][baseEmotion] || baseEmotion;
      
      // Determine engagement level (can be based on arousal or duration)
      let engagementLevel: string;
      if (arousalLevel === 'HIGH') {
        engagementLevel = 'High';
      } else if (arousalLevel === 'MEDIUM') {
        engagementLevel = 'Medium';
      } else {
        engagementLevel = 'Low';
      }
      
      // Generate summary based on emotion and arousal
      const summaries = {
        HIGH: [
          `Highly engaged reading session! The reader showed ${finalEmotion.toLowerCase()} emotion with intense focus for ${duration} seconds.`,
          `Excellent session with high energy! Reader demonstrated ${finalEmotion.toLowerCase()} throughout the ${Math.floor(duration / 60)} minute session.`,
        ],
        MEDIUM: [
          `Good reading session! The reader showed ${finalEmotion.toLowerCase()} emotion with steady engagement for ${duration} seconds.`,
          `Steady reading session. Reader maintained ${finalEmotion.toLowerCase()} and consistent focus throughout.`,
        ],
        LOW: [
          `Calm reading session. The reader showed ${finalEmotion.toLowerCase()} emotion with relaxed engagement for ${duration} seconds.`,
          `Peaceful reading session. Reader demonstrated ${finalEmotion.toLowerCase()} with gentle focus throughout.`,
        ],
      };
      
      const summaryOptions = summaries[arousalLevel];
      const summary = summaryOptions[Math.floor(Math.random() * summaryOptions.length)];
      
      // Set mock results
      setFinalEmotion(finalEmotion);
      setEngagementLevel(engagementLevel);
      setSummary(summary);
      setSummaryVisible(true);
      
      console.log(`[Session] Mock results: Base=${baseEmotion}, Arousal=${arousalLevel}, Final=${finalEmotion}, Engagement=${engagementLevel}`);
    } catch (err: any) {
      console.error("Finalize session error:", err);
      // Provide fallback mock data even on error
      setFinalEmotion('Calm Happy');
      setEngagementLevel('Medium');
      setSummary('Reading session completed successfully.');
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
