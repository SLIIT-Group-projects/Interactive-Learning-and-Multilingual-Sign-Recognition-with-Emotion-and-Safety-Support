import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Switch,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Image } from "react-native";

import closeIcon from "@/assets/icons/close.png";
import flipIcon from "@/assets/icons/flip.png";
import handIcon from "@/assets/icons/hand.png";
import playIcon from "@/assets/icons/play.png";
import stopIcon from "@/assets/icons/stop.png";
import slIcon from "@/assets/icons/SL.png";
import usaIcon from "@/assets/icons/USA.png";

// Multilang Flask `backend/app.py` (NOT Node, NOT games api_server). Default port 5002.
// Set EXPO_PUBLIC_MULTILANG_SIGN_API_URL in frontend/.env to override.
const _lanIp =
  (typeof process !== "undefined" &&
    process.env.EXPO_PUBLIC_COMPUTER_IP?.trim()) ||
  "192.168.1.2";
const _multilangFromEnv =
  typeof process !== "undefined" &&
  process.env.EXPO_PUBLIC_MULTILANG_SIGN_API_URL?.trim();
const API_BASE_URL = __DEV__
  ? _multilangFromEnv || `http://${_lanIp}:5002`
  : _multilangFromEnv || "https://your-production-api.com";

export default function SignDetectionScreen() {
  // Try to get navigation - will be undefined if not in React Navigation context
  let navigation;
  try {
    navigation = useNavigation();
  } catch (e) {
    // Not in React Navigation context (e.g., Expo Router)
    navigation = null;
  }
  const [facing, setFacing] = useState("front");
  const [permission, requestPermission] = useCameraPermissions();
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRealTimeMode, setIsRealTimeMode] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [apiUrl, setApiUrl] = useState(API_BASE_URL);
  const [showApiInput, setShowApiInput] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("sinhala");
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("unknown"); // 'connected', 'disconnected', 'checking', 'unknown'

  // Sign sequence and detection state
  const [signSequence, setSignSequence] = useState([]); // Array of detected signs
  const [currentSentence, setCurrentSentence] = useState(""); // Current sentence being built
  const [frameBuffer, setFrameBuffer] = useState([]); // Buffer for consistent detection
  const [lastDetectedSign, setLastDetectedSign] = useState(null); // Last confirmed sign
  const [holdSteadyCount, setHoldSteadyCount] = useState(0); // Count of consistent frames
  const [isHoldingSteady, setIsHoldingSteady] = useState(false); // User is holding sign steady
  const [detectionFeedback, setDetectionFeedback] = useState(""); // Live feedback message
  const [sentenceFinalizeTimeout, setSentenceFinalizeTimeout] = useState(null); // Timeout for sentence finalization
  const [grammarCorrectionEnabled, setGrammarCorrectionEnabled] =
    useState(false); // Toggle for grammar correction

  const cameraRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const lastSignTimeRef = useRef(0); // Timestamp of last sign detection
  const consecutiveFramesRef = useRef(0); // Count of consecutive frames with same sign (Sinhala)
  const lastSignRef = useRef(null); // Last sign detected
  const isMountedRef = useRef(true); // Track if component is mounted
  const isRealTimeModeRef = useRef(false); // Track real-time mode state

  const languages = [
    {
      value: "sinhala",
      label: "Sinhala Sign Language",
      icon: slIcon,
      available: true,
    },
    {
      value: "asl",
      label: "American Sign Language",
      icon: usaIcon,
      available: true,
    },
  ];

  // Check connection status
  const checkConnection = async (showAlert = false) => {
    setConnectionStatus("checking");
    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/health?language=${selectedLanguage}`,
        { method: "GET" },
        5000, // 5 second timeout for quick check
      );
      const data = await response.json();
      if (data.status === "healthy" && data.model_loaded) {
        setConnectionStatus("connected");
        if (showAlert) {
          Alert.alert("✅ Connected!", "Server is ready to use!");
        }
        return true;
      } else {
        setConnectionStatus("disconnected");
        if (showAlert) {
          Alert.alert(
            "⚠️ Server Issue",
            "Server responded but model is not loaded.",
          );
        }
        return false;
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      if (showAlert) {
        Alert.alert(
          "❌ Cannot Connect",
          `Cannot reach server at ${apiUrl}\n\nMake sure:\n✨ Backend server is running\n✨ Correct IP address\n✨ Same Wi-Fi network`,
        );
      }
      return false;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Request camera permission on mount
    if (!permission?.granted) {
      requestPermission();
    }

    // Check connection on mount and when API URL changes
    checkConnection();

    // Reset buffers when language changes
    consecutiveFramesRef.current = 0;
    lastSignRef.current = null;
    setHoldSteadyCount(0);
    setIsHoldingSteady(false);
    setDetectionFeedback("");

    // Reset ASL backend buffer when switching to ASL
    if (selectedLanguage === "asl") {
      fetch(`${apiUrl}/reset-asl-buffer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Silently fail if backend is not available yet
      });
    }

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      isRealTimeModeRef.current = false;
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      if (sentenceFinalizeTimeout) {
        clearTimeout(sentenceFinalizeTimeout);
      }
    };
  }, [permission, apiUrl, selectedLanguage]);

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  // Configuration constants
  const DETECTION_CONFIG = {
    MIN_CONFIDENCE: 0.6, // Minimum confidence threshold
    REQUIRED_CONSECUTIVE_FRAMES: 3, // Frames needed for consistent detection (Sinhala)
    MIN_SIGN_DURATION: 1000, // Minimum time (ms) to hold a sign before accepting
    SENTENCE_FINALIZE_DELAY: 2000, // Time (ms) without detection before finalizing sentence
    DUPLICATE_PREVENTION_DELAY: 500, // Minimum time (ms) between accepting same sign (Sinhala)
    DETECTION_INTERVAL_SINHALA: 500, // Interval (ms) between detections for Sinhala
    DETECTION_INTERVAL_ASL: 100, // Interval (ms) between detections for ASL (faster for live frames, backend handles skipping)
    // ASL-specific config
    ASL_MIN_CONFIDENCE: 0.6, // Minimum confidence for ASL
    ASL_DUPLICATE_PREVENTION_DELAY: 1000, // Minimum time (ms) between accepting same ASL sign (~1 second)
  };

  // Helper function to create a fetch with timeout
  const fetchWithTimeout = (url, options, timeout = 30000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Request timeout - server took too long to respond"),
            ),
          timeout,
        ),
      ),
    ]);
  };

  // Rule-based grammar for converting sign sequence to sentence
  const buildSentenceFromSequence = (sequence) => {
    if (sequence.length === 0) return "";

    // Filter out consecutive duplicate signs
    const filteredSequence = [];
    for (let i = 0; i < sequence.length; i++) {
      // Only add if it's the first sign or different from the previous one
      if (i === 0 || sequence[i] !== sequence[i - 1]) {
        filteredSequence.push(sequence[i]);
      }
    }

    if (filteredSequence.length === 0) return "";

    // Capitalize first letter of first word, make rest lowercase
    let sentence =
      filteredSequence[0].charAt(0).toUpperCase() +
      filteredSequence[0].slice(1).toLowerCase();

    // Add spaces between signs (all subsequent words lowercase)
    for (let i = 1; i < filteredSequence.length; i++) {
      sentence += " " + filteredSequence[i].toLowerCase();
    }

    // Add period at the end
    sentence += ".";

    return sentence;
  };

  // Grammar correction function for ASL sentences
  const applyGrammarCorrection = (sentence) => {
    if (!sentence || sentence.trim().length === 0) return sentence;

    // Remove period if present (we'll add it back at the end)
    let text = sentence.trim().replace(/\.$/, "");

    // Split into words
    const words = text.split(/\s+/).map((w) => w.toLowerCase());
    const correctedWords = [];

    // Common greetings that should have a comma after them
    const greetings = ["hello", "hi", "hey", "goodbye", "bye"];
    // Action verbs that don't need "are" after "you"
    const actionVerbs = [
      "go",
      "come",
      "see",
      "know",
      "think",
      "want",
      "need",
      "like",
      "love",
      "have",
      "do",
      "get",
      "make",
      "take",
      "give",
      "say",
      "tell",
      "ask",
      "help",
      "work",
      "play",
      "eat",
      "drink",
      "sleep",
      "wake",
      "run",
      "walk",
      "sit",
      "stand",
      "look",
      "watch",
      "listen",
      "read",
      "write",
      "speak",
      "talk",
    ];
    // Auxiliary verbs that are already present
    const auxVerbs = [
      "are",
      "is",
      "am",
      "was",
      "were",
      "will",
      "can",
      "should",
      "would",
      "could",
      "have",
      "has",
      "had",
    ];

    let skipNext = false;
    for (let i = 0; i < words.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      const word = words[i];
      const nextWord = i < words.length - 1 ? words[i + 1] : null;
      const prevWord = i > 0 ? words[i - 1] : null;

      // Handle greetings - add comma if followed by another word
      if (greetings.includes(word) && nextWord) {
        correctedWords.push(word.charAt(0).toUpperCase() + word.slice(1) + ",");
      }
      // Handle "where you" -> "where are you"
      else if (word === "where" && nextWord === "you") {
        correctedWords.push(word.charAt(0).toUpperCase() + word.slice(1));
        correctedWords.push("are");
        correctedWords.push("you"); // Add "you" immediately
        skipNext = true; // Skip processing "you" in next iteration
      }
      // Handle "you" followed by adjective/noun (needs "are")
      else if (word === "you" && nextWord && !auxVerbs.includes(nextWord)) {
        // Check if next word is a question word (don't add "are" before question words)
        const questionWords = [
          "where",
          "what",
          "when",
          "why",
          "how",
          "who",
          "which",
        ];

        if (questionWords.includes(nextWord)) {
          // "you where" -> "you are where" (but this pattern is less common, usually it's "where you")
          correctedWords.push(i === 0 ? "You" : "you");
        } else if (!actionVerbs.includes(nextWord)) {
          // "you" + adjective/noun -> "you are" + adjective/noun
          correctedWords.push(i === 0 ? "You" : "you");
          correctedWords.push("are");
        } else {
          // "you" + action verb -> keep as is
          correctedWords.push(i === 0 ? "You" : "you");
        }
      }
      // Capitalize first word
      else if (i === 0) {
        correctedWords.push(word.charAt(0).toUpperCase() + word.slice(1));
      }
      // Keep other words as lowercase
      else {
        correctedWords.push(word);
      }
    }

    // Join words
    let corrected = correctedWords.join(" ");

    // Ensure proper capitalization at the start
    if (corrected.length > 0) {
      corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    }

    // Add period at the end if not present
    if (
      !corrected.endsWith(".") &&
      !corrected.endsWith("!") &&
      !corrected.endsWith("?")
    ) {
      corrected += ".";
    }

    return corrected;
  };

  // Process detection result with language-specific logic
  const processDetection = (result) => {
    // Don't process if component is unmounted or real-time mode stopped
    if (!isMountedRef.current || !result) return null;

    // Handle no hand detected case
    if (result.no_hand) {
      if (isMountedRef.current && isRealTimeModeRef.current) {
        setDetectionFeedback(
          "👋 No hand detected. Please show your hand to the camera.",
        );
        setIsHoldingSteady(false);
        setHoldSteadyCount(0);
      }
      consecutiveFramesRef.current = 0;
      lastSignRef.current = null;
      return null;
    }

    if (
      !result.prediction ||
      !isMountedRef.current ||
      !isRealTimeModeRef.current
    )
      return null;

    const { prediction, english_translation, confidence } = result;
    // Use English translation if available, otherwise use prediction
    const displayText = english_translation || prediction;
    const now = Date.now();

    // Language-specific processing
    if (selectedLanguage === "sinhala") {
      return processSinhalaDetection(result, displayText, confidence, now);
    } else if (selectedLanguage === "asl") {
      return processAslDetection(result, displayText, confidence, now);
    }

    return null;
  };

  // Sinhala: Hold steady frame-based confirmation
  const processSinhalaDetection = (result, displayText, confidence, now) => {
    // Don't process if component is unmounted or real-time mode stopped
    if (!isMountedRef.current || !isRealTimeModeRef.current) {
      return null;
    }

    // Ignore low confidence predictions
    if (confidence < DETECTION_CONFIG.MIN_CONFIDENCE) {
      if (isMountedRef.current && isRealTimeModeRef.current) {
        setDetectionFeedback(
          `Confidence too low: ${(confidence * 100).toFixed(0)}% (need ${(DETECTION_CONFIG.MIN_CONFIDENCE * 100).toFixed(0)}%)`,
        );
        setIsHoldingSteady(false);
        setHoldSteadyCount(0);
      }
      consecutiveFramesRef.current = 0;
      return null;
    }

    // Check if same sign as last frame
    if (lastSignRef.current === result.prediction) {
      consecutiveFramesRef.current += 1;
    } else {
      consecutiveFramesRef.current = 1;
      lastSignRef.current = result.prediction;
    }

    // Update hold steady feedback
    setHoldSteadyCount(consecutiveFramesRef.current);
    setIsHoldingSteady(
      consecutiveFramesRef.current >=
        DETECTION_CONFIG.REQUIRED_CONSECUTIVE_FRAMES,
    );

    if (
      consecutiveFramesRef.current <
      DETECTION_CONFIG.REQUIRED_CONSECUTIVE_FRAMES
    ) {
      setDetectionFeedback(
        `Hold steady... ${consecutiveFramesRef.current}/${DETECTION_CONFIG.REQUIRED_CONSECUTIVE_FRAMES} frames (${(confidence * 100).toFixed(0)}% confidence)`,
      );
      return null; // Not enough consistent frames yet
    }

    // Check for duplicate prevention
    const timeSinceLastSign = now - lastSignTimeRef.current;
    if (
      lastDetectedSign === result.prediction &&
      timeSinceLastSign < DETECTION_CONFIG.DUPLICATE_PREVENTION_DELAY
    ) {
      setDetectionFeedback(
        `Sign detected! (waiting ${DETECTION_CONFIG.DUPLICATE_PREVENTION_DELAY - timeSinceLastSign}ms to prevent duplicates)`,
      );
      return null;
    }

    // Sign is confirmed - add to sequence
    return confirmSign(displayText, result.prediction, confidence, now);
  };

  // ASL: Simple detection relying on backend sequence buffering (Bi-LSTM sequence model)
  const processAslDetection = (result, displayText, confidence, now) => {
    // Don't process if component is unmounted or real-time mode stopped
    if (!isMountedRef.current || !isRealTimeModeRef.current) {
      return null;
    }

    // Filter out invalid predictions (backend returns "..." when sequence buffer is too short)
    if (
      result.prediction === "..." ||
      result.prediction === null ||
      !result.prediction
    ) {
      if (isMountedRef.current && isRealTimeModeRef.current) {
        setDetectionFeedback("📹 Building sequence...");
        setIsHoldingSteady(false);
        setHoldSteadyCount(1); // Show progress indicator
      }
      return null;
    }

    // Ignore low confidence predictions
    if (confidence < DETECTION_CONFIG.ASL_MIN_CONFIDENCE) {
      if (isMountedRef.current && isRealTimeModeRef.current) {
        setDetectionFeedback(
          `📹 Low confidence: ${(confidence * 100).toFixed(0)}%`,
        );
        setIsHoldingSteady(false);
        setHoldSteadyCount(1); // Show progress indicator
      }
      return null;
    }

    // Check for duplicate prevention (~1 second delay for ASL)
    const timeSinceLastSign = now - lastSignTimeRef.current;
    if (
      lastDetectedSign === result.prediction &&
      timeSinceLastSign < DETECTION_CONFIG.ASL_DUPLICATE_PREVENTION_DELAY
    ) {
      setDetectionFeedback(
        `📹 Detected! (waiting ${DETECTION_CONFIG.ASL_DUPLICATE_PREVENTION_DELAY - timeSinceLastSign}ms to prevent duplicates)`,
      );
      setIsHoldingSteady(true); // Show that we detected something
      setHoldSteadyCount(1);
      return null;
    }

    // Sign is confirmed - add to sequence
    // Backend handles sequence buffering and motion analysis
    setIsHoldingSteady(true);
    setHoldSteadyCount(1);
    setDetectionFeedback(
      `✅ "${displayText}" detected! (${(confidence * 100).toFixed(0)}% confidence)`,
    );
    return confirmSign(displayText, result.prediction, confidence, now);
  };

  // Common function to confirm and add sign to sequence
  const confirmSign = (displayText, prediction, confidence, now) => {
    // Don't update state if component is unmounted or real-time mode stopped
    if (!isMountedRef.current || !isRealTimeModeRef.current) {
      return null;
    }

    setLastDetectedSign(prediction);
    lastSignTimeRef.current = now;
    setDetectionFeedback(
      `✅ "${displayText}" added! (${(confidence * 100).toFixed(0)}% confidence)`,
    );

    // Add to sequence (using English translation for display)
    setSignSequence((prev) => {
      const newSequence = [...prev, displayText];
      const newSentence = buildSentenceFromSequence(newSequence);
      if (isMountedRef.current) {
        setCurrentSentence(newSentence);
      }
      return newSequence;
    });

    // Reset consecutive frames counter (for Sinhala)
    consecutiveFramesRef.current = 0;
    lastSignRef.current = null;

    // Reset sentence finalization timeout
    if (sentenceFinalizeTimeout) {
      clearTimeout(sentenceFinalizeTimeout);
    }

    const timeout = setTimeout(() => {
      // Finalize sentence after delay without new detections
      finalizeSentence();
    }, DETECTION_CONFIG.SENTENCE_FINALIZE_DELAY);

    setSentenceFinalizeTimeout(timeout);

    return prediction;
  };

  // Finalize current sentence
  const finalizeSentence = () => {
    if (signSequence.length > 0) {
      const finalSentence = buildSentenceFromSequence(signSequence);
      setTranslatedText(finalSentence);
      setSignSequence([]);
      setCurrentSentence("");
      setLastDetectedSign(null);
      setDetectionFeedback("Sentence completed! 👏");

      // Clear feedback after 2 seconds
      setTimeout(() => {
        setDetectionFeedback("");
      }, 2000);
    }

    if (sentenceFinalizeTimeout) {
      clearTimeout(sentenceFinalizeTimeout);
      setSentenceFinalizeTimeout(null);
    }
  };

  const captureAndDetect = async () => {
    // Check if component is still mounted and camera is available
    if (!isMountedRef.current || !cameraRef.current) {
      return null;
    }

    // Check if real-time mode is still active (for real-time detection)
    if (isRealTimeMode && !isRealTimeModeRef.current) {
      return null;
    }

    try {
      // Language-specific capture settings
      // ASL: Lower quality for faster capture (live-frame approach)
      // Sinhala: Higher quality for static sign detection
      const captureOptions =
        selectedLanguage === "asl"
          ? {
              quality: 0.6, // Lower quality for faster capture
              base64: true,
              skipProcessing: true, // Skip processing for speed
            }
          : {
              quality: 0.8, // Higher quality for static signs
              base64: true,
              skipProcessing: false,
            };

      // Double-check camera ref before taking picture
      if (!cameraRef.current) {
        return null;
      }

      // Take a picture
      const photo = await cameraRef.current.takePictureAsync(captureOptions);

      // Check again after async operation
      if (!isMountedRef.current || !isRealTimeModeRef.current) {
        return null;
      }

      if (!photo?.base64) {
        throw new Error("Failed to capture image");
      }

      // Send to backend API with selected language and timeout
      const response = await fetchWithTimeout(
        `${apiUrl}/predict`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: photo.base64,
            language: selectedLanguage,
          }),
        },
        30000, // 30 second timeout
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle no hand detected case
      if (!data.success && data.error === "no_hand_detected") {
        return {
          no_hand: true,
          message: data.message || "No hand detected",
          prediction: null,
          english_translation: null,
          confidence: 0,
        };
      }

      if (data.success && data.prediction) {
        return {
          prediction: data.prediction,
          english_translation: data.english_translation || data.prediction,
          confidence: data.confidence,
          no_hand: false,
        };
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error) {
      // Don't log or throw errors if component is unmounted or real-time mode stopped
      if (
        !isMountedRef.current ||
        (isRealTimeMode && !isRealTimeModeRef.current)
      ) {
        return null;
      }

      console.error("Error in captureAndDetect:", error);

      // Handle camera unmount error gracefully
      if (
        error.message.includes("Camera unmounted") ||
        error.message.includes("unmounted")
      ) {
        // This is expected when stopping real-time mode or unmounting
        return null;
      }

      // Provide child-friendly error messages
      let errorMessage = "Oops! Something went wrong. 😔";

      if (
        error.message.includes("timeout") ||
        error.message.includes("Network request timed out")
      ) {
        errorMessage = `⏱️ The server is taking too long!\n\nTry:\n✨ Check if server is running\n✨ Make sure you're on the same Wi-Fi\n✨ Tap "Configure API" to check the URL`;
      } else if (
        error.message.includes("Failed to fetch") ||
        error.message.includes("ERR_CONNECTION_REFUSED") ||
        error.message.includes("NetworkError")
      ) {
        errorMessage = `🔌 Can't connect to server!\n\nMake sure:\n✨ Backend server is running\n✨ Using correct IP address\n✨ Phone and computer on same Wi-Fi\n\nTap "Configure API" to fix!`;
      } else if (error.message.includes("API error")) {
        errorMessage = `⚠️ Server returned an error\n\nPlease check the server logs`;
      } else {
        errorMessage = `😕 ${error.message || "Something went wrong"}`;
      }

      throw new Error(errorMessage);
    }
  };

  const handleDetectSign = async () => {
    if (!permission?.granted) {
      Alert.alert(
        "Permission Required",
        "Camera permission is required to detect sign language.",
      );
      return;
    }

    setIsDetecting(true);
    setDetectionFeedback("Detecting sign...");

    try {
      const result = await captureAndDetect();

      if (result) {
        const processed = processDetection(result);
        if (processed) {
          setConfidence(result.confidence);
        }
      }
    } catch (error) {
      console.error("Error detecting sign:", error);
      const errorMessage = error.message || "Unknown error";
      setDetectionFeedback("❌ Detection failed");
      Alert.alert(
        "Oops! 😔",
        `${errorMessage}\n\nCurrent API: ${apiUrl}\n\n💡 Tips:\n✨ Tap "⚙️ Configure API" to check settings\n✨ Make sure server is running\n✨ Check Wi-Fi connection`,
      );
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleRealTimeMode = () => {
    if (isRealTimeMode) {
      // Stop real-time detection
      isRealTimeModeRef.current = false; // Set this first to stop new captures
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      // Finalize any pending sentence
      finalizeSentence();
      setIsRealTimeMode(false);
      setDetectionFeedback("");
      setIsHoldingSteady(false);
      setHoldSteadyCount(0);
      consecutiveFramesRef.current = 0;
      lastSignRef.current = null;
    } else {
      // Reset sequence state
      setSignSequence([]);
      setCurrentSentence("");
      setLastDetectedSign(null);
      setDetectionFeedback(
        selectedLanguage === "asl"
          ? "📹 Starting motion capture..."
          : "Starting real-time detection...",
      );
      // Clear buffers
      consecutiveFramesRef.current = 0;
      lastSignRef.current = null;

      // Reset ASL backend buffer when starting real-time mode with ASL
      const resetAslBufferPromise =
        selectedLanguage === "asl"
          ? fetch(`${apiUrl}/reset-asl-buffer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }).catch(() => {
              // Silently fail if backend is not available yet
            })
          : Promise.resolve();

      // Check connection before starting real-time mode
      Promise.all([
        resetAslBufferPromise,
        fetchWithTimeout(
          `${apiUrl}/health?language=${selectedLanguage}`,
          { method: "GET" },
          10000, // 10 second timeout for health check
        ),
      ])
        .then(() => {
          // Determine detection interval based on language
          const detectionInterval =
            selectedLanguage === "asl"
              ? DETECTION_CONFIG.DETECTION_INTERVAL_ASL
              : DETECTION_CONFIG.DETECTION_INTERVAL_SINHALA;

          // Start real-time detection
          setIsRealTimeMode(true);
          isRealTimeModeRef.current = true; // Set ref to allow captures
          detectionIntervalRef.current = setInterval(async () => {
            // Check if still in real-time mode and component is mounted
            if (!isRealTimeModeRef.current || !isMountedRef.current) {
              if (detectionIntervalRef.current) {
                clearInterval(detectionIntervalRef.current);
                detectionIntervalRef.current = null;
              }
              return;
            }

            if (!isDetecting && isRealTimeModeRef.current) {
              setIsDetecting(true);
              try {
                const result = await captureAndDetect();
                // Check again after async operation
                if (
                  isRealTimeModeRef.current &&
                  isMountedRef.current &&
                  result
                ) {
                  processDetection(result);
                  if (result.confidence) {
                    setConfidence(result.confidence);
                  }
                }
              } catch (error) {
                // Don't log camera unmount errors - they're expected when stopping
                if (
                  !error.message.includes("Camera unmounted") &&
                  !error.message.includes("unmounted")
                ) {
                  console.error("Real-time detection error:", error);
                }
                // Stop real-time mode on persistent errors
                if (
                  error.message.includes("timeout") ||
                  error.message.includes("Can't connect")
                ) {
                  isRealTimeModeRef.current = false;
                  if (detectionIntervalRef.current) {
                    clearInterval(detectionIntervalRef.current);
                    detectionIntervalRef.current = null;
                  }
                  setIsRealTimeMode(false);
                  setDetectionFeedback("❌ Connection lost");
                  Alert.alert(
                    "Connection Lost 😔",
                    "Real-time detection stopped due to connection issues. Please check your connection and try again.",
                    [{ text: "OK" }],
                  );
                }
              } finally {
                if (isMountedRef.current) {
                  setIsDetecting(false);
                }
              }
            }
          }, detectionInterval);
        })
        .catch(() => {
          Alert.alert(
            "Connection Error 😔",
            "Cannot connect to server. Please check:\n\n✨ Server is running\n✨ Correct API URL\n✨ Same Wi-Fi network",
            [{ text: "OK" }],
          );
        });
    }
  };

  const handleTextToSpeech = () => {
    if (!translatedText) {
      Alert.alert("No Text", "Please detect a sign first.");
      return;
    }

    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      Speech.speak(translatedText, {
        language: "en", // Change this based on your language preference
        pitch: 1.0,
        rate: 0.9,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => {
          setIsSpeaking(false);
          Alert.alert("Error", "Failed to speak text.");
        },
      });
    }
  };

  const clearText = () => {
    setTranslatedText("");
    setCurrentSentence("");
    setSignSequence([]);
    setLastDetectedSign(null);
    setDetectionFeedback("");
    setIsHoldingSteady(false);
    setHoldSteadyCount(0);
    consecutiveFramesRef.current = 0;
    lastSignRef.current = null;
    lastSignRef.current = null;
    if (sentenceFinalizeTimeout) {
      clearTimeout(sentenceFinalizeTimeout);
      setSentenceFinalizeTimeout(null);
    }
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    }
  };

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.loadingText}>
          Requesting camera permission...
        </ThemedText>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Camera Permission Required
        </ThemedText>
        <ThemedText style={styles.message}>
          We need access to your camera to detect sign language.
        </ThemedText>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <ThemedText style={styles.buttonText}>Grant Permission</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  const handleBackPress = () => {
    // Check if navigation is available (React Navigation context)
    if (navigation && navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation && navigation.navigate) {
      // Try to navigate to ParentDashboard
      navigation.navigate("ParentDashboard");
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        {/* Back Button */}
        {navigation && (
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <IconSymbol name="arrow.left" size={24} color="#374151" />
          </TouchableOpacity>
        )}

        {/* Connection Status Indicator
        <View style={styles.connectionStatusContainer}>
          <View style={[
            styles.connectionDot,
            connectionStatus === 'connected' && styles.connectionDotConnected,
            connectionStatus === 'disconnected' && styles.connectionDotDisconnected,
            connectionStatus === 'checking' && styles.connectionDotChecking,
          ]} />
          <ThemedText style={styles.connectionStatusText}>
            {connectionStatus === 'connected' && '✅ Connected to Server'}
            {connectionStatus === 'disconnected' && '❌ Server Not Connected'}
            {connectionStatus === 'checking' && '🔄 Checking Connection...'}
            {connectionStatus === 'unknown' && '⚪ Connection Unknown'}
          </ThemedText>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={() => checkConnection(true)}
          >
            <IconSymbol name="arrow.clockwise" size={16} color="#FF6B9D" />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={styles.apiButton}
          onPress={() => setShowApiInput(!showApiInput)}
        >
          <ThemedText style={styles.apiButtonText}>
            {showApiInput ? 'Hide' : '⚙️ Configure'} API
          </ThemedText>
        </TouchableOpacity>
        {showApiInput && (
          <View style={styles.apiInputContainer}>
            <TextInput
              style={styles.apiInput}
              value={apiUrl}
              onChangeText={(text) => {
                setApiUrl(text);
                setConnectionStatus('unknown');
              }}
              placeholder="Enter API URL (e.g., http://192.168.1.2:5002)"
              placeholderTextColor="#999"
            />
            <TouchableOpacity 
              style={styles.testButton}
              onPress={async () => {
                try {
                  const response = await fetchWithTimeout(
                    `${apiUrl}/health?language=${selectedLanguage}`,
                    { method: 'GET' },
                    10000 // 10 second timeout for health check
                  );
                  const data = await response.json();
                  const languageName = languages.find(l => l.value === selectedLanguage)?.label || selectedLanguage;
                  setConnectionStatus('connected');
                  Alert.alert(
                    '✅ Connected! 🎉',
                    `Server is working!\n\n✨ ${languageName} model: ${data.model_loaded ? 'Ready' : 'Not loaded'}\n✨ Available languages: ${data.available_languages?.join(', ') || 'N/A'}`
                  );
                } catch (error) {
                  setConnectionStatus('disconnected');
                  let errorMsg = 'Could not connect to server';
                  if (error.message.includes('timeout')) {
                    errorMsg = 'Server took too long to respond';
                  } else if (error.message.includes('Failed to fetch')) {
                    errorMsg = 'Cannot reach server';
                  }
                  Alert.alert(
                    '❌ Connection Failed',
                    `${errorMsg}\n\nURL: ${apiUrl}\n\n💡 Quick Fix:\n1. Open terminal/PowerShell\n2. Go to: backend folder\n3. Run: python app.py (multilang server, default port 5002)\n4. Make sure it shows "Server ready!"\n\n💡 Also check:\n✨ Correct IP address (not localhost)\n✨ Same Wi-Fi network\n✨ Firewall not blocking the app port (5002 default)`
                  );
                }
              }}
            >
              <ThemedText style={styles.testButtonText}>🔍 Test Connection</ThemedText>
            </TouchableOpacity>
          </View>
        )} */}

        {/* Language Selector */}
        <TouchableOpacity
          style={styles.languageButton}
          onPress={() => setShowLanguagePicker(true)}
        >
          <View style={styles.languageButtonContent}>
            <Image
              source={languages.find((l) => l.value === selectedLanguage)?.icon}
              style={styles.languageIcon}
            />

            <ThemedText style={styles.languageButtonText}>
              {languages.find((l) => l.value === selectedLanguage)?.label ||
                "Select Language"}
            </ThemedText>
            <IconSymbol name="chevron.down" size={20} color="#FF6B9D" />
          </View>
        </TouchableOpacity>
      </ThemedView>

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>
              Choose Sign Language 🌍
            </ThemedText>
            <ScrollView style={styles.languageList}>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.value}
                  style={[
                    styles.languageOption,
                    selectedLanguage === lang.value &&
                      styles.languageOptionSelected,
                    !lang.available && styles.languageOptionDisabled,
                  ]}
                  onPress={async () => {
                    if (lang.available) {
                      try {
                        await fetch(`${apiUrl}/reset-asl-buffer`, {
                          method: "POST",
                        });
                      } catch (e) {
                        console.log("Could not reset ASL buffer");
                      }

                      setSelectedLanguage(lang.value);
                      setShowLanguagePicker(false);
                      clearText();
                    } else {
                      Alert.alert(
                        "Coming Soon! 🚀",
                        `${lang.label} will be available soon! Stay tuned!`,
                        [{ text: "OK", style: "default" }],
                      );
                    }
                  }}
                  disabled={!lang.available}
                >
                  <View style={styles.languageOptionContent}>
                    <Image source={lang.icon} style={styles.languageIcon} />

                    <ThemedText
                      style={[
                        styles.languageOptionText,
                        selectedLanguage === lang.value &&
                          styles.languageOptionTextSelected,
                        !lang.available && styles.languageOptionTextDisabled,
                      ]}
                    >
                      {lang.label}
                    </ThemedText>
                    {!lang.available && (
                      <ThemedText style={styles.comingSoonBadge}>
                        Coming Soon
                      </ThemedText>
                    )}
                    {selectedLanguage === lang.value && lang.available && (
                      <IconSymbol
                        name="checkmark.circle.fill"
                        size={24}
                        color="#4CAF50"
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLanguagePicker(false)}
            >
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="picture"
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.detectionBox} />
            {isRealTimeMode && (
              <View style={styles.realTimeIndicator}>
                <ThemedText style={styles.realTimeText}>LIVE</ThemedText>
              </View>
            )}
          </View>
        </CameraView>
      </View>

      <ThemedView style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, styles.flipButton]}
          onPress={toggleCameraFacing}
        >
          <Image source={flipIcon} style={styles.controlIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            styles.detectButton,
            isDetecting && styles.detectButtonActive,
          ]}
          onPress={handleDetectSign}
          disabled={isDetecting || isRealTimeMode}
        >
          {isDetecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Image source={handIcon} style={styles.controlIconLarge} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            styles.realTimeButton,
            isRealTimeMode && styles.realTimeButtonActive,
          ]}
          onPress={toggleRealTimeMode}
        >
          <Image
            source={isRealTimeMode ? stopIcon : playIcon}
            style={styles.controlIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.clearButton]}
          onPress={clearText}
          disabled={
            !translatedText && !currentSentence && signSequence.length === 0
          }
        >
          <Image source={closeIcon} style={styles.controlIcon} />
        </TouchableOpacity>
      </ThemedView>

      {/* Live Feedback Section */}
      {isRealTimeMode && (
        <ThemedView style={styles.feedbackContainer}>
          {/* Language-specific feedback indicator */}
          {selectedLanguage === "sinhala" ? (
            // Sinhala: Hold steady indicator
            isHoldingSteady ? (
              <View style={styles.holdSteadyIndicator}>
                <ThemedText style={styles.holdSteadyText}>
                  ✅ Hold Steady!
                </ThemedText>
                <View style={styles.progressBar}>
                  <View style={[styles.progressBarFill, { width: "100%" }]} />
                </View>
              </View>
            ) : holdSteadyCount > 0 ? (
              <View style={styles.holdSteadyIndicator}>
                <ThemedText style={styles.holdSteadyText}>
                  📸 Hold steady... {holdSteadyCount}/
                  {DETECTION_CONFIG.REQUIRED_CONSECUTIVE_FRAMES}
                </ThemedText>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${(holdSteadyCount / DETECTION_CONFIG.REQUIRED_CONSECUTIVE_FRAMES) * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null
          ) : selectedLanguage === "asl" ? (
            // ASL: Motion capture indicator (backend handles sequence buffering)
            isHoldingSteady ? (
              <View style={styles.holdSteadyIndicator}>
                <ThemedText style={styles.holdSteadyText}>
                  ✅ Motion Captured!
                </ThemedText>
                <View style={styles.progressBar}>
                  <View style={[styles.progressBarFill, { width: "100%" }]} />
                </View>
              </View>
            ) : holdSteadyCount > 0 ? (
              <View style={styles.holdSteadyIndicator}>
                <ThemedText style={styles.holdSteadyText}>
                  📹 Capturing motion...
                </ThemedText>
                <View style={styles.progressBar}>
                  <View style={[styles.progressBarFill, { width: "50%" }]} />
                </View>
              </View>
            ) : null
          ) : null}

          {/* Current Sentence Being Built */}
          {currentSentence ? (
            <View style={styles.currentSentenceContainer}>
              <ThemedText style={styles.currentSentenceLabel}>
                Building sentence:
              </ThemedText>
              <ThemedText style={styles.currentSentenceText}>
                {currentSentence}
              </ThemedText>
              {/*<View style={styles.signSequenceContainer}>
                {signSequence.map((sign, index) => (
                  <View key={index} style={styles.signChip}>
                    <ThemedText style={styles.signChipText}>{sign}</ThemedText>
                  </View>
                ))}
              </View>*/}
            </View>
          ) : null}

          {/* Detection Feedback */}
          {detectionFeedback ? (
            <ThemedText style={styles.detectionFeedbackText}>
              {detectionFeedback}
            </ThemedText>
          ) : null}
        </ThemedView>
      )}

      {/* Finalized Sentence Display */}
      {translatedText ? (
        <ThemedView style={styles.textContainer}>
          <View style={styles.sectionTitleContainer}>
            <ThemedText style={styles.sectionTitle}>
              Translated Sentence
            </ThemedText>
            <View style={styles.grammarToggleContainer}>
              <ThemedText style={styles.grammarToggleLabel}>Grammar</ThemedText>
              <Switch
                value={grammarCorrectionEnabled}
                onValueChange={setGrammarCorrectionEnabled}
                trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
                thumbColor={grammarCorrectionEnabled ? "#FFFFFF" : "#F3F4F6"}
              />
            </View>
          </View>
          <ThemedView style={styles.textBox}>
            <ThemedText style={styles.translatedText}>
              {grammarCorrectionEnabled
                ? applyGrammarCorrection(translatedText)
                : translatedText}
            </ThemedText>
          </ThemedView>
          <View style={styles.speechButtonContainer}>
            <TouchableOpacity
              style={[
                styles.speechButton,
                isSpeaking && styles.speechButtonActive,
              ]}
              onPress={handleTextToSpeech}
            >
              <IconSymbol
                name={isSpeaking ? "speaker.wave.2.fill" : "speaker.wave.2"}
                size={28}
                color="#fff"
              />
              <ThemedText style={styles.speechButtonText}>
                {isSpeaking ? "Stop Speaking" : "Speak Now "}
              </ThemedText>
            </TouchableOpacity>
          </View>
          {/* {confidence > 0 && (
      <View style={styles.confidenceContainer}>
        <ThemedText style={styles.confidenceLabel}>
          Confidence Level:
        </ThemedText>
        <View style={styles.confidenceBar}>
          <View style={[styles.confidenceBarFill, { width: `${confidence * 100}%` }]} />
        </View>
        <ThemedText style={styles.confidencePercentage}>
          {Math.round(confidence * 100)}%
        </ThemedText>
      </View>
    )}*/}
        </ThemedView>
      ) : !isRealTimeMode && !currentSentence ? (
        <ThemedView style={styles.placeholderContainer}>
          <IconSymbol name="hand.wave" size={48} color="#9CA3AF" />
          <ThemedText style={styles.placeholderText}>
            Show your sign to start translating!
          </ThemedText>
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E8F4F8",
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  header: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  backButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#4B5563",
    marginBottom: 12,
  },
  connectionStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    backgroundColor: "#D1D5DB",
  },
  connectionDotConnected: {
    backgroundColor: "#10B981",
  },
  connectionDotDisconnected: {
    backgroundColor: "#EF4444",
  },
  connectionDotChecking: {
    backgroundColor: "#F59E0B",
  },
  connectionStatusText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  refreshButton: {
    padding: 6,
  },
  languageButton: {
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  languageButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  languageEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  languageIcon: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: 4,
  },
  languageButtonText: {
    fontSize: 16,
    color: "#1F2937",
    flex: 1,
  },
  apiButton: {
    marginBottom: 12,
  },
  apiButtonText: {
    fontSize: 16,
    color: "#3B82F6",
  },
  apiInputContainer: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  apiInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: "#111827",
    marginBottom: 10,
  },
  testButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  testButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  textContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  textBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  translatedText: {
    fontSize: 22, // Increased from 16
    fontWeight: "500",
    color: "#1E293B",
    lineHeight: 28,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
  },
  languageList: {
    marginBottom: 16,
  },
  languageOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
  },
  languageOptionSelected: {
    backgroundColor: "#D1FAE5",
  },
  languageOptionDisabled: {
    backgroundColor: "#F3F4F6",
  },
  languageOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  languageOptionEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  languageOptionText: {
    fontSize: 16,
    color: "#1F2937",
    flex: 1,
  },
  languageOptionTextSelected: {
    fontWeight: "600",
    color: "#065F46",
  },
  languageOptionTextDisabled: {
    color: "#9CA3AF",
  },
  comingSoonBadge: {
    fontSize: 12,
    color: "#F59E0B",
    marginRight: 8,
  },
  closeButton: {
    backgroundColor: "#EF4444",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  cameraContainer: {
    height: 400, // Fixed height to prevent shrinking
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  detectionBox: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#3B82F6",
    borderRadius: 12,
  },
  realTimeIndicator: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  realTimeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
    backgroundColor: "transparent", // transparent background
  },

  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    backgroundColor: "#3B82F6",
  },

  flipButton: {
    backgroundColor: "#0A7EA4",
  },
  detectButton: {
    backgroundColor: "#5452E6",
  },
  detectButtonActive: {
    backgroundColor: "#059669",
  },
  realTimeButton: {
    backgroundColor: "#F59E0B",
  },
  realTimeButtonActive: {
    backgroundColor: "#D97706",
  },
  clearButton: {
    backgroundColor: "#EF4444",
  },

  controlIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
  },
  controlIconLarge: {
    width: 32,
    height: 32,
    tintColor: "#fff",
    resizeMode: "contain",
  },

  feedbackContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: "#FFF7ED", // warm peach background
    borderWidth: 2,
    borderColor: "#FDBA74", // orange border
  },

  holdSteadyIndicator: {
    marginBottom: 8,
  },
  holdSteadyText: {
    fontSize: 14,
    color: "#1F2937",
    marginBottom: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: "#D1D5DB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    backgroundColor: "#10B981",
  },
  detectionFeedbackText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
  },
  currentSentenceContainer: {
    marginTop: 8,
  },
  currentSentenceLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  currentSentenceText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginTop: 4,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  grammarToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grammarToggleLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  speechButtonContainer: {
    alignItems: "center", // Center the button
    marginBottom: 16,
  },
  signSequenceContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  speechButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 200, // Ensures proper button sizing
  },

  speechButtonActive: {
    backgroundColor: "#2563EB",
  },

  speechButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
  },
  signChip: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    marginBottom: 6,
  },
  signChipText: {
    fontSize: 14,
    color: "#0369A1",
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 12,
  },
  message: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#3B82F6",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  confidenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    padding: 12,
  },

  confidenceLabel: {
    fontSize: 14,
    color: "#64748B",
    marginRight: 12,
  },

  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
    marginRight: 12,
  },

  confidenceBarFill: {
    height: 8,
    backgroundColor: "#10B981",
    borderRadius: 4,
  },

  confidencePercentage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#047857",
    minWidth: 40,
  },

  placeholderContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    marginBottom: 16,
  },

  placeholderText: {
    fontSize: 18,
    color: "#64748B",
    marginTop: 12,
    textAlign: "center",
  },
});
