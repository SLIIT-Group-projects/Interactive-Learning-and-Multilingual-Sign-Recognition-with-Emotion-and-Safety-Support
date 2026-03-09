/**
 * Fusion model for combining emotion and hand movement data
 * Aggregates last 2 minutes of data and computes final engagement metrics
 */

import { fuseEmotion } from "../../models/fusion.model.js";

export function computeFusion(session) {
  if (!session || !session.emotions || !session.hands) {
    return {
      behavior: "Cannot detect", // PRIMARY OUTPUT - insufficient data
      behaviorConfidence: 0.0,
      engagementLevel: "LOW",
      finalEmotion: "unknown",
      summary: "Insufficient data",
      emotionDistribution: {},
      handSummary: {},
    };
  }

  const now = Date.now();
  const twoMinutesAgo = now - 2 * 60 * 1000;

  // Filter data from last 2 minutes
  const recentEmotions = session.emotions.filter((e) => e.t >= twoMinutesAgo);
  const recentHands = session.hands.filter((h) => h.t >= twoMinutesAgo);

  // If no recent data, use all data
  const emotions = recentEmotions.length > 0 ? recentEmotions : session.emotions;
  const hands = recentHands.length > 0 ? recentHands : session.hands;

  // Compute emotion distribution
  const emotionCounts = {};
  let totalConfidence = 0;
  let emotionSum = 0;

  emotions.forEach((e) => {
    const emotion = e.predicted || "neutral";
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    totalConfidence += e.confidence || 0;
    emotionSum += 1;
  });

  // Find dominant emotion
  let finalEmotion = "neutral";
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(emotionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      finalEmotion = emotion;
    }
  }

  const avgConfidence = emotionSum > 0 ? totalConfidence / emotionSum : 0;

  // VERY LENIENT: Use samples where hands were detected OR speed > 0
  // If speed is calculated, ALWAYS consider it as hands detected (even if hands_detected flag is false)
  // This ensures we use hand data whenever speed is available
  const validHands = hands.filter((h) => {
    // Include if explicitly marked as detected
    if (h.hands_detected === true) return true;
    // OR if speed > 0 (indicates hands were actually detected and speed calculated)
    // This is the primary check - if speed exists, hands are detected
    if ((h.hand_speed || 0) > 0) return true;
    // OR if frames_with_hands > 0 (indicates hands were seen)
    if ((h.frames_with_hands || 0) > 0) return true;
    return false;
  });
  
  const handSpeeds = validHands.map((h) => h.hand_speed || 0).filter((s) => s > 0);
  const handLevels = validHands.map((h) => h.level || 0);
  const handIntensities = validHands.map((h) => h.intensity || "LOW");

  const avgHandSpeed = handSpeeds.length > 0
    ? handSpeeds.reduce((a, b) => a + b, 0) / handSpeeds.length
    : 0;

  const avgHandLevel = handLevels.length > 0
    ? handLevels.reduce((a, b) => a + b, 0) / handLevels.length
    : 0;

  const intensityCounts = {};
  handIntensities.forEach((int) => {
    intensityCounts[int] = (intensityCounts[int] || 0) + 1;
  });
  
  // Check if hands were actually detected (either explicitly or by having speed > 0)
  const handsActuallyDetected = validHands.length > 0;

  // Compute engagement level based on hand speed intensity
  // Engagement directly reflects the intensity of hand movement
  // HIGH intensity = HIGH engagement, MEDIUM = MEDIUM, LOW = LOW
  let engagementLevel = "LOW";
  
  if (handsActuallyDetected && validHands.length > 0) {
    // Use average level as primary indicator (most accurate)
    if (avgHandLevel >= 3) {
      engagementLevel = "HIGH";
    } else if (avgHandLevel >= 2) {
      engagementLevel = "MEDIUM";
    } else {
      engagementLevel = "LOW";
    }
    
    // Also check intensity distribution as secondary check
    const highCount = intensityCounts["HIGH"] || 0;
    const mediumCount = intensityCounts["MEDIUM"] || 0;
    const totalSamples = validHands.length;
    
    // If majority of samples are HIGH intensity, ensure HIGH engagement
    if (highCount > 0 && (highCount / totalSamples) >= 0.5) {
      engagementLevel = "HIGH";
    }
    // If majority are MEDIUM or HIGH, ensure at least MEDIUM
    else if ((highCount + mediumCount) > 0 && ((highCount + mediumCount) / totalSamples) >= 0.5 && engagementLevel === "LOW") {
      engagementLevel = "MEDIUM";
    }
  } else {
    // No hands detected = LOW engagement
    engagementLevel = "LOW";
  }

  // Calculate behavior using DOMINANT emotion (finalEmotion) and hand data
  // Use dominant emotion for consistency with displayed "Final Emotion"
  // Get the most recent hand sample for current intensity
  const mostRecentHand = validHands.length > 0 ? validHands[validHands.length - 1] : null;
  
  // Check if face/emotion was detected
  // Face is considered detected if:
  // 1. We have emotion samples
  // 2. Final emotion is a valid emotion (not "unknown", "no_face_detected", etc.)
  // 3. Average confidence is reasonable (not zero)
  const faceDetected = emotions.length > 0 
    && finalEmotion 
    && finalEmotion !== "unknown" 
    && finalEmotion !== "no_face_detected"
    && avgConfidence > 0;
  
  // Check if hands were detected
  // Hands are detected if:
  // 1. We have valid hand samples (hands with speed > 0 or hands_detected === true), OR
  // 2. Most recent hand has speed > 0 (even if hands_detected flag is false)
  // This ensures that if speed is calculated, hands are considered detected regardless of the flag
  const mostRecentHandAll = hands.length > 0 ? hands[hands.length - 1] : null;
  const hasHandSpeed = mostRecentHandAll && (mostRecentHandAll.hand_speed || 0) > 0;
  const hasHandsDetectedFlag = mostRecentHandAll && mostRecentHandAll.hands_detected === true;
  
  // Hands are detected if we have valid samples OR if most recent hand has speed > 0
  // This is more lenient - if speed is calculated, consider hands detected
  const handsDetected = handsActuallyDetected || hasHandSpeed || hasHandsDetectedFlag;
  
  let behavior = "Cannot detect";
  let behaviorConfidence = 0.0;
  
  // Only calculate behavior if BOTH face and hands are detected
  if (faceDetected && handsDetected) {
    // Calculate average confidence for the dominant emotion
    const dominantEmotionSamples = emotions.filter((e) => (e.predicted || "neutral") === finalEmotion);
    const avgConfidenceForDominant = dominantEmotionSamples.length > 0
      ? dominantEmotionSamples.reduce((sum, e) => sum + (e.confidence || 0), 0) / dominantEmotionSamples.length
      : avgConfidence;
    
    // Use mostRecentHand if available, otherwise use mostRecentHandAll (with speed > 0)
    const handForFusion = mostRecentHand || (mostRecentHandAll && (mostRecentHandAll.hand_speed || 0) > 0 ? mostRecentHandAll : null);
    
    // Use fuseEmotion to calculate behavior from dominant emotion + hand speed intensity
    if (handForFusion) {
      const fusionResult = fuseEmotion(
        { emotion: finalEmotion, confidence: avgConfidenceForDominant },
        handForFusion
      );
      behavior = fusionResult.final_state;
      behaviorConfidence = fusionResult.fused_confidence;
    } else {
      // No valid hand data for fusion
      behavior = "Cannot detect";
      behaviorConfidence = 0.0;
    }
  } else {
    // Either face or hands not detected - cannot determine behavior
    behavior = "Cannot detect";
    behaviorConfidence = 0.0;
  }

  // Generate summary text - Behavior is the main output, highlighted first
  let summary = `Analyzed ${emotions.length} emotion samples and ${hands.length} hand movement samples. `;
  summary += `Behavior: ${behavior} (${(behaviorConfidence * 100).toFixed(1)}% confidence). `;
  summary += `Dominant emotion: ${finalEmotion} (${(avgConfidence * 100).toFixed(1)}% avg confidence). `;
  
  // Only show hand movement if hands were actually detected
  // Use handsDetected (which includes speed > 0) instead of just handsActuallyDetected
  if (handsDetected && avgHandSpeed > 0) {
    const lastIntensity = handIntensities.length > 0 ? handIntensities[handIntensities.length - 1] : "LOW";
    summary += `Hand movement: ${avgHandSpeed.toFixed(1)} px/s average, ${lastIntensity} intensity. `;
  } else if (hasHandSpeed && mostRecentHandAll) {
    // If we have speed but no validHands (edge case), use most recent hand data
    summary += `Hand movement: ${mostRecentHandAll.hand_speed.toFixed(1)} px/s, ${mostRecentHandAll.intensity || "LOW"} intensity. `;
  } else {
    summary += `Hand movement: No hands detected. `;
  }
  summary += `Engagement: ${engagementLevel}.`;

  // Return object - Behavior is the PRIMARY output, listed first
  return {
    behavior, // PRIMARY OUTPUT - Main result
    behaviorConfidence, // Confidence for behavior
    engagementLevel, // Based on intensity
    finalEmotion, // Supporting information
    summary,
    emotionDistribution: emotionCounts,
    handSummary: {
      avgSpeed: handsActuallyDetected ? Math.round(avgHandSpeed * 100) / 100 : 0,
      avgLevel: handsActuallyDetected ? Math.round(avgHandLevel * 100) / 100 : 0,
      intensityDistribution: intensityCounts,
      samples: hands.length,
      handsDetected: handsActuallyDetected,
      validSamples: validHands.length,
    },
  };
}
