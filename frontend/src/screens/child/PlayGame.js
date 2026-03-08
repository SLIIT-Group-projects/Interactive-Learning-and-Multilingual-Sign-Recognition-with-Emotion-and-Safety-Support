import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../contexts/AuthContext";
import {
  updateLetterPerformance,
  saveGameSession,
} from "../../services/firestore/gameService";
import {
  getChildProgress,
  ensureChildProgress,
  addXP,
  incrementGamesPlayed,
} from "../../services/firestore/childProgressService";
import XPProgressBar from "../../components/XPProgressBar";

import {
  ALPHABET,
  OBJECTS,
  TOTAL_QUESTIONS,
} from "../../constants/gameConstants";

const PlayGame = ({ navigation, route }) => {
  const gameMode = route?.params?.gameMode || "basic";

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [targetLetter, setTargetLetter] = useState("");
  const [currentObject, setCurrentObject] = useState(null);
  const [questionType, setQuestionType] = useState("letter"); // 'letter' or 'object'
  const [feedback, setFeedback] = useState(null); // null, 'correct', or 'incorrect'
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [predictedLetter, setPredictedLetter] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef(null);
  const autoAdvanceTimeoutRef = useRef(null);

  // XP & level (child progress)
  const [childProgress, setChildProgress] = useState(null);
  const [xpGainedThisAnswer, setXpGainedThisAnswer] = useState(0);
  const [streakBonusThisAnswer, setStreakBonusThisAnswer] = useState(false);
  const [levelUpModal, setLevelUpModal] = useState(null); // { level } when level up

  // Firestore tracking states
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [gameStartTime, setGameStartTime] = useState(null);
  const { userData, childProgress: contextProgress, refreshChildProgress } = useAuth();

  // Get child and parent IDs from authenticated user
  const childId = userData?.uid || null;
  const parentId = userData?.parentId || null;

  // API endpoint - update this to your server IP/URL
  const API_URL = __DEV__
    ? "http://192.168.1.2:5000" // Your laptop's IP address with port
    : "http://192.168.1.2:5000"; // For production (same IP)

  // Stable camera ref callback - must be at top level (Rules of Hooks)
  const handleCameraRef = useCallback(
    (ref) => {
      if (ref) {
        cameraRef.current = ref;
        // Use setTimeout to avoid state update during render
        setTimeout(() => {
          setCameraReady(true);
        }, 0);
        console.log("Camera ref attached successfully");
      } else {
        // Only detach if we're not currently capturing
        if (!isCapturing && !isProcessing) {
          cameraRef.current = null;
          setCameraReady(false);
          console.log("Camera ref detached");
        } else {
          console.log("Camera ref detached but capture in progress, ignoring");
        }
      }
    },
    [isCapturing, isProcessing],
  );

  // Use child progress from context (fetched on login), or load once
  useEffect(() => {
    if (contextProgress && contextProgress.id === childId) {
      setChildProgress(contextProgress);
      return;
    }
    const load = async () => {
      if (childId) {
        try {
          const p = await ensureChildProgress(childId);
          setChildProgress(p);
        } catch (e) {
          console.warn("Failed to load child progress:", e);
        }
      }
    };
    load();
  }, [childId, contextProgress]);

  // Initialize first question
  useEffect(() => {
    setGameStartTime(Date.now());
    generateNewQuestion();
    testAPIConnection();
  }, []);

  // Test API connection
  const testAPIConnection = async () => {
    try {
      console.log(`Testing API connection to: ${API_URL}/health`);
      const response = await fetch(`${API_URL}/health`, {
        method: "GET",
        timeout: 5000,
      });
      const data = await response.json();
      console.log("API connection test:", data);
    } catch (error) {
      console.warn("API connection test failed:", error.message);
      console.warn("This is normal if server is not running yet");
    }
  };

  const generateNewQuestion = () => {
    // Only letter questions - no object questions
    setQuestionType("letter");
    setHasAnswered(false);
    setFeedback(null);
    setIsCapturing(false);
    setQuestionStartTime(Date.now()); // Track when question starts for response time

    // Random letter question
    const randomLetter =
      ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    setTargetLetter(randomLetter);
    setCurrentObject(null);
  };

  const handleCapture = async () => {
    // Check permission first
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Permission Required",
          "Camera permission is needed to capture gestures",
        );
        return;
      }
    }

    // Check camera ref and ready state - wait if needed
    let retries = 0;
    while ((!cameraReady || !cameraRef.current) && retries < 5) {
      console.log(
        `Camera check attempt ${
          retries + 1
        }: Ready=${cameraReady}, Ref=${!!cameraRef.current}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    if (!cameraReady || !cameraRef.current) {
      console.error("Camera still not ready after retries");
      Alert.alert(
        "Camera Not Ready",
        "Please wait for the camera to fully initialize. Make sure the camera view is visible on screen.",
      );
      return;
    }

    console.log("Camera ready! Proceeding with capture...");

    // Hide capture button immediately
    setIsCapturing(true);
    
    // Don't set other state immediately - it causes re-render that detaches camera
    // Set these after capture starts
    setPredictedLetter(null);

    try {
      // Take a photo using CameraView's takePictureAsync method
      // Note: In expo-camera v16+, the method is available on the ref
      let photo;

      if (!cameraRef.current) {
        throw new Error("Camera ref is not available");
      }

      // Try to capture photo - expo-camera v16+ uses takePictureAsync
      try {
        // CRITICAL: Capture the ref value immediately to avoid it being detached during async operations
        const camera = cameraRef.current;
        if (!camera) {
          throw new Error("Camera ref is null - camera not initialized");
        }

        console.log("Camera ref captured, attempting capture...");
        console.log("Camera type:", typeof camera);

        // In expo-camera v16, takePictureAsync should be available
        // Use the captured camera reference, not cameraRef.current (which might be detached)
        const refMethods = camera ? Object.keys(camera) : [];
        console.log("Available ref methods:", refMethods);
        console.log("takePictureAsync exists:", typeof camera.takePictureAsync);

        // Use the main camera ref directly - DON'T use _cameraRef as that's the native ref
        // The takePictureAsync method is on the CameraView component itself
        const actualCamera = camera;

        // Log what we're about to use
        console.log("Using camera object:", {
          hasTakePictureAsync:
            typeof actualCamera.takePictureAsync === "function",
          type: typeof actualCamera,
          keys: Object.keys(actualCamera).slice(0, 10), // First 10 keys
        });

        // Try takePictureAsync first - this should be on the CameraView component
        if (typeof actualCamera.takePictureAsync === "function") {
          console.log(
            "Using takePictureAsync on:",
            actualCamera === camera ? "main ref" : "internal ref",
          );
          try {
            // Wait longer to ensure camera is fully stable and ready
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Double-check camera is still available
            const currentCamera = actualCamera;
            if (
              !currentCamera ||
              typeof currentCamera.takePictureAsync !== "function"
            ) {
              throw new Error("Camera became unavailable during wait");
            }

            console.log("Attempting capture now...");

            // CRITICAL: Capture photo BEFORE any state updates to prevent re-render
            // State updates cause re-renders which detach the camera
            console.log("Capturing photo (before state updates)...");
            photo = await currentCamera.takePictureAsync({
              quality: 0.8,
            });

            // Now safe to update processing state - photo is captured
            // isCapturing was already set earlier to hide the button
            setIsProcessing(true);

            if (!photo) {
              throw new Error("takePictureAsync returned null/undefined");
            }

            console.log("Photo captured! URI:", photo.uri);
            console.log("Photo object keys:", Object.keys(photo));

            // Read base64 from file - this is more reliable on Android
            if (photo.uri) {
              console.log("Reading base64 from file...");
              const fileInfo = await FileSystem.getInfoAsync(photo.uri);
              if (fileInfo.exists) {
                const base64Data = await FileSystem.readAsStringAsync(
                  photo.uri,
                  {
                    encoding: FileSystem.EncodingType.Base64,
                  },
                );
                photo.base64 = base64Data;
                console.log(
                  "Base64 read successfully, length:",
                  base64Data.length,
                );
              } else {
                throw new Error(
                  "Photo file does not exist at URI: " + photo.uri,
                );
              }
            } else {
              throw new Error("Photo captured but no URI returned");
            }
          } catch (takePictureError) {
            console.error(
              "takePictureAsync with base64 failed:",
              takePictureError,
            );
            console.error("Error details:", {
              code: takePictureError.code,
              message: takePictureError.message,
              name: takePictureError.name,
            });

            // Try without base64 option - capture to file first
            console.log(
              "Retrying without base64 option (will read from file)...",
            );
            try {
              // Wait a bit more before retry to let camera stabilize
              await new Promise((resolve) => setTimeout(resolve, 300));

              // Use actualCamera if we found an internal ref
              const cameraToUse = actualCamera || camera;
              console.log(
                "Attempting capture with:",
                cameraToUse === camera ? "main ref" : "internal ref",
              );

              const photoWithoutBase64 = await cameraToUse.takePictureAsync({
                quality: 0.8,
              });

              console.log("Photo captured, full object:", photoWithoutBase64);
              console.log("Photo URI:", photoWithoutBase64?.uri);
              console.log(
                "Photo keys:",
                photoWithoutBase64
                  ? Object.keys(photoWithoutBase64)
                  : "undefined",
              );

              // If we got a photo without base64, read it from URI
              if (photoWithoutBase64 && photoWithoutBase64.uri) {
                console.log("Reading base64 from file URI...");
                const fileInfo = await FileSystem.getInfoAsync(
                  photoWithoutBase64.uri,
                );
                if (fileInfo.exists) {
                  const base64Data = await FileSystem.readAsStringAsync(
                    photoWithoutBase64.uri,
                    {
                      encoding: FileSystem.EncodingType.Base64,
                    },
                  );
                  photo = {
                    ...photoWithoutBase64,
                    base64: base64Data,
                  };
                  console.log(
                    "Photo read from URI successfully, base64 length:",
                    base64Data.length,
                  );
                } else {
                  throw new Error(
                    "Photo file does not exist at URI: " +
                      photoWithoutBase64.uri,
                  );
                }
              } else {
                throw new Error(
                  "No URI in photo object: " +
                    JSON.stringify(photoWithoutBase64),
                );
              }
            } catch (retryError) {
              console.error("Retry also failed:", retryError);
              throw new Error(
                `Failed to capture image: ${takePictureError.message}. Retry also failed: ${retryError.message}`,
              );
            }
          }
        } else if (typeof actualCamera.takePicture === "function") {
          // Fallback to takePicture if available
          console.log("Using takePicture (fallback)...");
          photo = await actualCamera.takePicture({
            quality: 0.8,
            base64: true,
          });
          console.log("Photo captured via takePicture");
        } else {
          // Log everything for debugging
          console.error("Camera object:", camera);
          console.error("Camera prototype:", Object.getPrototypeOf(camera));
          console.error(
            "All camera properties:",
            Object.getOwnPropertyNames(camera || {}),
          );
          throw new Error(
            "No capture method found. Available: " + refMethods.join(", "),
          );
        }
      } catch (captureError) {
        console.error("Camera capture error:", captureError);
        console.error("Error details:", {
          message: captureError.message,
          stack: captureError.stack,
          name: captureError.name,
        });
        throw new Error(`Failed to capture image: ${captureError.message}`);
      }

      console.log("Photo captured:", photo ? "Success" : "Failed");
      console.log("Photo keys:", photo ? Object.keys(photo) : "No photo");

      if (!photo) {
        throw new Error("No photo returned from camera");
      }

      // Check for base64 in different possible locations
      let base64Data = photo.base64;

      // If base64 is not directly available, try to read from URI
      if (!base64Data && photo.uri) {
        try {
          console.log("Reading base64 from file URI:", photo.uri);
          // Try to read file and convert to base64
          const fileInfo = await FileSystem.getInfoAsync(photo.uri);
          if (fileInfo.exists) {
            base64Data = await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            console.log("Successfully read base64 from file");
          } else {
            console.error("File does not exist:", photo.uri);
          }
        } catch (readError) {
          console.error("Error reading file:", readError);
        }
      }

      if (!base64Data) {
        console.error(
          "Photo object keys:",
          photo ? Object.keys(photo) : "No photo",
        );
        console.error("Photo URI:", photo?.uri);
        throw new Error(
          "Photo captured but base64 encoding failed. Check console logs for details.",
        );
      }

      // Send to API for prediction
      console.log(`Sending request to: ${API_URL}/check`);
      const response = await fetch(`${API_URL}/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${base64Data}`,
          targetLetter: targetLetter,
        }),
        timeout: 30000, // 30 second timeout
      }).catch((fetchError) => {
        console.error("Fetch error details:", fetchError);
        throw new Error(
          `Network error: ${fetchError.message}. Make sure API server is running at ${API_URL}`,
        );
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API response error:", errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Don't reset isCapturing here - keep button hidden until next question
      setIsProcessing(false);

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to process gesture");
        return;
      }

      // Update UI with results
      setPredictedLetter(result.predictedLetter);

      // Calculate response time for Firestore
      const responseTime = questionStartTime
        ? Date.now() - questionStartTime
        : 0;

      // Update letter performance in Firestore
      if (childId && parentId) {
        try {
          await updateLetterPerformance(
            childId,
            parentId,
            targetLetter,
            result.isCorrect,
            responseTime,
          );
          console.log(
            `✅ Letter performance updated: ${targetLetter} - ${result.isCorrect ? "Correct" : "Incorrect"}`,
          );
        } catch (error) {
          console.warn("⚠️ Failed to update letter performance:", error);
          // Don't block UI if Firestore fails
        }
      }

      if (result.isCorrect) {
        setFeedback("correct");
        setScore(score + 1);
      } else {
        setFeedback("incorrect");
      }

      // XP system: correct +20, wrong +0; 5 in a row +50 bonus
      if (childId) {
        try {
          const confidence = result.confidence ?? 0;
          const { progress, xpGained, leveledUp, newLevel } = await addXP(childId, {
            correct: result.isCorrect,
            confidence,
          });
          setXpGainedThisAnswer(xpGained);
          setStreakBonusThisAnswer(xpGained >= 50);
          setChildProgress(progress);
          refreshChildProgress?.(); // keep context in sync
          if (leveledUp && newLevel) {
            setLevelUpModal({ level: newLevel });
          }
        } catch (err) {
          console.warn("XP update failed:", err);
        }
      }

      setHasAnswered(true);

      // Auto-advance to next question if correct (after showing feedback for 1.5 seconds)
      if (result.isCorrect) {
        // Clear any existing timeout
        if (autoAdvanceTimeoutRef.current) {
          clearTimeout(autoAdvanceTimeoutRef.current);
        }
        autoAdvanceTimeoutRef.current = setTimeout(() => {
          handleNextQuestion();
          autoAdvanceTimeoutRef.current = null;
        }, 1500);
      }
    } catch (error) {
      console.error("Error capturing/processing:", error);
      console.error("Error stack:", error.stack);
      setIsCapturing(false);
      setIsProcessing(false);

      const errorMessage = error.message || "Unknown error";

      // Check if it's a camera error or API error
      if (
        errorMessage.includes("Failed to capture") ||
        errorMessage.includes("Camera") ||
        errorMessage.includes("photo")
      ) {
        // Camera error
        Alert.alert(
          "Camera Error",
          `Failed to capture image.\n\nError: ${errorMessage}\n\nPlease try again. Make sure:\n- Camera permission is granted\n- Camera is not being used by another app`,
          [{ text: "OK" }],
        );
      } else if (
        errorMessage.includes("Network error") ||
        errorMessage.includes("API") ||
        errorMessage.includes("fetch")
      ) {
        // API/Network error
        Alert.alert(
          "API Connection Error",
          `Could not connect to API server.\n\nServer URL: ${API_URL}\n\nMake sure:\n1. API server is running: python backend/models/games/api_server.py\n2. Test in browser: ${API_URL}/health\n3. Phone and laptop on same WiFi\n\nError: ${errorMessage}`,
          [{ text: "OK" }],
        );
      } else {
        // Other error
        Alert.alert(
          "Error",
          `Failed to process gesture.\n\nError: ${errorMessage}`,
        );
      }
    }
  };

  const handleTryAgain = () => {
    // Clear any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    
    setFeedback(null);
    setHasAnswered(false);
    setIsCapturing(false);
  };

  const handleNextQuestion = async () => {
    // Clear any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    
    setXpGainedThisAnswer(0);
    setStreakBonusThisAnswer(false);

    if (currentQuestion < TOTAL_QUESTIONS - 1) {
      setCurrentQuestion(currentQuestion + 1);
      generateNewQuestion();
    } else {
      const totalTime = gameStartTime
        ? Math.floor((Date.now() - gameStartTime) / 1000)
        : 0;

      if (childId) {
        try {
          await incrementGamesPlayed(childId);
        } catch (e) {
          console.warn("incrementGamesPlayed failed:", e);
        }
      }

      if (childId && parentId) {
        try {
          await saveGameSession({
            childId,
            parentId,
            gameMode: gameMode,
            totalQuestions: TOTAL_QUESTIONS,
            correctAnswers: score,
            timeTaken: totalTime,
            difficultyLevel: "medium",
          });
        } catch (error) {
          console.warn("⚠️ Failed to save game session:", error);
        }
      }

      Alert.alert(
        "Game Complete!",
        `Great job! You got ${score} correct. Keep playing to earn more XP and level up!`,
        [{ text: "OK", onPress: () => {} }]
      );

      setCurrentQuestion(0);
      setScore(0);
      setGameStartTime(Date.now());
      generateNewQuestion();
      if (childId) {
        try {
          const p = await refreshChildProgress?.() ?? getChildProgress(childId);
          if (p) setChildProgress(p);
        } catch (e) {}
      }
    }
  };

  const handleBack = () => {
    if (navigation && navigation.goBack) {
      navigation.goBack();
    } else {
      console.log("Navigate back to Child Dashboard");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Full-Screen Camera */}
        <View className="flex-1 bg-black">
          {!permission?.granted ? (
            <View className="flex-1 items-center justify-center p-8 bg-gray-900">
              <Text className="text-6xl mb-4">📷</Text>
              <Text className="text-xl font-semibold text-white mb-2 text-center">
                Camera Permission Required
              </Text>
              <Text className="text-sm text-gray-400 text-center mb-4">
                We need camera access to recognize your gestures
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                className="bg-blue-500 rounded-xl px-6 py-3"
              >
                <Text className="text-white font-bold">Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : isProcessing ? (
            <View className="flex-1 items-center justify-center bg-black">
              <ActivityIndicator size="large" color="#ffffff" />
              <Text className="text-xl font-semibold text-white mt-4">
                Processing gesture...
              </Text>
            </View>
          ) : (
            <CameraView
              ref={handleCameraRef}
              style={{ flex: 1 }}
              facing="front"
              enableTorch={false}
              onCameraReady={() => {
                console.log("Camera is ready");
                setCameraReady(true);
              }}
            >
              {/* Overlay: Target Letter with Question Counter (Top-Left, below back button) */}
              <View className="absolute top-20 left-4 bg-black/70 rounded-2xl px-4 py-3 items-center">
                <Text className="text-xs text-white/80 mb-1">Show the sign for</Text>
                <Text className="text-5xl font-bold text-white">
                  {targetLetter}
                </Text>
                {/* Question Counter inside sign badge */}
                <View className="mt-2 bg-white/20 rounded-full px-3 py-1">
                  <Text className="text-white font-semibold text-xs">
                    {currentQuestion + 1} / {TOTAL_QUESTIONS}
                  </Text>
                </View>
              </View>

              {/* Overlay: Back Button (Top-Left) */}
              <TouchableOpacity
                onPress={handleBack}
                className="absolute top-4 left-4 bg-black/70 rounded-full p-2"
                activeOpacity={0.7}
              >
                <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
              </TouchableOpacity>

              {/* Overlay: XP Progress (Top-Right, same level as back button) */}
              {childProgress && (
                <View className="absolute top-4 right-4">
                  <View className="bg-black/70 rounded-full px-3 py-1.5">
                    <Text className="text-white text-xs font-semibold">
                      Level {childProgress.level} • {childProgress.totalXP} XP
                    </Text>
                  </View>
                </View>
              )}
            </CameraView>
          )}
        </View>

        {/* Overlay: Floating Capture Button (Bottom Center) */}
        {!hasAnswered && permission?.granted && !isProcessing && !isCapturing && (
          <View className="absolute bottom-8 left-0 right-0 items-center px-6">
            <TouchableOpacity
              onPress={handleCapture}
              disabled={
                isCapturing ||
                isProcessing ||
                !permission?.granted ||
                !cameraReady
              }
              className="bg-blue-500 rounded-full p-5 shadow-2xl"
              activeOpacity={0.8}
              style={[
                {
                  width: 80,
                  height: 80,
                  justifyContent: 'center',
                  alignItems: 'center',
                },
                (isCapturing ||
                  isProcessing ||
                  !permission?.granted ||
                  !cameraReady) &&
                  styles.disabledButton,
              ]}
            >
              {isCapturing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <MaterialIcons
                  name="camera-alt"
                  size={36}
                  color="#ffffff"
                />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Overlay: Feedback Toast (Bottom, above capture button) */}
        {feedback && (
          <View className="absolute bottom-28 left-4 right-4">
            <View
              className={`rounded-2xl p-4 items-center shadow-2xl ${
                feedback === "correct" ? "bg-green-500" : "bg-red-500"
              }`}
            >
              {feedback === "correct" ? (
                <>
                  <MaterialIcons
                    name="check-circle"
                    size={40}
                    color="#ffffff"
                  />
                  <Text className="text-lg font-bold text-white mt-2 text-center">
                    Correct! Well done!
                  </Text>
                  {predictedLetter && (
                    <Text className="text-sm text-white/90 mt-1">
                      You signed: {predictedLetter}
                    </Text>
                  )}
                  {xpGainedThisAnswer > 0 && (
                    <Text className="text-sm font-bold text-white mt-1">
                      +{xpGainedThisAnswer} XP
                      {streakBonusThisAnswer ? " (5 in a row!)" : ""}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <MaterialIcons
                    name="cancel"
                    size={40}
                    color="#ffffff"
                  />
                  <Text className="text-lg font-bold text-white mt-2 text-center">
                    Try again!
                  </Text>
                  {predictedLetter && (
                    <Text className="text-sm text-white/90 mt-1 text-center">
                      You: {predictedLetter} • Expected: {targetLetter}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* Overlay: Action Buttons (Bottom, only for incorrect answers) */}
        {hasAnswered && feedback === "incorrect" && (
          <View className="absolute bottom-8 left-0 right-0 px-6">
            <View className="flex-row justify-between">
              <TouchableOpacity
                onPress={handleTryAgain}
                className="bg-orange-500 rounded-full px-6 py-3 flex-1 mr-2 shadow-lg"
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-center">
                  <MaterialIcons
                    name="refresh"
                    size={24}
                    color="#ffffff"
                    style={{ marginRight: 6 }}
                  />
                  <Text className="text-base font-bold text-white">
                    Try Again
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNextQuestion}
                className="bg-green-500 rounded-full px-6 py-3 flex-1 ml-2 shadow-lg"
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-center">
                  <Text className="text-base font-bold text-white mr-2">
                    Next
                  </Text>
                  <MaterialIcons
                    name="arrow-forward"
                    size={24}
                    color="#ffffff"
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Level-up modal */}
        <Modal
          visible={!!levelUpModal}
          transparent
          animationType="fade"
          onRequestClose={() => setLevelUpModal(null)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center px-6">
            <View className="bg-white rounded-3xl p-8 items-center shadow-xl max-w-sm">
              <MaterialIcons name="celebration" size={64} color="#7c3aed" style={{ marginBottom: 16 }} />
              <Text className="text-2xl font-bold text-gray-800 text-center">Level Up!</Text>
              <Text className="text-4xl font-bold text-violet-600 mt-2">Level {levelUpModal?.level}</Text>
              <Text className="text-gray-500 text-center mt-2">New games unlocked!</Text>
              <TouchableOpacity
                onPress={() => setLevelUpModal(null)}
                className="bg-violet-500 rounded-xl px-8 py-3 mt-6"
              >
                <Text className="text-white font-bold text-lg">Awesome!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  captureButton: {
    backgroundColor: "#3b82f6", // blue-500
    minHeight: 70,
  },
  actionButton: {
    minHeight: 60,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default PlayGame;
