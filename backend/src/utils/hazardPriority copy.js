/**
 * Hazard Priority Utility
 * Handles prioritization of detected hazards based on urgency and context
 */

// Load hazard priorities from environment
const hazardPriorities = JSON.parse(
  process.env.HAZARD_PRIORITIES || 
  '{"fire_alarm":10,"smoke_alarm":10,"gun_shot":10,"fire":10,"siren":9,"alarm":9,"glass_breaking":8,"chainsaw":8,"fireworks":8,"car_horn":7,"baby_crying":6,"dog_barking":5}'
);

/**
 * Get priority score for a hazard type
 */
export function getHazardPriority(hazardType) {
  return hazardPriorities[hazardType] || 0;
}

/**
 * Apply context-aware adjustments to hazard priority
 * @param {string} hazardType - Type of hazard
 * @param {number} basePriority - Base priority score
 * @param {object} context - Context information (time, location, etc.)
 * @returns {number} Adjusted priority
 */
export function adjustPriorityForContext(hazardType, basePriority, context) {
  let adjustedPriority = basePriority;
  const currentHour = new Date().getHours();
  const isNightTime = currentHour >= 22 || currentHour < 6;
  const isDayTime = currentHour >= 6 && currentHour < 22;

  // Context-aware adjustments
  switch (hazardType) {
    case 'dog_barking':
      // Dog barking at night is more concerning
      if (isNightTime) {
        adjustedPriority += 2;
      }
      // If location is known to be indoors, it's less urgent
      if (context.location && context.location.type === 'indoor') {
        adjustedPriority -= 1;
      }
      break;

    case 'car_horn':
      // Car horn at night or in residential area is more urgent
      if (isNightTime) {
        adjustedPriority += 1;
      }
      if (context.location && context.location.type === 'residential') {
        adjustedPriority += 1;
      }
      break;

    case 'baby_crying':
      // Baby crying at night might be more urgent
      if (isNightTime && context.location && context.location.type === 'home') {
        adjustedPriority += 1;
      }
      break;

    case 'fire_alarm':
    case 'smoke_alarm':
      // Always maximum priority, no adjustment needed
      adjustedPriority = 10;
      break;

    default:
      break;
  }

  // Ensure priority stays within [0, 10] range
  return Math.max(0, Math.min(10, adjustedPriority));
}

/**
 * Prioritize multiple hazard detections
 * @param {Array} detections - Array of detected hazards
 * @param {object} context - Context information
 * @returns {Array} Prioritized and sorted array of hazards
 */
export function prioritizeHazards(detections, context = {}) {
  if (!detections || detections.length === 0) {
    return [];
  }

  // Process each detection
  const processed = detections.map(detection => {
    const hazardType = detection.type;
    const basePriority = getHazardPriority(hazardType);
    const adjustedPriority = adjustPriorityForContext(
      hazardType,
      basePriority,
      context
    );

    return {
      ...detection,
      basePriority,
      priority: adjustedPriority,
      urgency: getUrgencyLevel(adjustedPriority)
    };
  });

  // Remove duplicates (keep highest confidence/priority)
  const unique = {};
  processed.forEach(detection => {
    const key = detection.type;
    if (!unique[key] || 
        detection.priority > unique[key].priority ||
        (detection.priority === unique[key].priority && 
         detection.confidence > unique[key].confidence)) {
      unique[key] = detection;
    }
  });

  // Sort by priority (highest first), then by confidence
  const prioritized = Object.values(unique).sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.confidence - a.confidence;
  });

  return prioritized;
}

/**
 * Get urgency level based on priority score
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
  return hazard.priority >= 9 || hazard.urgency === 'critical';
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
    dog_barking: '🐕 Dog barking detected'
  };

  const baseMessage = messages[hazard.type] || `Alert: ${hazard.type} detected`;
  
  if (hazard.urgency === 'critical') {
    return `🚨 CRITICAL: ${baseMessage}`;
  }
  
  return baseMessage;
}


