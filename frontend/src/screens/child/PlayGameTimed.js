import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { MaterialIcons } from "@expo/vector-icons";
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
import { ALPHABET } from "../../constants/gameConstants";
import GameResultsScreen from "./GameResultsScreen";
import { HAND_GAME_BASE_URL } from "../../../config/api";

const TIMED_QUESTIONS = 10;
const TIMER_SECONDS = 10;

const PlayGameTimed = ({ navigation, route }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [targetLetter, setTargetLetter] = useState("");
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [isGameActive, setIsGameActive] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [predictedLetter, setPredictedLetter] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [gameResults, setGameResults] = useState(null);
  const [xpGainedThisAnswer, setXpGainedThisAnswer] = useState(0);
  const [levelUpModal, setLevelUpModal] = useState(null);
  const [showInstructionsModal, setShowInstructionsModal] = useState(true);
  const [hasGameStarted, setHasGameStarted] = useState(false);

  const cameraRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const autoAdvanceTimeoutRef = useRef(null);
  const lastLetterRef = useRef(null);
  const questionStartTimeRef = useRef(null);
  const gameStartTimeRef = useRef(null);
  const totalXPRef = useRef(0);
  const correctCountRef = useRef(0);
  const longestStreakRef = useRef(0);
  const currentStreakRef = useRef(0);

  const {
    userData,
    childProgress: contextProgress,
    refreshChildProgress,
  } = useAuth();
  const childId = userData?.uid || null;
  const parentId = userData?.parentId || null;

  const API_URL = HAND_GAME_BASE_URL;

  // Initialize game (but don't start timer until user clicks Start)
  useEffect(() => {
    generateNewQuestion();
    testAPIConnection();
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  // Timer logic - only start when game has started
  useEffect(() => {
    if (
      !hasGameStarted ||
      !isGameActive ||
      hasAnswered ||
      timer <= 0 ||
      currentQuestion >= TIMED_QUESTIONS
    ) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setTimer((prevTimer) => {
        if (prevTimer <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setTimeout(() => {
            handleTimeout();
          }, 0);
          return 0;
        }
        return prevTimer - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGameStarted, isGameActive, hasAnswered, currentQuestion]);

  const testAPIConnection = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: "GET",
        timeout: 5000,
      });
      const data = await response.json();
      console.log("API connection test:", data);
    } catch (error) {
      console.warn("API connection test failed:", error.message);
    }
  };

  const generateNewQuestion = () => {
    setHasAnswered(false);
    setFeedback(null);
    setIsCapturing(false);
    setTimer(TIMER_SECONDS);
    questionStartTimeRef.current = Date.now();

    // Avoid consecutive repeats
    let randomLetter;
    do {
      randomLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    } while (randomLetter === lastLetterRef.current && ALPHABET.length > 1);

    lastLetterRef.current = randomLetter;
    setTargetLetter(randomLetter);
  };

  const handleStartGame = () => {
    setShowInstructionsModal(false);
    setHasGameStarted(true);
    gameStartTimeRef.current = Date.now();
    questionStartTimeRef.current = Date.now();
  };

  const handleCameraRef = useCallback(
    (ref) => {
      if (ref) {
        cameraRef.current = ref;
        setTimeout(() => {
          setCameraReady(true);
        }, 0);
      } else {
        if (!isCapturing && !isProcessing) {
          cameraRef.current = null;
          setCameraReady(false);
        }
      }
    },
    [isCapturing, isProcessing],
  );

  const handleCapture = async () => {
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

    let retries = 0;
    while ((!cameraReady || !cameraRef.current) && retries < 5) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    if (!cameraReady || !cameraRef.current) {
      Alert.alert(
        "Camera Not Ready",
        "Please wait for the camera to fully initialize.",
      );
      return;
    }

    setIsCapturing(true);
    setPredictedLetter(null);

    try {
      const camera = cameraRef.current;
      if (!camera) {
        throw new Error("Camera ref is null");
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      const currentCamera = camera;
      if (
        !currentCamera ||
        typeof currentCamera.takePictureAsync !== "function"
      ) {
        throw new Error("Camera became unavailable");
      }

      let photo = await currentCamera.takePictureAsync({ quality: 0.8 });
      setIsProcessing(true);

      if (!photo || !photo.uri) {
        throw new Error("Photo capture failed");
      }

      const fileInfo = await FileSystem.getInfoAsync(photo.uri);
      if (!fileInfo.exists) {
        throw new Error("Photo file does not exist");
      }

      const base64Data = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Stop timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      const response = await fetch(`${API_URL}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${base64Data}`,
          targetLetter: targetLetter,
        }),
        timeout: 30000,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      setIsProcessing(false);

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to process gesture");
        setIsCapturing(false);
        return;
      }

      setPredictedLetter(result.predictedLetter);
      const responseTime = questionStartTimeRef.current
        ? (Date.now() - questionStartTimeRef.current) / 1000
        : 0;

      // Update Firestore
      if (childId && parentId) {
        try {
          await updateLetterPerformance(
            childId,
            parentId,
            targetLetter,
            result.isCorrect,
            Math.floor(responseTime * 1000),
          );
        } catch (error) {
          console.warn("Failed to update letter performance:", error);
        }
      }

      // Calculate XP with speed bonus
      let xpGained = 0;
      if (result.isCorrect) {
        correctCountRef.current += 1;
        currentStreakRef.current += 1;
        if (currentStreakRef.current > longestStreakRef.current) {
          longestStreakRef.current = currentStreakRef.current;
        }

        // Speed-based XP: <3s = 20, <5s = 15, else = 10
        if (responseTime < 3) {
          xpGained = 20;
        } else if (responseTime < 5) {
          xpGained = 15;
        } else {
          xpGained = 10;
        }

        if (childId) {
          try {
            const {
              progress,
              xpGained: actualXP,
              leveledUp,
              newLevel,
            } = await addXP(childId, {
              correct: true,
              timedModeXP: xpGained,
            });
            totalXPRef.current += actualXP;
            setXpGainedThisAnswer(actualXP);
            if (leveledUp && newLevel) {
              setLevelUpModal({ level: newLevel });
            }
          } catch (err) {
            console.warn("XP update failed:", err);
          }
        }
        setFeedback("correct");
        setScore(score + 1);
      } else {
        currentStreakRef.current = 0;
        if (childId) {
          try {
            await addXP(childId, { correct: false });
          } catch (err) {
            console.warn("XP update failed:", err);
          }
        }
        setFeedback("incorrect");
      }

      setHasAnswered(true);

      // Auto-advance after showing feedback
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        handleNextQuestion();
      }, 1500);
    } catch (error) {
      console.error("Error capturing/processing:", error);
      setIsCapturing(false);
      setIsProcessing(false);
      Alert.alert("Error", `Failed to process gesture: ${error.message}`);
    }
  };

  const handleTimeout = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    currentStreakRef.current = 0;
    setFeedback("incorrect");
    setHasAnswered(true);
    setPredictedLetter(null);

    if (childId) {
      addXP(childId, { correct: false }).catch((err) => {
        console.warn("XP update failed on timeout:", err);
      });
    }

    autoAdvanceTimeoutRef.current = setTimeout(() => {
      handleNextQuestion();
    }, 1500);
  };

  const handleNextQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    setXpGainedThisAnswer(0);

    if (currentQuestion < TIMED_QUESTIONS - 1) {
      setCurrentQuestion(currentQuestion + 1);
      generateNewQuestion();
    } else {
      endGame();
    }
  };

  const endGame = async () => {
    setIsGameActive(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const totalTime = gameStartTimeRef.current
      ? Math.floor((Date.now() - gameStartTimeRef.current) / 1000)
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
          gameMode: "timed",
          totalQuestions: TIMED_QUESTIONS,
          correctAnswers: score,
          timeTaken: totalTime,
          difficultyLevel: "medium",
        });
      } catch (error) {
        console.warn("Failed to save game session:", error);
      }
    }

    const accuracy =
      TIMED_QUESTIONS > 0 ? Math.round((score / TIMED_QUESTIONS) * 100) : 0;

    setGameResults({
      totalXP: totalXPRef.current,
      correctCount: correctCountRef.current,
      accuracy,
      longestStreak: longestStreakRef.current,
    });
  };

  const handleBack = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }
    navigation.goBack();
  };

  // Timer color based on remaining time
  const getTimerColor = () => {
    if (timer <= 3) return "#ef4444"; // Red
    if (timer <= 5) return "#f59e0b"; // Yellow/Orange
    return "#10b981"; // Green
  };

  if (gameResults) {
    return (
      <GameResultsScreen
        results={gameResults}
        onPlayAgain={() => {
          setGameResults(null);
          setCurrentQuestion(0);
          setScore(0);
          totalXPRef.current = 0;
          correctCountRef.current = 0;
          longestStreakRef.current = 0;
          currentStreakRef.current = 0;
          setIsGameActive(true);
          generateNewQuestion();
        }}
        onBackToSelection={() => {
          navigation.navigate("GameSelect");
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Full-Screen Camera - Only show when game has started */}
        {hasGameStarted ? (
          <View className="flex-1 bg-black">
            {!permission?.granted ? (
              <View className="flex-1 items-center justify-center p-8 bg-gray-900">
                <Text className="text-6xl mb-4">📷</Text>
                <Text className="text-xl font-semibold text-white mb-2 text-center">
                  Camera Permission Required
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
                onCameraReady={() => setCameraReady(true)}
              >
                {/* Timer (Top Center) */}
                <View className="absolute top-4 left-0 right-0 items-center">
                  <View
                    className="bg-black/70 rounded-full px-4 py-2"
                    style={{ borderWidth: 2, borderColor: getTimerColor() }}
                  >
                    <View className="flex-row items-center">
                      <MaterialIcons
                        name="timer"
                        size={20}
                        color={getTimerColor()}
                      />
                      <Text
                        className="text-2xl font-bold ml-2"
                        style={{ color: getTimerColor() }}
                      >
                        {timer}s
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Back Button (Top-Left) */}
                <TouchableOpacity
                  onPress={handleBack}
                  className="absolute top-4 left-4 bg-black/70 rounded-full p-2"
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </TouchableOpacity>

                {/* Target Letter (Top-Left, below back button) */}
                <View className="absolute top-20 left-4 bg-black/70 rounded-2xl px-4 py-3 items-center">
                  <Text className="text-xs text-white/80 mb-1">
                    Show the sign for
                  </Text>
                  <Text className="text-5xl font-bold text-white">
                    {targetLetter}
                  </Text>
                  <View className="mt-2 bg-white/20 rounded-full px-3 py-1">
                    <Text className="text-white font-semibold text-xs">
                      {currentQuestion + 1} / {TIMED_QUESTIONS}
                    </Text>
                  </View>
                </View>
              </CameraView>
            )}
          </View>
        ) : (
          // Placeholder background before game starts
          <View className="flex-1 bg-gray-900" />
        )}

        {/* Capture Button - Only show when game has started */}
        {hasGameStarted &&
          !hasAnswered &&
          permission?.granted &&
          !isProcessing &&
          !isCapturing && (
            <View className="absolute bottom-8 left-0 right-0 items-center px-6">
              <TouchableOpacity
                onPress={handleCapture}
                disabled={!permission?.granted || !cameraReady}
                className="bg-blue-500 rounded-full w-20 h-20 items-center justify-center shadow-lg"
                activeOpacity={0.8}
              >
                <MaterialIcons name="camera-alt" size={36} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}

        {/* Feedback Toast */}
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
                  {xpGainedThisAnswer > 0 && (
                    <Text className="text-sm font-bold text-white mt-1">
                      +{xpGainedThisAnswer} XP
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <MaterialIcons name="cancel" size={40} color="#ffffff" />
                  <Text className="text-lg font-bold text-white mt-2 text-center">
                    {timer === 0 ? "Time's up!" : "Try again!"}
                  </Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Instructions Modal */}
        <Modal
          visible={showInstructionsModal}
          transparent
          animationType="fade"
          onRequestClose={() => {}} // Prevent closing by back button
        >
          <View className="flex-1 bg-black/70 justify-center items-center px-6">
            <View className="bg-white rounded-3xl p-6 shadow-xl max-w-md w-full">
              {/* Header */}
              <View className="items-center mb-4">
                <View className="bg-violet-100 rounded-full p-3 mb-3">
                  <MaterialIcons name="timer" size={32} color="#7c3aed" />
                </View>
                <Text className="text-2xl font-bold text-gray-800 text-center">
                  Timed Mode
                </Text>
                <Text className="text-gray-600 text-center mt-1">
                  Fast-paced sign practice!
                </Text>
              </View>

              {/* Instructions */}
              <View className="mb-6">
                <Text className="text-lg font-semibold text-gray-800 mb-3">
                  How to Play:
                </Text>

                <View className="mb-3">
                  <View className="flex-row items-start mb-2">
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color="#10b981"
                      style={{ marginRight: 8, marginTop: 2 }}
                    />
                    <View className="flex-1">
                      <Text className="text-base text-gray-700">
                        You have <Text className="font-bold">10 seconds</Text>{" "}
                        per letter
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-start mb-2">
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color="#10b981"
                      style={{ marginRight: 8, marginTop: 2 }}
                    />
                    <View className="flex-1">
                      <Text className="text-base text-gray-700">
                        Show the correct sign before time runs out
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-start mb-2">
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color="#10b981"
                      style={{ marginRight: 8, marginTop: 2 }}
                    />
                    <View className="flex-1">
                      <Text className="text-base text-gray-700">
                        Complete <Text className="font-bold">10 letters</Text>{" "}
                        to finish
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="bg-violet-50 rounded-xl p-3 mb-3">
                  <Text className="text-base font-semibold text-violet-800 mb-2">
                    XP Points:
                  </Text>
                  <View className="ml-2">
                    <Text className="text-sm text-gray-700 mb-1">
                      • Correct in{" "}
                      <Text className="font-bold">under 3 seconds</Text>:{" "}
                      <Text className="font-bold text-violet-600">+20 XP</Text>
                    </Text>
                    <Text className="text-sm text-gray-700 mb-1">
                      • Correct in{" "}
                      <Text className="font-bold">under 5 seconds</Text>:{" "}
                      <Text className="font-bold text-violet-600">+15 XP</Text>
                    </Text>
                    <Text className="text-sm text-gray-700">
                      • Correct in <Text className="font-bold">5+ seconds</Text>
                      :{" "}
                      <Text className="font-bold text-violet-600">+10 XP</Text>
                    </Text>
                  </View>
                </View>
              </View>

              {/* Start Button */}
              <TouchableOpacity
                onPress={handleStartGame}
                className="bg-violet-500 rounded-xl px-6 py-4 items-center shadow-lg"
                activeOpacity={0.8}
              >
                <View className="flex-row items-center">
                  <MaterialIcons
                    name="play-arrow"
                    size={24}
                    color="#ffffff"
                    style={{ marginRight: 8 }}
                  />
                  <Text className="text-lg font-bold text-white">
                    Start Now
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Level-up modal */}
        <Modal
          visible={!!levelUpModal}
          transparent
          animationType="fade"
          onRequestClose={() => setLevelUpModal(null)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center px-6">
            <View className="bg-white rounded-3xl p-8 items-center shadow-xl max-w-sm">
              <MaterialIcons
                name="celebration"
                size={64}
                color="#7c3aed"
                style={{ marginBottom: 16 }}
              />
              <Text className="text-2xl font-bold text-gray-800 text-center">
                Level Up!
              </Text>
              <Text className="text-4xl font-bold text-violet-600 mt-2">
                Level {levelUpModal?.level}
              </Text>
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

export default PlayGameTimed;
