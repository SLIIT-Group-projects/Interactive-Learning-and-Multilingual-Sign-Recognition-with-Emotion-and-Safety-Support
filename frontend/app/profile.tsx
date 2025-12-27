import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
// Try to import expo-location, fallback if not available
let Location: any = null;
try {
  Location = require('expo-location');
} catch (e) {
  console.warn('expo-location not available');
}
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import placeService, { Place, CreatePlaceData } from '@/services/location.service';

type PlaceType = 'home' | 'school' | 'work' | 'custom';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const colors = Colors[colorScheme ?? 'light'];

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);

  // Form state
  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState<PlaceType>('custom');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Temporary user ID (replace with actual auth when ready)
  const userId = 'default-user'; // TODO: Get from auth service

  useEffect(() => {
    loadPlaces();
  }, []);

  useEffect(() => {
    placeService.setUserId(userId);
  }, [userId]);

  const loadPlaces = async () => {
    try {
      setLoading(true);
      const userPlaces = await placeService.getPlaces(userId);
      setPlaces(userPlaces);
    } catch (error: any) {
      console.error('Error loading places:', error);
      Alert.alert('Error', error.message || 'Failed to load places');
    } finally {
      setLoading(false);
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    if (!Location) {
      Alert.alert(
        'Location Not Available',
        'Please install expo-location package: npx expo install expo-location'
      );
      return false;
    }

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

  const getCurrentLocation = async () => {
    if (!Location) {
      Alert.alert(
        'Location Not Available',
        'Please install expo-location package: npx expo install expo-location'
      );
      return;
    }

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    try {
      setSaving(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);

      // Reverse geocode to get address
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (addresses.length > 0) {
          const addr = addresses[0];
          const formattedAddress = [
            addr.street,
            addr.city,
            addr.region,
            addr.postalCode,
          ]
            .filter(Boolean)
            .join(', ');
          setAddress(formattedAddress);
        }
      } catch (geocodeError) {
        console.warn('Geocoding failed:', geocodeError);
      }
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlace = async () => {
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

      const placeData: CreatePlaceData = {
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

      if (editingPlace) {
        await placeService.updatePlace(editingPlace.id!, placeData, userId);
        Alert.alert('Success', 'Place updated successfully');
      } else {
        await placeService.createPlace(placeData, userId);
        Alert.alert('Success', 'Place saved successfully');
      }

      // Reset form
      resetForm();
      loadPlaces();
    } catch (error: any) {
      console.error('Error saving place:', error);
      Alert.alert('Error', error.message || 'Failed to save place');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlace = (place: Place) => {
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
              await placeService.deletePlace(place.id!, userId);
              Alert.alert('Success', 'Place deleted successfully');
              loadPlaces();
            } catch (error: any) {
              console.error('Error deleting place:', error);
              Alert.alert('Error', error.message || 'Failed to delete place');
            }
          },
        },
      ]
    );
  };

  const handleEditPlace = (place: Place) => {
    setEditingPlace(place);
    setPlaceName(place.name);
    setPlaceType(place.type);
    setAddress(place.address || '');
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setShowAddForm(true);
  };

  const resetForm = () => {
    setPlaceName('');
    setPlaceType('custom');
    setAddress('');
    setLatitude(null);
    setLongitude(null);
    setEditingPlace(null);
    setShowAddForm(false);
  };

  const getPlaceIcon = (type: PlaceType) => {
    switch (type) {
      case 'home':
        return 'house.fill';
      case 'school':
        return 'book.fill';
      case 'work':
        return 'briefcase.fill';
      default:
        return 'mappin.circle.fill';
    }
  };

  const getPlaceColor = (type: PlaceType) => {
    switch (type) {
      case 'home':
        return '#4CAF50';
      case 'school':
        return '#2196F3';
      case 'work':
        return '#FF9800';
      default:
        return colors.tint;
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText style={styles.loadingText}>Loading places...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Saved Places
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Manage your frequently used locations
          </ThemedText>
        </ThemedView>

        {!showAddForm ? (
          <>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.tint }]}
              onPress={() => setShowAddForm(true)}>
              <IconSymbol name="plus.circle.fill" size={24} color="#fff" />
              <Text style={styles.addButtonText}>Add New Place</Text>
            </TouchableOpacity>

            {places.length === 0 ? (
              <ThemedView style={styles.emptyState}>
                <IconSymbol name="mappin.circle" size={64} color={colors.icon} />
                <ThemedText style={styles.emptyText}>No places saved yet</ThemedText>
                <ThemedText style={styles.emptySubtext}>
                  Tap "Add New Place" to get started
                </ThemedText>
              </ThemedView>
            ) : (
              <View style={styles.placesList}>
                {places.map((place) => (
                  <ThemedView key={place.id} style={styles.placeCard}>
                    <View style={styles.placeHeader}>
                      <View style={styles.placeIconContainer}>
                        <IconSymbol
                          name={getPlaceIcon(place.type)}
                          size={24}
                          color={getPlaceColor(place.type)}
                        />
                      </View>
                      <View style={styles.placeInfo}>
                        <ThemedText type="defaultSemiBold" style={styles.placeName}>
                          {place.name}
                        </ThemedText>
                        <ThemedText style={styles.placeType}>
                          {place.type.charAt(0).toUpperCase() + place.type.slice(1)}
                        </ThemedText>
                        {place.address && (
                          <ThemedText style={styles.placeAddress}>{place.address}</ThemedText>
                        )}
                        <ThemedText style={styles.placeCoordinates}>
                          {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.placeActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEditPlace(place)}>
                        <IconSymbol name="pencil" size={20} color={colors.tint} />
                        <Text style={[styles.actionText, { color: colors.tint }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeletePlace(place)}>
                        <IconSymbol name="trash" size={20} color="#FF3B30" />
                        <Text style={[styles.actionText, { color: '#FF3B30' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </ThemedView>
                ))}
              </View>
            )}
          </>
        ) : (
          <ThemedView style={styles.form}>
            <ThemedText type="subtitle" style={styles.formTitle}>
              {editingPlace ? 'Edit Place' : 'Add New Place'}
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Place Name</ThemedText>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.icon }]}
                placeholder="e.g., Home, School, Work"
                placeholderTextColor={colors.icon}
                value={placeName}
                onChangeText={setPlaceName}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Type</ThemedText>
              <View style={styles.typeButtons}>
                {(['home', 'school', 'work', 'custom'] as PlaceType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor:
                          placeType === type ? colors.tint : colors.background,
                        borderColor: colors.icon,
                      },
                    ]}
                    onPress={() => setPlaceType(type)}>
                    <Text
                      style={[
                        styles.typeButtonText,
                        { color: placeType === type ? '#fff' : colors.text },
                      ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Location</ThemedText>
              <TouchableOpacity
                style={[styles.locationButton, { backgroundColor: colors.tint }]}
                onPress={getCurrentLocation}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <IconSymbol name="location.fill" size={20} color="#fff" />
                    <Text style={styles.locationButtonText}>Use Current Location</Text>
                  </>
                )}
              </TouchableOpacity>

              {latitude !== null && longitude !== null && (
                <View style={styles.coordinates}>
                  <ThemedText style={styles.coordinateText}>
                    Lat: {latitude.toFixed(6)}
                  </ThemedText>
                  <ThemedText style={styles.coordinateText}>
                    Lng: {longitude.toFixed(6)}
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Address (Optional)</ThemedText>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.icon }]}
                placeholder="Street address"
                placeholderTextColor={colors.icon}
                value={address}
                onChangeText={setAddress}
                multiline
              />
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.icon }]}
                onPress={resetForm}>
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.tint }]}
                onPress={handleSavePlace}
                disabled={saving || !placeName.trim() || latitude === null || longitude === null}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  placesList: {
    gap: 16,
  },
  placeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  placeHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  placeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 18,
    marginBottom: 4,
  },
  placeType: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 4,
  },
  placeCoordinates: {
    fontSize: 12,
    opacity: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  placeActions: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  form: {
    marginTop: 8,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  coordinates: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 16,
  },
  coordinateText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    opacity: 0.7,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

