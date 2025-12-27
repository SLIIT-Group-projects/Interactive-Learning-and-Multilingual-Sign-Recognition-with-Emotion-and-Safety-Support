import express from 'express';
import { db } from '../firebase/admin.js';
import { createPlaceDocument, validatePlaceData, formatPlaceResponse } from '../models/location.model.js';

const router = express.Router();
const PLACES_COLLECTION = 'places';

/**
 * GET /api/places
 * Get all places for the authenticated user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(400).json({
        error: 'UserId is required',
        details: 'Provide userId as query parameter or x-user-id header'
      });
    }

    const placesSnapshot = await db.collection(PLACES_COLLECTION)
      .where('userId', '==', userId)
      .get();

    const places = [];
    placesSnapshot.forEach(doc => {
      const place = formatPlaceResponse(doc);
      if (place) {
        places.push(place);
      }
    });

    // Sort by createdAt descending (newest first) in memory to avoid needing a composite index
    places.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Descending order
    });

    res.json({
      success: true,
      data: places,
      count: places.length
    });
  } catch (error) {
    console.error('❌ Error fetching places:', error);
    next(error);
  }
});

/**
 * GET /api/places/:id
 * Get a specific place by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.headers['x-user-id'];

    const placeDoc = await db.collection(PLACES_COLLECTION).doc(id).get();

    if (!placeDoc.exists) {
      return res.status(404).json({
        error: 'Place not found'
      });
    }

    const place = formatPlaceResponse(placeDoc);

    // Verify ownership if userId is provided
    if (userId && place.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        details: 'You do not have permission to access this place'
      });
    }

    res.json({
      success: true,
      data: place
    });
  } catch (error) {
    console.error('❌ Error fetching place:', error);
    next(error);
  }
});

/**
 * POST /api/places
 * Create a new place
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'UserId is required',
        details: 'Provide userId in request body or x-user-id header'
      });
    }

    const placeData = {
      ...req.body,
      userId: userId,
    };

    // Validate place data
    const validation = validatePlaceData(placeData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Create place document
    const placeDoc = createPlaceDocument(placeData);
    const docRef = await db.collection(PLACES_COLLECTION).add(placeDoc);

    // Fetch the created document
    const createdDoc = await docRef.get();
    const place = formatPlaceResponse(createdDoc);

    console.log(`💾 Created place: ${place.name} (ID: ${docRef.id})`);

    res.status(201).json({
      success: true,
      data: place
    });
  } catch (error) {
    console.error('❌ Error creating place:', error);
    next(error);
  }
});

/**
 * PUT /api/places/:id
 * Update an existing place
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'UserId is required'
      });
    }

    // Check if place exists and belongs to user
    const placeDoc = await db.collection(PLACES_COLLECTION).doc(id).get();

    if (!placeDoc.exists) {
      return res.status(404).json({
        error: 'Place not found'
      });
    }

    const existingPlace = placeDoc.data();
    if (existingPlace.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        details: 'You do not have permission to update this place'
      });
    }

    // Prepare update data (don't allow userId change)
    const updateData = {
      ...req.body,
      userId: userId, // Ensure userId matches
      updatedAt: new Date(),
    };

    // Remove fields that shouldn't be updated
    delete updateData.createdAt;
    delete updateData.id;

    // Validate update data
    const validation = validatePlaceData(updateData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Update place
    await db.collection(PLACES_COLLECTION).doc(id).update(updateData);

    // Fetch updated document
    const updatedDoc = await db.collection(PLACES_COLLECTION).doc(id).get();
    const place = formatPlaceResponse(updatedDoc);

    console.log(`✏️ Updated place: ${place.name} (ID: ${id})`);

    res.json({
      success: true,
      data: place
    });
  } catch (error) {
    console.error('❌ Error updating place:', error);
    next(error);
  }
});

/**
 * DELETE /api/places/:id
 * Delete a place
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'UserId is required'
      });
    }

    // Check if place exists and belongs to user
    const placeDoc = await db.collection(PLACES_COLLECTION).doc(id).get();

    if (!placeDoc.exists) {
      return res.status(404).json({
        error: 'Place not found'
      });
    }

    const place = placeDoc.data();
    if (place.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        details: 'You do not have permission to delete this place'
      });
    }

    // Delete place
    await db.collection(PLACES_COLLECTION).doc(id).delete();

    console.log(`🗑️ Deleted place: ${place.name} (ID: ${id})`);

    res.json({
      success: true,
      message: 'Place deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting place:', error);
    next(error);
  }
});

export default router;

