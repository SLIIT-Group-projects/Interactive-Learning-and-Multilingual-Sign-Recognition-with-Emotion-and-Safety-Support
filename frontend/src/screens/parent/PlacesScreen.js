import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import placeService from '../../../services/location.service';

/**
 * Parent Places Screen
 * Allows a parent to save and manage important places (home, school, etc.)
 * Uses the same backend / database as the existing Expo Router profile screen.
 */

const DEFAULT_PLACE_TYPE = 'custom';

const PlacesScreen = () => {
  const { userData } = useAuth();
  const userId = userData?.uid || null;

  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);

  // Form state
  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState(DEFAULT_PLACE_TYPE);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    placeService.setUserId(userId);
    loadPlaces();
  }, [userId]);

  const loadPlaces = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const userPlaces = await placeService.getPlaces(userId);
      setPlaces(userPlaces);
    } catch (error) {
      console.error('Error loading places:', error);
      Alert.alert('Error', error.message || 'Failed to load places');
    } finally {
      setLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to save your current location.'
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  };

  const handleUseCurrentLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    try {
      setSaving(true);
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);

      // Reverse geocode to get address (best effort)
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        if (addresses.length > 0) {
          const addr = addresses[0];
          const formatted = [
            addr.street,
            addr.city,
            addr.region,
            addr.postalCode,
          ]
            .filter(Boolean)
            .join(', ');
          setAddress(formatted);
        }
      } catch (geocodeError) {
        console.warn('Geocoding failed:', geocodeError);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setPlaceName('');
    setPlaceType(DEFAULT_PLACE_TYPE);
    setAddress('');
    setLatitude(null);
    setLongitude(null);
    setEditingPlace(null);
    setShowForm(false);
  };

  const handleEditPlace = (place) => {
    setEditingPlace(place);
    setPlaceName(place.name);
    setPlaceType(place.type || DEFAULT_PLACE_TYPE);
    setAddress(place.address || '');
    setLatitude(place.latitude || null);
    setLongitude(place.longitude || null);
    setShowForm(true);
  };

  const handleDeletePlace = (place) => {
    Alert.alert(
      'Delete Place',
      `Are you sure you want to delete "${place.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await placeService.deletePlace(place.id, userId || undefined);
              await loadPlaces();
            } catch (error) {
              console.error('Error deleting place:', error);
              Alert.alert('Error', error.message || 'Failed to delete place');
            }
          },
        },
      ]
    );
  };

  const handleSavePlace = async () => {
    if (!userId) {
      Alert.alert('Error', 'User not found. Please log in again.');
      return;
    }
    if (!placeName.trim()) {
      Alert.alert('Validation Error', 'Please enter a place name');
      return;
    }
    if (latitude === null || longitude === null) {
      Alert.alert('Validation Error', 'Please set the location coordinates');
      return;
    }

    try {
      setSaving(true);
      const placeData = {
        name: placeName.trim(),
        type: placeType,
        latitude,
        longitude,
        address: address.trim() || undefined,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
      };

      if (editingPlace && editingPlace.id) {
        await placeService.updatePlace(editingPlace.id, placeData, userId);
      } else {
        await placeService.createPlace(placeData, userId);
      }

      resetForm();
      await loadPlaces();
    } catch (error) {
      console.error('Error saving place:', error);
      Alert.alert('Error', error.message || 'Failed to save place');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading your places...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Safe Places</Text>
          <Text style={styles.subtitle}>
            Save important locations like home, school, and work
          </Text>
        </View>

        {/* Places list */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Your Places</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowForm(true)}
            >
              <MaterialIcons name="add-location-alt" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Place</Text>
            </TouchableOpacity>
          </View>

          {places.length === 0 ? (
            <Text style={styles.emptyText}>
              You haven't saved any places yet.
            </Text>
          ) : (
            places.map((place) => (
              <View key={place.id} style={styles.placeItem}>
                <View style={styles.placeInfo}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  {place.address ? (
                    <Text style={styles.placeAddress}>{place.address}</Text>
                  ) : (
                    <Text style={styles.placeAddress}>
                      {place.latitude?.toFixed(4)}, {place.longitude?.toFixed(4)}
                    </Text>
                  )}
                </View>
                <View style={styles.placeActions}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleEditPlace(place)}
                  >
                    <MaterialIcons name="edit" size={20} color="#4b5563" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleDeletePlace(place)}
                  >
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Add / Edit place form */}
        {showForm && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {editingPlace ? 'Edit Place' : 'Add New Place'}
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Home, School"
              value={placeName}
              onChangeText={setPlaceName}
            />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {['home', 'school', 'work', 'custom'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    placeType === type && styles.typeChipActive,
                  ]}
                  onPress={() => setPlaceType(type)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      placeType === type && styles.typeChipTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Address (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Street, City, etc."
              value={address}
              onChangeText={setAddress}
            />

            <Text style={styles.label}>Coordinates</Text>
            <View style={styles.coordsRow}>
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Latitude"
                keyboardType="numeric"
                value={latitude !== null ? String(latitude) : ''}
                onChangeText={(v) => setLatitude(v ? parseFloat(v) : null)}
              />
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Longitude"
                keyboardType="numeric"
                value={longitude !== null ? String(longitude) : ''}
                onChangeText={(v) => setLongitude(v ? parseFloat(v) : null)}
              />
            </View>

            <TouchableOpacity
              style={styles.locationButton}
              onPress={handleUseCurrentLocation}
              disabled={saving}
            >
              <MaterialIcons
                name="my-location"
                size={20}
                color="#2563eb"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.locationButtonText}>
                Use Current Location
              </Text>
            </TouchableOpacity>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.formButton, styles.cancelButton]}
                onPress={resetForm}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formButton, styles.saveButton]}
                onPress={handleSavePlace}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2ff', // indigo-50
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
  },
  scroll: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  loadingText: {
    marginTop: 8,
    color: '#4b5563',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyText: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  placeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  placeInfo: {
    flex: 1,
    marginRight: 8,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  placeAddress: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  placeActions: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: 6,
    marginLeft: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#f9fafb',
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  coordInput: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  typeChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  typeChipText: {
    fontSize: 13,
    color: '#4b5563',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  locationButtonText: {
    color: '#2563eb',
    fontWeight: '500',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
  formButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  cancelButton: {
    backgroundColor: '#e5e7eb',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#4f46e5',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default PlacesScreen;

