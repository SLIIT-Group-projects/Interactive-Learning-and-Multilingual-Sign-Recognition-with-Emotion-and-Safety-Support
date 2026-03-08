import apiService from './api.service';

/**
 * Place Service
 * Handles API calls for user saved places
 */

export interface Place {
  id?: string;
  userId: string;
  name: string;
  type: 'home' | 'school' | 'work' | 'custom';
  latitude: number;
  longitude: number;
  address?: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePlaceData {
  name: string;
  type: 'home' | 'school' | 'work' | 'custom';
  latitude: number;
  longitude: number;
  address?: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  metadata?: Record<string, any>;
}

class PlaceService {
  private userId: string | null = null;

  /**
   * Set the current user ID
   */
  setUserId(userId: string | null) {
    this.userId = userId;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.userId;
  }

  /**
   * Get all places for the current user
   */
  async getPlaces(userId?: string): Promise<Place[]> {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      const response = await apiService.client.get('/api/places', {
        params: { userId: targetUserId },
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching places:', error);
      throw error;
    }
  }

  /**
   * Get a specific place by ID
   */
  async getPlace(id: string, userId?: string): Promise<Place> {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      const response = await apiService.client.get(`/api/places/${id}`, {
        params: { userId: targetUserId },
      });

      return response.data.data;
    } catch (error) {
      console.error('Error fetching place:', error);
      throw error;
    }
  }

  /**
   * Create a new place
   */
  async createPlace(data: CreatePlaceData, userId?: string): Promise<Place> {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      const response = await apiService.client.post('/api/places', {
        ...data,
        userId: targetUserId,
      });

      return response.data.data;
    } catch (error) {
      console.error('Error creating place:', error);
      throw error;
    }
  }

  /**
   * Update an existing place
   */
  async updatePlace(id: string, data: Partial<CreatePlaceData>, userId?: string): Promise<Place> {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      const response = await apiService.client.put(`/api/places/${id}`, {
        ...data,
        userId: targetUserId,
      });

      return response.data.data;
    } catch (error) {
      console.error('Error updating place:', error);
      throw error;
    }
  }

  /**
   * Delete a place
   */
  async deletePlace(id: string, userId?: string): Promise<void> {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      await apiService.client.delete(`/api/places/${id}`, {
        params: { userId: targetUserId },
      });
    } catch (error) {
      console.error('Error deleting place:', error);
      throw error;
    }
  }
}

export const placeService = new PlaceService();
export default placeService;

