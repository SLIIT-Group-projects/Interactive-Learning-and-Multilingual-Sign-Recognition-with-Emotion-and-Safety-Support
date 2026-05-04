
/**
 * Contextual Harm Factors H_c(z)
 * Defines how concerning a sound class is in different contexts
 * Scale: 0.1 to 2.0 (default 1.0)
 */
const harmFactors = {
  fire_alarm: { default: 2.0, night: 2.0, indoor: 2.0 },
  smoke_alarm: { default: 2.0, night: 2.0, indoor: 2.0 },
  siren: { default: 1.8, night: 1.9, residential: 1.9 },
  glass_breaking: { default: 1.5, night: 1.8, indoor: 1.7 },
  car_horn: { default: 1.2, residential: 1.4, night: 1.3 },
  baby_crying: { default: 0.7, home: 0.8, night: 1.0 },
  dog_barking: { default: 1.0, night: 1.4, indoor: 0.8 },
  door_knock: { default: 0.9, night: 1.3, home: 1.0 },
  gun_shot: { default: 2.0, night: 2.0, residential: 2.0 },
  footsteps: { default: 0.8, night: 1.5, indoor: 1.2 },
  train: { default: 0.0 }
};

/**
 * Hazard Priorities
 * Loaded from environment variables
 */
const hazardPriorities = JSON.parse(process.env.HAZARD_PRIORITIES || '{}');

/**
 * Model Parameters
 */
const PARAMS = {
  ALPHA_L: 15.0,     // Loudness sensitivity
  MU_L: 0.05,        // Minimum audible urgency (RMS)
  TAU_D: 2.0,        // Duration scaling (seconds)
  ALERT_THRESHOLD: 0.45 // τ - Threshold for triggering an alert
};

/**
 * Acoustic Gain Function G(L, D)
 * G(L, D) = σ(α_L * (L - μ_L)) * (1 - e^(-D / τ_D))
 */
function computeAcousticGain(loudness, duration) {
  const L = loudness;
  const D = duration;

  // Sigmoid for loudness: 1 / (1 + e^-(alpha * (L - mu)))
  const sigmoidL = 1 / (1 + Math.exp(-PARAMS.ALPHA_L * (L - PARAMS.MU_L)));

  // Duration factor: 1 - e^(-D / tau)
  const durationFactor = 1 - Math.exp(-D / PARAMS.TAU_D);

  return sigmoidL * durationFactor;
}

/**
 * Get Harm Factor H_c(z) for a class and context
 */
function getHarmFactor(hazardType, context) {
  const factors = harmFactors[hazardType] || { default: 1.0 };
  let factor = factors.default;

  const currentHour = new Date().getHours();
  const isNightTime = currentHour >= 22 || currentHour < 6;

  if (isNightTime && factors.night) {
    factor = Math.max(factor, factors.night);
  }

  if (context.location) {
    const locType = context.location.type;
    if (locType && factors[locType]) {
      factor = Math.max(factor, factors[locType]);
    }
  }

  return factor;
}

/**
 * Get priority score for a hazard type
 */
export function getHazardPriority(hazardType) {
  return hazardPriorities[hazardType] || 0;
}

/**
 * Prioritize multiple hazard detections using the Urgency Model
 * U(e|z) = Σ p(c|x) * H(c,z) * G(L,D)
 * @param {Array} detections - Array of detected hazards
 * @param {object} context - Context information
 * @returns {Array} Prioritized and sorted array of hazards
 */
export function prioritizeHazards(detections, context = {}) {
  if (!detections || detections.length === 0) {
    return [];
  }

  // Process each detection using the Urgency Equation
  const processed = detections.map(detection => {
    const hazardType = detection.type;
    const p = detection.confidence; // Probability p(c|x)
    const H = getHarmFactor(hazardType, context); // Harm factor H_c(z)
    const G = computeAcousticGain(detection.loudness || 0.5, detection.duration || 4.0); // Acoustic Gain G(L,D)

    // Calculate Urgency Score U
    const urgencyScore = p * H * G;

    return {
      ...detection,
      urgencyScore,
      priority: Math.min(10, Math.round(urgencyScore * 10)), // Map to 0-10 scale, clamped for UI
      urgency: getUrgencyLevelFromScore(urgencyScore)
    };
  });

  // Remove duplicates (keep highest urgencyScore)
  const unique = {};
  processed.forEach(detection => {
    const key = detection.type;
    if (!unique[key] || detection.urgencyScore > unique[key].urgencyScore) {
      unique[key] = detection;
    }
  });

  // Sort by urgencyScore (highest first)
  const prioritized = Object.values(unique).sort((a, b) => b.urgencyScore - a.urgencyScore);

  return prioritized;
}

/**
 * Get urgency level based on urgency score
 */
export function getUrgencyLevelFromScore(score) {
  if (score >= 0.8) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

/**
 * Legacy compatibility: Get urgency level based on priority score
 */
export function getUrgencyLevel(priority) {
  if (priority >= 9) return 'critical';
  if (priority >= 7) return 'high';
  if (priority >= 5) return 'medium';
  return 'low';
}

/**
 * Check if hazard requires immediate parent notification
 */
export function requiresImmediateNotification(hazard) {
  return hazard.urgencyScore >= PARAMS.ALERT_THRESHOLD || hazard.urgency === 'critical';
}

/**
 * Generate alert message for a hazard
 */
export function generateAlertMessage(hazard, context = {}) {
  const messages = {
    fire_alarm: '🔥 Fire alarm detected! Evacuate immediately!',
    smoke_alarm: '⚠️ Smoke alarm detected! Check for smoke or fire!',
    siren: '🚨 Emergency siren detected nearby!',
    glass_breaking: '💥 Glass breaking sound detected!',
    car_horn: '🚗 Car horn detected - be careful!',
    baby_crying: '👶 Baby crying detected',
    dog_barking: '🐕 Dog barking detected',
    door_knock: '🚪 Someone is knocking on the door',
    gun_shot: '🔫 Gunshot detected! Find safety!',
    footsteps: '👣 Footsteps detected nearby'
  };

  const baseMessage = messages[hazard.type] || `Alert: ${hazard.type} detected`;

  if (hazard.urgency === 'critical') {
    return `🚨 CRITICAL: ${baseMessage}`;
  }

  return baseMessage;
}


