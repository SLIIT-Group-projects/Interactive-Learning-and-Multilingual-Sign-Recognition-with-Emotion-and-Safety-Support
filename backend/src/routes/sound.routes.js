import express from 'express';
import { db } from '../firebase/admin.js';
import { createSoundDocument, validateSoundData, formatSoundResponse } from '../models/sound.model.js';

const router = express.Router();
const SOUNDS_COLLECTION = 'sounds';

/**
 * POST /api/sounds
 * Create a new sound record
 */
router.post('/', async (req, res, next) => {
  try {
    const soundData = req.body;
    
    // Validate input data
    const validation = validateSoundData(soundData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }
    
    // Create sound document
    const soundDoc = createSoundDocument(soundData);
    
    // Save to Firestore
    const docRef = await db.collection(SOUNDS_COLLECTION).add(soundDoc);
    
    // Fetch the created document
    const createdDoc = await docRef.get();
    const formattedSound = formatSoundResponse(createdDoc);
    
    res.status(201).json({
      success: true,
      data: formattedSound
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sounds
 * Get all sounds with optional filtering and pagination
 * Query params:
 *   - userId: Filter by user ID
 *   - type: Filter by sound type
 *   - isHazard: Filter by hazard status (true/false)
 *   - status: Filter by status
 *   - startDate: Filter sounds after this date (ISO string)
 *   - endDate: Filter sounds before this date (ISO string)
 *   - limit: Maximum number of results (default: 50)
 *   - offset: Number of results to skip (default: 0)
 *   - sortBy: Field to sort by (default: 'timestamp')
 *   - order: Sort order 'asc' or 'desc' (default: 'desc')
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      userId,
      type,
      isHazard,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      sortBy = 'timestamp',
      order = 'desc'
    } = req.query;
    
    let query = db.collection(SOUNDS_COLLECTION);
    
    // Apply filters
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    
    if (type) {
      query = query.where('type', '==', type);
    }
    
    if (isHazard !== undefined) {
      const hazardValue = isHazard === 'true' || isHazard === true;
      query = query.where('isHazard', '==', hazardValue);
    }
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (startDate) {
      query = query.where('timestamp', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('timestamp', '<=', endDate);
    }
    
    // Note: We avoid orderBy in Firestore queries when combined with where clauses
    // to prevent needing composite indexes. We'll sort in memory instead.
    // Firestore requires an index even for single filter + orderBy combinations
    const hasFilters = [userId, type, isHazard, status, startDate, endDate].filter(Boolean).length > 0;
    
    let snapshot;
    // Always sort in memory if we have any filters to avoid index requirements
    if (!hasFilters && sortBy === 'timestamp') {
      // Only use Firestore orderBy if we have no filters at all
      const sortOrder = order === 'asc' ? 'asc' : 'desc';
      query = query.orderBy(sortBy, sortOrder);
      snapshot = await query.get();
    } else {
      // Fetch all matching documents and sort in memory
      snapshot = await query.get();
    }
    
    // Format results
    const sounds = [];
    snapshot.forEach(doc => {
      const formatted = formatSoundResponse(doc);
      if (formatted) {
        sounds.push(formatted);
      }
    });
    
    // Sort in memory if we have filters or if sortBy is not timestamp
    if (hasFilters || sortBy !== 'timestamp') {
      const sortOrder = order === 'asc' ? 1 : -1;
      sounds.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        // Handle timestamp strings
        if (sortBy === 'timestamp' || sortBy === 'createdAt' || sortBy === 'updatedAt') {
          aValue = aValue ? new Date(aValue).getTime() : 0;
          bValue = bValue ? new Date(bValue).getTime() : 0;
        }
        
        // Handle numeric values
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return (aValue - bValue) * sortOrder;
        }
        
        // Handle string values
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return aValue.localeCompare(bValue) * sortOrder;
        }
        
        return 0;
      });
    }
    
    // Apply pagination after sorting
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page
    const offsetNum = parseInt(offset) || 0;
    const total = sounds.length;
    const paginatedSounds = sounds.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      success: true,
      data: paginatedSounds,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + paginatedSounds.length < total
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sounds/:id
 * Get a specific sound by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const doc = await db.collection(SOUNDS_COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Sound not found'
      });
    }
    
    const formattedSound = formatSoundResponse(doc);
    
    res.json({
      success: true,
      data: formattedSound
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/sounds/:id
 * Update a sound record
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Check if document exists
    const docRef = db.collection(SOUNDS_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Sound not found'
      });
    }
    
    // Validate update data (only validate fields that are being updated)
    if (updateData.type || updateData.confidence !== undefined) {
      const validation = validateSoundData(updateData);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }
    }
    
    // Prepare update object (exclude fields that shouldn't be updated)
    const allowedFields = [
      'type', 'confidence', 'location', 'context', 'audioFileUrl',
      'metadata', 'priority', 'isHazard', 'status'
    ];
    
    const updateObject = {
      updatedAt: new Date()
    };
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateObject[field] = updateData[field];
      }
    });
    
    // Update document
    await docRef.update(updateObject);
    
    // Fetch updated document
    const updatedDoc = await docRef.get();
    const formattedSound = formatSoundResponse(updatedDoc);
    
    res.json({
      success: true,
      data: formattedSound
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/sounds/:id
 * Partially update a sound record
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Check if document exists
    const docRef = db.collection(SOUNDS_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Sound not found'
      });
    }
    
    // Validate update data if relevant fields are present
    if (updateData.type || updateData.confidence !== undefined) {
      const validation = validateSoundData(updateData);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }
    }
    
    // Prepare update object
    const allowedFields = [
      'type', 'confidence', 'location', 'context', 'audioFileUrl',
      'metadata', 'priority', 'isHazard', 'status'
    ];
    
    const updateObject = {
      updatedAt: new Date()
    };
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'metadata' && typeof updateData[field] === 'object') {
          // Merge metadata instead of replacing
          const currentData = doc.data();
          updateObject[field] = {
            ...(currentData.metadata || {}),
            ...updateData[field]
          };
        } else {
          updateObject[field] = updateData[field];
        }
      }
    });
    
    // Update document
    await docRef.update(updateObject);
    
    // Fetch updated document
    const updatedDoc = await docRef.get();
    const formattedSound = formatSoundResponse(updatedDoc);
    
    res.json({
      success: true,
      data: formattedSound
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sounds/:id
 * Delete a sound record
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const docRef = db.collection(SOUNDS_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Sound not found'
      });
    }
    
    await docRef.delete();
    
    res.json({
      success: true,
      message: 'Sound deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sounds/stats/summary
 * Get statistics summary of sounds
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { userId, startDate, endDate, isHazard } = req.query;
    
    let query = db.collection(SOUNDS_COLLECTION);
    
    // Apply isHazard filter first if provided
    if (isHazard !== undefined) {
      const hazardValue = isHazard === 'true' || isHazard === true;
      query = query.where('isHazard', '==', hazardValue);
    }
    
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    
    if (startDate) {
      query = query.where('timestamp', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('timestamp', '<=', endDate);
    }
    
    const snapshot = await query.get();
    
    const stats = {
      total: 0,
      byType: {},
      hazards: 0,
      averageConfidence: 0,
      byStatus: {}
    };
    
    let totalConfidence = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;
      
      // Count by type
      const type = data.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // Count hazards
      if (data.isHazard) {
        stats.hazards++;
      }
      
      // Sum confidence
      if (data.confidence !== undefined) {
        totalConfidence += data.confidence;
      }
      
      // Count by status
      const status = data.status || 'detected';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });
    
    // Calculate average confidence
    if (stats.total > 0) {
      stats.averageConfidence = totalConfidence / stats.total;
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

export default router;

