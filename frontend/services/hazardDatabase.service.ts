import apiService from './api.service';

/**
 * Hazard Database Service
 * Handles fetching and managing hazard alerts from the database
 */

export interface HazardAlert {
  id: string;
  userId: string | null;
  type: string;
  confidence: number;
  timestamp: string;
  location: any;
  context: any;
  priority: number;
  isHazard: boolean;
  status: string;
  metadata?: {
    processingTime?: number;
    detectionsCount?: number;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HazardStats {
  total: number;
  byType: Record<string, number>;
  hazards: number;
  averageConfidence: number;
  byStatus: Record<string, number>;
}

class HazardDatabaseService {
  /**
   * Get all hazard alerts with optional filtering
   */
  async getHazardAlerts(params?: {
    userId?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<HazardAlert[]> {
    try {
      const queryParams: any = {
        isHazard: 'true',
        sortBy: 'timestamp',
        order: 'desc',
        ...params,
      };

      const response = await apiService.client.get('/api/sounds', {
        params: queryParams,
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching hazard alerts:', error);
      throw error;
    }
  }

  /**
   * Get a specific hazard alert by ID
   */
  async getHazardAlert(id: string): Promise<HazardAlert> {
    try {
      const response = await apiService.client.get(`/api/sounds/${id}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching hazard alert:', error);
      throw error;
    }
  }

  /**
   * Get hazard statistics summary
   */
  async getHazardStats(params?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<HazardStats> {
    try {
      const response = await apiService.client.get('/api/sounds/stats/summary', {
        params: {
          ...params,
          isHazard: 'true',
        },
      });

      return response.data.data;
    } catch (error) {
      console.error('Error fetching hazard stats:', error);
      throw error;
    }
  }

  /**
   * Update hazard alert status
   */
  async updateAlertStatus(id: string, status: string): Promise<HazardAlert> {
    try {
      const response = await apiService.client.patch(`/api/sounds/${id}`, {
        status,
      });
      return response.data.data;
    } catch (error) {
      console.error('Error updating alert status:', error);
      throw error;
    }
  }

  /**
   * Delete a hazard alert
   */
  async deleteAlert(id: string): Promise<void> {
    try {
      await apiService.client.delete(`/api/sounds/${id}`);
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  }
}

export const hazardDatabaseService = new HazardDatabaseService();
export default hazardDatabaseService;

