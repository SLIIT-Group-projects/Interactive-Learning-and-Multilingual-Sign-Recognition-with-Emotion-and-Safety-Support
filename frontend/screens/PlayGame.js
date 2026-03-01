import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import {
  updateLetterPerformance,
  saveGameSession,
} from "../services/gameService";

const ALPHABET = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
const OBJECTS = [
  { icon: "apple", iconFamily: "MaterialIcons", letter: "A", name: "Apple" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "B", name: "Bear" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "C", name: "Cat" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "D", name: "Dog" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "E", name: "Elephant" },
  { icon: "water", iconFamily: "MaterialIcons", letter: "F", name: "Fish" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "G", name: "Giraffe" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "H", name: "Horse" },
  { icon: "icecream", iconFamily: "MaterialIcons", letter: "I", name: "Ice Cream" },
  { icon: "water", iconFamily: "MaterialIcons", letter: "J", name: "Jellyfish" },
  { icon: "kitesurfing", iconFamily: "MaterialIcons", letter: "K", name: "Kite" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "L", name: "Lion" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "M", name: "Monkey" },
  { icon: "nightlight", iconFamily: "MaterialIcons", letter: "N", name: "Night" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "O", name: "Owl" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "P", name: "Penguin" },
  { icon: "star", iconFamily: "MaterialIcons", letter: "Q", name: "Queen" },
  { icon: "wb-sunny", iconFamily: "MaterialIcons", letter: "R", name: "Rainbow" },
  { icon: "star", iconFamily: "MaterialIcons", letter: "S", name: "Star" },
  { icon: "park", iconFamily: "MaterialIcons", letter: "T", name: "Tree" },
  { icon: "umbrella", iconFamily: "MaterialIcons", letter: "U", name: "Umbrella" },
  { icon: "local-shipping", iconFamily: "MaterialIcons", letter: "V", name: "Van" },
  { icon: "water", iconFamily: "MaterialIcons", letter: "W", name: "Water" },
  { icon: "close", iconFamily: "MaterialIcons", letter: "X", name: "X-ray" },
  { icon: "toys", iconFamily: "MaterialIcons", letter: "Y", name: "Yoyo" },
  { icon: "pets", iconFamily: "MaterialIcons", letter: "Z", name: "Zebra" },
];

const TOTAL_QUESTIONS = 10;

const PlayGame = ({ navigation }) => {
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
  
  // Firestore tracking states
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [gameStartTime, setGameStartTime] = useState(null);
  const { userData } = useAuth();
  
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
    [isCapturing, isProcessing]
  );

  // Initialize first question
  useEffect(() => {
    // Initialize game start time
    setGameStartTime(Date.now());
    generateNewQuestion();

    // Test API connection on mount
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
    // Randomly choose question type
    const type = Math.random() > 0.5 ? "letter" : "object";
    setQuestionType(type);
    setHasAnswered(false);
    setFeedback(null);
    setIsCapturing(false);
    setQuestionStartTime(Date.now()); // Track when question starts for response time

    if (type === "letter") {
      // Random letter question
      const randomLetter =
        ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      setTargetLetter(randomLetter);
      setCurrentObject(null);
    } else {
      // Object question
      const randomObject = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
      setCurrentObject(randomObject);
      setTargetLetter(randomObject.letter);
    }
  };

  const handleCapture = async () => {
    // Check permission first
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Permission Required",
          "Camera permission is needed to capture gestures"
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
        }: Ready=${cameraReady}, Ref=${!!cameraRef.current}`
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    if (!cameraReady || !cameraRef.current) {
      console.error("Camera still not ready after retries");
      Alert.alert(
        "Camera Not Ready",
        "Please wait for the camera to fully initialize. Make sure the camera view is visible on screen."
      );
      return;
    }

    console.log("Camera ready! Proceeding with capture...");

    // Don't set state immediately - it causes re-render that detaches camera
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
            actualCamera === camera ? "main ref" : "internal ref"
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

            // Now safe to update state - photo is captured
            setIsCapturing(true);
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
                  }
                );
                photo.base64 = base64Data;
                console.log(
                  "Base64 read successfully, length:",
                  base64Data.length
                );
              } else {
                throw new Error(
                  "Photo file does not exist at URI: " + photo.uri
                );
              }
            } else {
              throw new Error("Photo captured but no URI returned");
            }
          } catch (takePictureError) {
            console.error(
              "takePictureAsync with base64 failed:",
              takePictureError
            );
            console.error("Error details:", {
              code: takePictureError.code,
              message: takePictureError.message,
              name: takePictureError.name,
            });

            // Try without base64 option - capture to file first
            console.log(
              "Retrying without base64 option (will read from file)..."
            );
            try {
              // Wait a bit more before retry to let camera stabilize
              await new Promise((resolve) => setTimeout(resolve, 300));

              // Use actualCamera if we found an internal ref
              const cameraToUse = actualCamera || camera;
              console.log(
                "Attempting capture with:",
                cameraToUse === camera ? "main ref" : "internal ref"
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
                  : "undefined"
              );

              // If we got a photo without base64, read it from URI
              if (photoWithoutBase64 && photoWithoutBase64.uri) {
                console.log("Reading base64 from file URI...");
                const fileInfo = await FileSystem.getInfoAsync(
                  photoWithoutBase64.uri
                );
                if (fileInfo.exists) {
                  const base64Data = await FileSystem.readAsStringAsync(
                    photoWithoutBase64.uri,
                    {
                      encoding: FileSystem.EncodingType.Base64,
                    }
                  );
                  photo = {
                    ...photoWithoutBase64,
                    base64: base64Data,
                  };
                  console.log(
                    "Photo read from URI successfully, base64 length:",
                    base64Data.length
                  );
                } else {
                  throw new Error(
                    "Photo file does not exist at URI: " +
                      photoWithoutBase64.uri
                  );
                }
              } else {
                throw new Error(
                  "No URI in photo object: " +
                    JSON.stringify(photoWithoutBase64)
                );
              }
            } catch (retryError) {
              console.error("Retry also failed:", retryError);
              throw new Error(
                `Failed to capture image: ${takePictureError.message}. Retry also failed: ${retryError.message}`
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
            Object.getOwnPropertyNames(camera || {})
          );
          throw new Error(
            "No capture method found. Available: " + refMethods.join(", ")
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
          photo ? Object.keys(photo) : "No photo"
        );
        console.error("Photo URI:", photo?.uri);
        throw new Error(
          "Photo captured but base64 encoding failed. Check console logs for details."
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
          `Network error: ${fetchError.message}. Make sure API server is running at ${API_URL}`
        );
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API response error:", errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      setIsCapturing(false);
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
            responseTime
          );
          console.log(`✅ Letter performance updated: ${targetLetter} - ${result.isCorrect ? 'Correct' : 'Incorrect'}`);
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

      setHasAnswered(true);
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
          [{ text: "OK" }]
        );
      } else if (
        errorMessage.includes("Network error") ||
        errorMessage.includes("API") ||
        errorMessage.includes("fetch")
      ) {
        // API/Network error
        Alert.alert(
          "API Connection Error",
          `Could not connect to API server.\n\nServer URL: ${API_URL}\n\nMake sure:\n1. API server is running: python Model/api_server.py\n2. Test in browser: ${API_URL}/health\n3. Phone and laptop on same WiFi\n\nError: ${errorMessage}`,
          [{ text: "OK" }]
        );
      } else {
        // Other error
        Alert.alert(
          "Error",
          `Failed to process gesture.\n\nError: ${errorMessage}`
        );
      }
    }
  };

  const handleTryAgain = () => {
    setFeedback(null);
    setHasAnswered(false);
    setIsCapturing(false);
  };

  const handleNextQuestion = async () => {
    if (currentQuestion < TOTAL_QUESTIONS - 1) {
      setCurrentQuestion(currentQuestion + 1);
      generateNewQuestion();
    } else {
      // Game complete - save session to Firestore
      const totalTime = gameStartTime 
        ? Math.floor((Date.now() - gameStartTime) / 1000)
        : 0;

      if (childId && parentId) {
        try {
          await saveGameSession({
            childId: childId,
            parentId: parentId,
            gameMode: "practice", // You can make this dynamic later
            totalQuestions: TOTAL_QUESTIONS,
            correctAnswers: score,
            timeTaken: totalTime,
            difficultyLevel: "medium", // You can make this dynamic later
          });
          console.log("✅ Game session saved to Firestore", { childId, parentId });
        } catch (error) {
          console.warn("⚠️ Failed to save game session:", error);
          console.warn("Session data:", { childId, parentId, score, totalTime });
        }
      } else {
        console.warn("⚠️ Cannot save game session - missing IDs:", { 
          childId: childId || 'MISSING', 
          parentId: parentId || 'MISSING',
          userData: userData ? { uid: userData.uid, role: userData.role, parentId: userData.parentId } : 'MISSING'
        });
      }

      alert(`Game Complete! Your score: ${score} / ${TOTAL_QUESTIONS}`);
      
      // Reset game
      setCurrentQuestion(0);
      setScore(0);
      setGameStartTime(Date.now());
      generateNewQuestion();
    }
  };

  const handleBack = () => {
    if (navigation && navigation.goBack) {
      navigation.goBack();
    } else {
      console.log("Navigate back to Child Dashboard");
    }
  };

  const progressPercentage = ((currentQuestion + 1) / TOTAL_QUESTIONS) * 100;

  return (
    <SafeAreaView className="flex-1 bg-purple-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={handleBack}
              className="mr-4 p-2"
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={32} color="#374151" />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-gray-800">Play Game</Text>
          </View>
        </View>

        {/* Score & Progress Indicator */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
          <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center">
              <MaterialIcons name="star" size={28} color="#fbbf24" style={{ marginRight: 8 }} />
              <Text className="text-xl font-bold text-gray-800">
                Score: {score} / {TOTAL_QUESTIONS}
              </Text>
            </View>
            <Text className="text-lg font-semibold text-gray-600">
              Question {currentQuestion + 1} / {TOTAL_QUESTIONS}
            </Text>
          </View>

          {/* Progress Bar */}
          <View className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full bg-purple-500 rounded-full"
              style={{
                width: `${progressPercentage}%`,
              }}
            />
          </View>
        </View>

        {/* Game Prompt Area */}
        <View className="bg-white rounded-3xl p-8 mb-6 shadow-lg items-center">
          {questionType === "letter" ? (
            <>
              <Text className="text-2xl font-semibold text-gray-700 mb-4 text-center">
                Show the sign for:
              </Text>
              <Text className="text-8xl font-bold text-purple-600">
                {targetLetter}
              </Text>
            </>
          ) : (
            <>
              <View className="mb-4">
                {currentObject?.iconFamily === 'MaterialIcons' ? (
                  <MaterialIcons name={currentObject?.icon} size={80} color="#8b5cf6" />
                ) : (
                  <MaterialIcons name={currentObject?.icon} size={80} color="#8b5cf6" />
                )}
              </View>
              <Text className="text-2xl font-semibold text-gray-700 mb-2 text-center">
                What letter does this start with?
              </Text>
              <Text className="text-xl text-gray-500">
                {currentObject?.name}
              </Text>
            </>
          )}
        </View>

        {/* Camera Preview Area */}
        <View
          className="bg-gray-800 rounded-3xl mb-6 shadow-lg overflow-hidden"
          style={{ minHeight: 300 }}
        >
          {!permission?.granted ? (
            <View
              className="items-center justify-center p-8"
              style={{ minHeight: 300 }}
            >
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
            <View
              className="items-center justify-center p-8"
              style={{ minHeight: 300 }}
            >
              <ActivityIndicator size="large" color="#ffffff" />
              <Text className="text-xl font-semibold text-white mt-4">
                Processing gesture...
              </Text>
            </View>
          ) : (
            <CameraView
              ref={handleCameraRef}
              style={{ flex: 1, minHeight: 300 }}
              facing="front"
              onCameraReady={() => {
                console.log("Camera is ready");
                setCameraReady(true);
              }}
            >
              <View className="absolute inset-0 items-center justify-center">
                <View
                  className="border-4 border-white rounded-3xl"
                  style={{ width: 250, height: 250 }}
                />
                <Text className="text-white font-semibold mt-4 bg-black/50 px-4 py-2 rounded">
                  Position your hand in the frame
                </Text>
              </View>
            </CameraView>
          )}
        </View>

        {/* Feedback Section */}
        {feedback && (
          <View
            className={`rounded-2xl p-5 mb-4 items-center shadow-md ${
              feedback === "correct" ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {feedback === "correct" ? (
              <>
                <MaterialIcons name="check-circle" size={64} color="#10b981" style={{ marginBottom: 8 }} />
                <Text className="text-2xl font-bold text-green-800 text-center">
                  Correct! Well done!
                </Text>
                {predictedLetter && (
                  <Text className="text-lg text-green-700 mt-2">
                    You signed: {predictedLetter}
                  </Text>
                )}
              </>
            ) : (
              <>
                <MaterialIcons name="cancel" size={64} color="#ef4444" style={{ marginBottom: 8 }} />
                <Text className="text-2xl font-bold text-red-800 text-center">
                  Try again! You can do it!
                </Text>
                {predictedLetter && (
                  <Text className="text-lg text-red-700 mt-2">
                    You signed: {predictedLetter} (Expected: {targetLetter})
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View className="mb-4">
          {!hasAnswered ? (
            <TouchableOpacity
              onPress={handleCapture}
              disabled={
                isCapturing ||
                isProcessing ||
                !permission?.granted ||
                !cameraReady
              }
              className="bg-blue-500 rounded-3xl p-6 mb-4 shadow-lg"
              activeOpacity={0.8}
              style={[
                styles.captureButton,
                (isCapturing ||
                  isProcessing ||
                  !permission?.granted ||
                  !cameraReady) &&
                  styles.disabledButton,
              ]}
            >
              <View className="flex-row items-center justify-center">
                {isProcessing ? (
                  <>
                    <ActivityIndicator
                      size="small"
                      color="#ffffff"
                      style={{ marginRight: 12 }}
                    />
                    <Text className="text-2xl font-bold text-white">
                      Processing...
                    </Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="camera-alt" size={32} color="#ffffff" style={{ marginRight: 12 }} />
                    <Text className="text-2xl font-bold text-white">
                      {isCapturing ? "Capturing..." : "Capture Gesture"}
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          ) : (
            <View className="flex-row justify-between">
              <TouchableOpacity
                onPress={handleTryAgain}
                className="bg-orange-500 rounded-3xl p-5 flex-1 mr-2 shadow-lg"
                activeOpacity={0.8}
                style={styles.actionButton}
              >
                <View className="flex-row items-center justify-center">
                  <MaterialIcons name="refresh" size={28} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text className="text-xl font-bold text-white">
                    Try Again
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNextQuestion}
                className="bg-green-500 rounded-3xl p-5 flex-1 ml-2 shadow-lg"
                activeOpacity={0.8}
                style={styles.actionButton}
              >
                <View className="flex-row items-center justify-center">
                  <Text className="text-xl font-bold text-white mr-2">
                    Next
                  </Text>
                  <MaterialIcons name="arrow-forward" size={28} color="#ffffff" />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Encouragement Message */}
        <View className="bg-yellow-100 rounded-2xl p-5 items-center shadow-md">
          <View className="flex-row items-center justify-center">
            <Text className="text-xl font-semibold text-gray-800 text-center">
              {score > currentQuestion / 2
                ? "Awesome job! You're learning fast"
                : "Keep going! You're doing great"}
            </Text>
            <MaterialIcons name="star" size={24} color="#fbbf24" style={{ marginLeft: 8 }} />
          </View>
        </View>
      </ScrollView>
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
