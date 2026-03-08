import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import notificationService from '../../../services/notification.service';
import hazardDatabaseService from '../../../services/hazardDatabase.service';

const ParentAlertDetailsScreen = ({ route }) => {
  const { userData } = useAuth();
  const parentId = userData?.uid;

  const incomingAlert = route?.params?.alertData || null;
  const notificationId = route?.params?.notificationId || incomingAlert?.id || null;

  const [alertData, setAlertData] = useState(incomingAlert);
  const [hazardRecord, setHazardRecord] = useState(null);
  const [relatedSafetyChecks, setRelatedSafetyChecks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAlertDetails = async () => {
    if (!parentId) return;

    setLoading(true);
    try {
      let latestAlert = incomingAlert;
      let linkedHazardRecord = null;
      if (notificationId) {
        const fetched = await notificationService.getNotificationById(parentId, notificationId);
        if (fetched) latestAlert = fetched;
      }
      setAlertData(latestAlert || null);

      if (latestAlert?.id && latestAlert?.read === false) {
        await notificationService.markAsRead(latestAlert.id).catch(() => {});
      }

      if (latestAlert?.soundId) {
        try {
          const sound = await hazardDatabaseService.getHazardAlert(latestAlert.soundId);
          linkedHazardRecord = sound || null;
          setHazardRecord(linkedHazardRecord);
        } catch (error) {
          console.error('Error loading linked hazard record:', error);
          setHazardRecord(null);
        }
      } else {
        setHazardRecord(null);
      }

      const allNotifications = await notificationService.getNotifications(parentId, { limit: 200 });
      const alertTimestamp = new Date(
        latestAlert?.timestamp || linkedHazardRecord?.timestamp || 0
      ).getTime();
      const alertHazardType = latestAlert?.hazardType || linkedHazardRecord?.type || null;
      const alertChildUserId = latestAlert?.childUserId || linkedHazardRecord?.userId || null;
      const MATCH_WINDOW_MS = 30 * 60 * 1000;

      const safetyChecks = allNotifications
        .filter((item) => {
          if (item.type !== 'critical_safety_check') return false;

          // Primary match: same soundId
          if (latestAlert?.soundId && item.soundId && item.soundId === latestAlert.soundId) {
            return true;
          }

          // Fallback match: same child + hazard type close to alert time
          const sameChild = alertChildUserId && item.childUserId === alertChildUserId;
          const sameHazard = alertHazardType && item.hazardType === alertHazardType;
          const itemTs = new Date(item.timestamp || item.createdAt || 0).getTime();
          const closeInTime =
            Number.isFinite(alertTimestamp) &&
            Number.isFinite(itemTs) &&
            Math.abs(itemTs - alertTimestamp) <= MATCH_WINDOW_MS;

          return Boolean(sameChild && sameHazard && closeInTime);
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp || b.createdAt || 0).getTime() -
            new Date(a.timestamp || a.createdAt || 0).getTime()
        );
      setRelatedSafetyChecks(safetyChecks);
    } catch (error) {
      console.error('Error loading alert details:', error);
      Alert.alert('Error', 'Failed to load full alert details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlertDetails();
  }, [parentId, notificationId]);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const getSafetySummary = (checks) => {
    if (!checks || checks.length === 0) return null;

    const latestCheck = checks[0];
    const allResponses = checks.flatMap((item) =>
      Array.isArray(item.responses) ? item.responses : []
    );
    const yesCount = allResponses.filter((item) => item?.answer === true).length;
    const noCount = allResponses.filter((item) => item?.answer === false).length;

    return {
      latestCheck,
      totalChecks: checks.length,
      totalAnswers: allResponses.length,
      yesCount,
      noCount,
    };
  };

  const getSafetyAnalysis = (summary) => {
    if (!summary?.latestCheck) return null;

    const { latestCheck, totalAnswers, yesCount, noCount } = summary;
    const yesRatio = totalAnswers > 0 ? yesCount / totalAnswers : 0;

    let riskLevel = 'High';
    let interpretation = 'Child may still need help.';
    let recommendation = 'Contact the child immediately and verify surroundings.';

    if (latestCheck.childConfirmedSafe && yesRatio >= 0.6) {
      riskLevel = 'Low';
      interpretation = 'Child responses indicate they are likely safe.';
      recommendation = 'Continue monitoring and confirm by call/message if needed.';
    } else if (latestCheck.childConfirmedSafe || yesRatio >= 0.4) {
      riskLevel = 'Medium';
      interpretation = 'Responses are mixed and need parent follow-up.';
      recommendation = 'Check location and ask the child to move to a safe place.';
    }

    const confidenceText =
      totalAnswers > 0
        ? `Based on ${totalAnswers} answer${totalAnswers > 1 ? 's' : ''} (${yesCount} positive, ${noCount} negative).`
        : 'No answer details were available for deeper analysis.';

    return {
      riskLevel,
      interpretation,
      recommendation,
      confidenceText,
    };
  };

  const hazardTypeLabel = useMemo(() => {
    const type = hazardRecord?.type || alertData?.hazardType || 'Unknown';
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }, [hazardRecord?.type, alertData?.hazardType]);

  const locationLabel = useMemo(() => {
    if (alertData?.locationText) return alertData.locationText;
    const location = alertData?.location || hazardRecord?.location;
    if (location?.coordinates?.length >= 2) {
      return `${location.coordinates[1]}, ${location.coordinates[0]}`;
    }
    if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
      return `${location.latitude}, ${location.longitude}`;
    }
    return 'Location not available';
  }, [alertData?.locationText, alertData?.location, hazardRecord?.location]);

  const safetySummary = useMemo(
    () => getSafetySummary(relatedSafetyChecks),
    [relatedSafetyChecks]
  );
  const safetyAnalysis = useMemo(
    () => getSafetyAnalysis(safetySummary),
    [safetySummary]
  );

  const openMaps = async () => {
    const location = alertData?.location || hazardRecord?.location;
    let mapsUrl = null;

    if (location?.coordinates?.length >= 2) {
      const [lng, lat] = location.coordinates;
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    } else if (locationLabel && locationLabel !== 'Location not available') {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`;
    }

    if (!mapsUrl) {
      Alert.alert('Location Unavailable', 'No location information is available for this alert.');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(mapsUrl);
      if (!canOpen) {
        Alert.alert('Unable to Open Maps', 'Could not open maps on this device.');
        return;
      }
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('Error opening maps URL:', error);
      Alert.alert('Error', 'Failed to open maps.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading alert details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Critical Alert Details</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alert Summary</Text>
          <Text style={styles.label}>Child</Text>
          <Text style={styles.value}>{alertData?.childName || 'Unknown child'}</Text>
          <Text style={styles.label}>Hazard Type</Text>
          <Text style={styles.value}>{hazardTypeLabel}</Text>
          <Text style={styles.label}>Triggered At</Text>
          <Text style={styles.value}>{formatDateTime(alertData?.timestamp || hazardRecord?.timestamp)}</Text>
          <Text style={styles.label}>Priority</Text>
          <Text style={styles.value}>{alertData?.priority || hazardRecord?.priority || 'N/A'}</Text>
          <Text style={styles.label}>Message</Text>
          <Text style={styles.value}>{alertData?.message || 'No message available'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <Text style={styles.value}>{locationLabel}</Text>
          <TouchableOpacity style={styles.mapButton} onPress={openMaps}>
            <MaterialIcons name="place" size={18} color="#fff" />
            <Text style={styles.mapButtonText}>Open in Maps</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Detection Data</Text>
          <Text style={styles.label}>Confidence</Text>
          <Text style={styles.value}>
            {hazardRecord?.confidence !== undefined
              ? `${(hazardRecord.confidence * 100).toFixed(0)}%`
              : 'N/A'}
          </Text>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{hazardRecord?.status || 'N/A'}</Text>
          <Text style={styles.label}>Sound Record ID</Text>
          <Text style={styles.value}>{alertData?.soundId || 'N/A'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Follow-Up Safety Check</Text>
          {relatedSafetyChecks.length === 0 ? (
            <Text style={styles.value}>No follow-up safety check submitted yet.</Text>
          ) : (
            <View style={styles.safetyItem}>
              <Text style={styles.label}>Analyzed Result</Text>
              <Text style={styles.value}>
                Risk Level: {safetyAnalysis?.riskLevel || 'Unknown'}
              </Text>
              <Text style={styles.answerRow}>{safetyAnalysis?.interpretation || 'No interpretation available.'}</Text>
              <Text style={styles.answerRow}>{safetyAnalysis?.confidenceText || ''}</Text>
              <Text style={styles.answerRow}>Recommended Action: {safetyAnalysis?.recommendation || 'Review alert details and contact child.'}</Text>
              <Text style={styles.safetyTimestamp}>
                Last follow-up: {formatDateTime(safetySummary?.latestCheck?.timestamp || safetySummary?.latestCheck?.createdAt)}
              </Text>
              <Text style={styles.answerRow}>Follow-up submissions considered: {safetySummary?.totalChecks || 0}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 28 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  loadingText: { marginTop: 8, color: '#6b7280' },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8 },
  label: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  value: { fontSize: 14, color: '#1f2937', marginTop: 2 },
  mapButton: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapButtonText: { color: '#fff', fontWeight: '600' },
  safetyItem: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    marginTop: 8,
  },
  safetyTimestamp: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  answerRow: { fontSize: 13, color: '#374151', marginTop: 3 },
});

export default ParentAlertDetailsScreen;
