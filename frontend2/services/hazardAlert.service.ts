import * as Haptics from 'expo-haptics';
import { HazardDetection } from './api.service';

/**
 * Hazard Alert Service
 * Handles haptic feedback and visual alerts based on hazard detection
 */

export class HazardAlertService {
  private alertInterval: NodeJS.Timeout | null = null;
  private isAlerting = false;

  /**
   * Trigger alert based on hazard detection
   */
  async triggerAlert(hazard: HazardDetection) {
    if (this.isAlerting) {
      return; // Prevent multiple alerts
    }

    this.isAlerting = true;

    switch (hazard.urgency) {
      case 'critical':
        await this.triggerCriticalAlert(hazard);
        break;
      case 'high':
        await this.triggerHighAlert(hazard);
        break;
      case 'medium':
        await this.triggerMediumAlert(hazard);
        break;
      case 'low':
        await this.triggerLowAlert(hazard);
        break;
    }

    // Reset alerting flag after a delay
    setTimeout(() => {
      this.isAlerting = false;
    }, 2000);
  }

  /**
   * Critical alert (priority >= 9) - Fire alarm, smoke alarm, etc.
   */
  private async triggerCriticalAlert(hazard: HazardDetection) {
    // Strong continuous vibration
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Repeat critical alert pattern
    this.alertInterval = setInterval(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Small pause
      await new Promise(resolve => setTimeout(resolve, 100));
    }, 500); // Repeat every 500ms
  }

  /**
   * High alert (priority 7-8) - Sirens, glass breaking, etc.
   */
  private async triggerHighAlert(hazard: HazardDetection) {
    // Strong but less frequent vibration
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    this.alertInterval = setInterval(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await new Promise(resolve => setTimeout(resolve, 200));
    }, 1000);
  }

  /**
   * Medium alert (priority 5-6) - Car horns, baby crying, etc.
   */
  private async triggerMediumAlert(hazard: HazardDetection) {
    // Moderate vibration
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    this.alertInterval = setInterval(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise(resolve => setTimeout(resolve, 300));
    }, 1500);
  }

  /**
   * Low alert (priority < 5) - Dog barking, etc.
   */
  private async triggerLowAlert(hazard: HazardDetection) {
    // Light single vibration
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    this.alertInterval = setInterval(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise(resolve => setTimeout(resolve, 500));
    }, 2000);
  }

  /**
   * Stop ongoing alerts
   */
  stopAlert() {
    if (this.alertInterval) {
      clearInterval(this.alertInterval);
      this.alertInterval = null;
    }
    this.isAlerting = false;
  }

  /**
   * Get alert message for a hazard
   */
  getAlertMessage(hazard: HazardDetection): string {
    const messages: Record<string, string> = {
      fire_alarm: '🔥 Fire alarm detected! Evacuate immediately!',
      smoke_alarm: '⚠️ Smoke alarm detected! Check for smoke or fire!',
      siren: '🚨 Emergency siren detected nearby!',
      glass_breaking: '💥 Glass breaking sound detected!',
      car_horn: '🚗 Car horn detected - be careful!',
      baby_crying: '👶 Baby crying detected',
      dog_barking: '🐕 Dog barking detected',
    };

    const baseMessage = messages[hazard.type] || `Alert: ${hazard.type} detected`;
    
    if (hazard.urgency === 'critical') {
      return `🚨 CRITICAL: ${baseMessage}`;
    }
    
    return baseMessage;
  }

  /**
   * Get alert color based on urgency
   */
  getAlertColor(urgency: HazardDetection['urgency']): string {
    switch (urgency) {
      case 'critical':
        return '#FF0000'; // Red
      case 'high':
        return '#FF6600'; // Orange
      case 'medium':
        return '#FFAA00'; // Yellow
      case 'low':
        return '#FFD700'; // Gold
      default:
        return '#FFD700';
    }
  }
}

// Export singleton instance
export const hazardAlertService = new HazardAlertService();
export default hazardAlertService;

