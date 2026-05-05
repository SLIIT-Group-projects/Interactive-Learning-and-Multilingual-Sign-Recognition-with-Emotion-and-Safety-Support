import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  updateLetterPerformance,
  saveGameSession,
} from '../../services/firestore/gameService';
import {
  addXP,
  incrementGamesPlayed,
} from '../../services/firestore/childProgressService';
import { HAND_GAME_BASE_URL } from '../../../config/api';
import {
  WORD_PRACTICE_FIXED,
  WORDS_PER_ROUND,
  getWordRoundWords,
} from '../../constants/wordPracticeWords';
import GameResultsScreen from './GameResultsScreen';

const LIVES_PER_WORD = 3;
const ATTEMPT_COOLDOWN_MS = 1600;
const MIN_CONFIDENCE = 0.4;

const PlayWordGame = ({ navigation }) => {
  const [wordsList, setWordsList] = useState(() => getWordRoundWords());
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [livesRemaining, setLivesRemaining] = useState(LIVES_PER_WORD);
  const [feedback, setFeedback] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [gameResults, setGameResults] = useState(null);

  const cameraRef = useRef(null);
  const lastAttemptAtRef = useRef(0);
  const gameStartTimeRef = useRef(Date.now());
  const totalAttemptsRef = useRef(0);
  const correctAttemptsRef = useRef(0);
  const wordsCompletedRef = useRef(0);
  const wordsFailedRef = useRef(0);
  const totalXPRef = useRef(0);
  const currentStreakRef = useRef(0);
  const longestStreakRef = useRef(0);
  const feedbackTimeoutRef = useRef(null);
  const latestRef = useRef({});

  const { userData, refreshChildProgress } = useAuth();
  const childId = userData?.uid || null;
  const parentId = userData?.parentId || null;
  const API_URL = HAND_GAME_BASE_URL;

  const currentWord = wordsList[currentWordIndex] || '';
  const letters = currentWord.split('');

  latestRef.current = {
    wi: currentWordIndex,
    li: currentLetterIndex,
    lives: livesRemaining,
    words: wordsList,
  };

  const clearFeedbackLater = (ms, next) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      if (next) next();
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const endRound = useCallback(async () => {
    const total = totalAttemptsRef.current;
    const correct = correctAttemptsRef.current;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const elapsed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);

    if (childId) {
      try {
        await incrementGamesPlayed(childId);
      } catch (e) {
        console.warn('incrementGamesPlayed failed:', e);
      }
    }
    if (childId && parentId) {
      try {
        await saveGameSession({
          childId,
          parentId,
          gameMode: 'word_practice',
          totalQuestions: Math.max(total, 1),
          correctAnswers: correct,
          timeTaken: elapsed,
          difficultyLevel: 'medium',
        });
      } catch (e) {
        console.warn('saveGameSession failed:', e);
      }
    }
    refreshChildProgress?.();
    const totalQ = Math.max(totalAttemptsRef.current, 1);
    setGameResults({
      totalXP: totalXPRef.current,
      correctCount: correctAttemptsRef.current,
      totalQuestions: totalQ,
      accuracy,
      longestStreak: longestStreakRef.current,
    });
  }, [childId, parentId, refreshChildProgress]);

  const advanceToNextWord = useCallback(() => {
    setCurrentLetterIndex(0);
    setLivesRemaining(LIVES_PER_WORD);
    setFeedback(null);
    setCurrentWordIndex((i) => i + 1);
  }, []);

  const handleChangeWord = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    setFeedback(null);
    setWordsList((prev) => {
      const next = [...prev];
      const current = next[currentWordIndex];
      const others = prev.filter((_, idx) => idx !== currentWordIndex);
      const candidates = WORD_PRACTICE_FIXED.filter(
        (w) => !others.includes(w) && w !== current
      );
      let pick = current;
      if (candidates.length > 0) {
        pick = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        const alt = WORD_PRACTICE_FIXED.filter((w) => w !== current);
        if (alt.length > 0) {
          pick = alt[Math.floor(Math.random() * alt.length)];
        }
      }
      next[currentWordIndex] = pick;
      return next;
    });
    setCurrentLetterIndex(0);
    setLivesRemaining(LIVES_PER_WORD);
  }, [currentWordIndex]);

  const handleCameraRef = useCallback((ref) => {
    if (ref) {
      cameraRef.current = ref;
      setTimeout(() => setCameraReady(true), 0);
    } else if (!isCapturing && !isProcessing) {
      cameraRef.current = null;
      setCameraReady(false);
    }
  }, [isCapturing, isProcessing]);

  const handleCapture = async () => {
    if (!letters.length) return;

    const now = Date.now();
    if (now - lastAttemptAtRef.current < ATTEMPT_COOLDOWN_MS) {
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to capture gestures.');
        return;
      }
    }

    let retries = 0;
    while ((!cameraReady || !cameraRef.current) && retries < 5) {
      await new Promise((r) => setTimeout(r, 200));
      retries++;
    }
    if (!cameraReady || !cameraRef.current) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return;
    }

    const snap = {
      wi: latestRef.current.wi,
      li: latestRef.current.li,
      lives: latestRef.current.lives,
      words: latestRef.current.words,
    };
    const wordStr = snap.words[snap.wi] || '';
    const lettersSnap = wordStr.split('');
    const targetLetter = lettersSnap[snap.li];
    if (!targetLetter) return;

    setIsCapturing(true);
    setFeedback(null);
    const attemptStartMs = Date.now();

    try {
      await new Promise((r) => setTimeout(r, 400));
      const cam = cameraRef.current;
      if (!cam?.takePictureAsync) throw new Error('Camera unavailable');

      const photo = await cam.takePictureAsync({ quality: 0.8 });
      setIsProcessing(true);

      if (!photo?.uri) throw new Error('Capture failed');

      const fileInfo = await FileSystem.getInfoAsync(photo.uri);
      if (!fileInfo.exists) throw new Error('Photo missing');

      const base64Data = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${API_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${base64Data}`,
          targetLetter,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result = await response.json();
      setIsProcessing(false);
      setIsCapturing(false);
      lastAttemptAtRef.current = Date.now();

      if (!result.success) {
        const err = (result.error || '').toLowerCase();
        if (err.includes('no hand') || err.includes('hand')) {
          setFeedback('noHand');
          clearFeedbackLater(1200, null);
          return;
        }
        Alert.alert('Error', result.error || 'Could not read gesture');
        return;
      }

      const confidence = typeof result.confidence === 'number' ? result.confidence : 0;
      if (confidence < MIN_CONFIDENCE) {
        setFeedback('lowConfidence');
        clearFeedbackLater(1200, null);
        return;
      }

      totalAttemptsRef.current += 1;
      const responseTimeMs = Math.min(120000, Date.now() - attemptStartMs);

      if (childId && parentId) {
        try {
          await updateLetterPerformance(
            childId,
            parentId,
            targetLetter,
            result.isCorrect,
            responseTimeMs,
          );
        } catch (e) {
          console.warn('updateLetterPerformance failed:', e);
        }
      }

      if (result.isCorrect) {
        correctAttemptsRef.current += 1;
        currentStreakRef.current += 1;
        if (currentStreakRef.current > longestStreakRef.current) {
          longestStreakRef.current = currentStreakRef.current;
        }
        if (childId) {
          try {
            const { xpGained } = await addXP(childId, { correct: true });
            totalXPRef.current += xpGained || 0;
          } catch (e) {
            console.warn('addXP failed:', e);
          }
        }
        const nextIndex = snap.li + 1;
        if (nextIndex >= lettersSnap.length) {
          wordsCompletedRef.current += 1;
          setCurrentLetterIndex(lettersSnap.length);
          setFeedback('wordComplete');
          const isLastWord = snap.wi >= WORDS_PER_ROUND - 1;
          clearFeedbackLater(1500, () => {
            if (isLastWord) {
              void endRound();
            } else {
              advanceToNextWord();
            }
          });
        } else {
          setFeedback('correct');
          setCurrentLetterIndex(nextIndex);
          clearFeedbackLater(900, null);
        }
      } else {
        currentStreakRef.current = 0;
        if (childId) {
          try {
            await addXP(childId, { correct: false });
          } catch (e) {
            console.warn('addXP failed:', e);
          }
        }
        const nextLives = snap.lives - 1;
        if (nextLives <= 0) {
          wordsFailedRef.current += 1;
          setLivesRemaining(0);
          setFeedback('incorrect');
          clearFeedbackLater(900, () => {
            setFeedback('wordFailed');
            const isLastWord = snap.wi >= WORDS_PER_ROUND - 1;
            clearFeedbackLater(1200, () => {
              if (isLastWord) {
                void endRound();
              } else {
                advanceToNextWord();
              }
            });
          });
        } else {
          setLivesRemaining(nextLives);
          setFeedback('incorrect');
          clearFeedbackLater(1200, null);
        }
      }
    } catch (error) {
      console.error('PlayWordGame capture error:', error);
      setIsCapturing(false);
      setIsProcessing(false);
      Alert.alert('Error', error.message || 'Failed to process gesture');
    }
  };

  const handleRestartRound = () => {
    wordsCompletedRef.current = 0;
    wordsFailedRef.current = 0;
    totalAttemptsRef.current = 0;
    correctAttemptsRef.current = 0;
    totalXPRef.current = 0;
    currentStreakRef.current = 0;
    longestStreakRef.current = 0;
    gameStartTimeRef.current = Date.now();
    setWordsList(getWordRoundWords());
    setCurrentWordIndex(0);
    setCurrentLetterIndex(0);
    setLivesRemaining(LIVES_PER_WORD);
    setFeedback(null);
    setGameResults(null);
  };

  const renderLives = () => (
    <View className="flex-row justify-center items-center py-1">
      {Array.from({ length: LIVES_PER_WORD }).map((_, i) => (
        <Text key={i} className="text-3xl mx-1" style={{ opacity: i < livesRemaining ? 1 : 0.25 }}>
          ❤️
        </Text>
      ))}
    </View>
  );

  const renderWordHeader = () => (
    <View className="pt-1">
      <Text className="text-white/70 text-xs text-center mb-2">
        Word {currentWordIndex + 1} / {WORDS_PER_ROUND}
      </Text>
      <View className="flex-row justify-center flex-wrap items-center">
        {letters.map((letter, idx) => {
          const done = idx < currentLetterIndex;
          const current = idx === currentLetterIndex;
          return (
            <View
              key={`${currentWord}-${idx}`}
              className="mx-1 mb-1 px-2 py-2 min-w-[36px] items-center rounded-lg"
              style={{
                backgroundColor: done ? '#16a34a' : current ? '#6366f1' : '#374151',
                borderWidth: current ? 2 : 0,
                borderColor: '#fff',
              }}
            >
              <Text
                className="text-2xl font-bold"
                style={{ color: done || current ? '#fff' : '#9ca3af' }}
              >
                {letter}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const feedbackMessage = () => {
    switch (feedback) {
      case 'correct':
        return 'Correct!';
      case 'incorrect':
        return 'Try Again';
      case 'wordComplete':
        return 'Word Completed!';
      case 'wordFailed':
        return 'Word missed — next word!';
      case 'noHand':
        return 'Show your hand';
      case 'lowConfidence':
        return 'Hold steady and try again';
      default:
        return ' ';
    }
  };

  if (gameResults) {
    return (
      <GameResultsScreen
        results={gameResults}
        onPlayAgain={handleRestartRound}
        onBackToSelection={() => navigation.navigate('GameSelect')}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top']}>
      <View className="flex-1">
        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center p-8 bg-gray-900">
            <Text className="text-xl font-semibold text-white mb-4 text-center">Camera access needed</Text>
            <TouchableOpacity onPress={requestPermission} className="bg-violet-600 rounded-xl px-6 py-3">
              <Text className="text-white font-bold">Grant permission</Text>
            </TouchableOpacity>
          </View>
        ) : isProcessing ? (
          <View className="flex-1 items-center justify-center bg-black">
            <ActivityIndicator size="large" color="#fff" />
            <Text className="text-white mt-4 font-semibold">Processing gesture...</Text>
          </View>
        ) : (
          <CameraView
            ref={handleCameraRef}
            style={{ flex: 1 }}
            facing="front"
            onCameraReady={() => setCameraReady(true)}
          >
            <TouchableOpacity
              onPress={() => navigation.navigate('GameSelect')}
              className="absolute top-3 left-3 z-10 bg-black/60 rounded-full p-2"
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <View className="absolute top-12 left-0 right-0 z-10">
              <View className="bg-black/70 rounded-2xl mx-3 px-3 pt-2 pb-3">
                {renderLives()}
                <TouchableOpacity
                  onPress={handleChangeWord}
                  disabled={isCapturing || isProcessing}
                  className="bg-white/15 rounded-xl py-2 px-3 mb-2 flex-row items-center justify-center"
                  style={{ opacity: isCapturing || isProcessing ? 0.5 : 1 }}
                >
                  <MaterialIcons name="refresh" size={18} color="#e9d5ff" style={{ marginRight: 6 }} />
                  <Text className="text-violet-100 text-sm font-semibold">New word</Text>
                </TouchableOpacity>
                {renderWordHeader()}
              </View>
            </View>

            <View className="absolute bottom-0 left-0 right-0 bg-black/80 px-4 pt-4 pb-8 rounded-t-3xl">
              <View className="h-1 bg-white/20 rounded-full mb-3 overflow-hidden">
                <View
                  className="h-full bg-violet-500 rounded-full"
                  style={{
                    width: `${letters.length ? (Math.min(currentLetterIndex, letters.length) / letters.length) * 100 : 0}%`,
                  }}
                />
              </View>
              <Text
                className={`text-center text-lg font-bold mb-4 min-h-[28px] ${
                  feedback === 'correct' || feedback === 'wordComplete'
                    ? 'text-emerald-400'
                    : feedback === 'incorrect' || feedback === 'wordFailed'
                      ? 'text-rose-400'
                      : 'text-amber-200'
                }`}
              >
                {feedbackMessage()}
              </Text>
              {!isCapturing && (
                <TouchableOpacity
                  onPress={handleCapture}
                  disabled={!cameraReady}
                  className="bg-violet-600 rounded-full w-20 h-20 self-center items-center justify-center"
                >
                  <MaterialIcons name="camera-alt" size={36} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </CameraView>
        )}
      </View>
    </SafeAreaView>
  );
};

export default PlayWordGame;
