/**
 * Fusion model for combining emotion and hand movement data
 * Aggregates last 2 minutes of data and computes final engagement metrics
 */

export function computeFusion(session) {
  if (!session || !session.emotions || !session.hands) {
    return {
      finalEmotion: "unknown",
      engagementLevel: "LOW",
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

  // Compute hand movement summary
  const handSpeeds = hands.map((h) => h.hand_speed || 0).filter((s) => s > 0);
  const handLevels = hands.map((h) => h.level || 0);
  const handIntensities = hands.map((h) => h.intensity || "IDLE");

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

  // Compute engagement level
  // High: positive emotions (happy, surprise) + active hand movement
  // Medium: neutral/positive emotions + some movement
  // Low: negative emotions or no movement
  let engagementLevel = "LOW";

  const positiveEmotions = (emotionCounts.happy || 0) + (emotionCounts.surprise || 0);
  const negativeEmotions = (emotionCounts.angry || 0) + (emotionCounts.sad || 0) + (emotionCounts.fear || 0);
  const neutralEmotions = emotionCounts.neutral || 0;

  const isHandActive = avgHandLevel >= 1.5 || avgHandSpeed > 150;
  const isHandModerate = avgHandLevel >= 0.5 || avgHandSpeed > 60;

  if (positiveEmotions > negativeEmotions && positiveEmotions > neutralEmotions && isHandActive) {
    engagementLevel = "HIGH";
  } else if (
    (positiveEmotions >= neutralEmotions || neutralEmotions > negativeEmotions) &&
    isHandModerate
  ) {
    engagementLevel = "MEDIUM";
  } else if (negativeEmotions > positiveEmotions) {
    engagementLevel = "LOW";
  }

  // Generate summary text
  let summary = `Analyzed ${emotions.length} emotion samples and ${hands.length} hand movement samples. `;
  summary += `Dominant emotion: ${finalEmotion} (${(avgConfidence * 100).toFixed(1)}% avg confidence). `;
  summary += `Hand movement: ${avgHandSpeed.toFixed(1)} px/s average, ${handIntensities[handIntensities.length - 1] || "IDLE"} intensity. `;
  summary += `Engagement: ${engagementLevel}.`;

  return {
    finalEmotion,
    engagementLevel,
    summary,
    emotionDistribution: emotionCounts,
    handSummary: {
      avgSpeed: Math.round(avgHandSpeed * 100) / 100,
      avgLevel: Math.round(avgHandLevel * 100) / 100,
      intensityDistribution: intensityCounts,
      samples: hands.length,
    },
  };
}
