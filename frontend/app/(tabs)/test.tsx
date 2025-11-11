import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Vibration } from 'react-native';

export default function HomeScreen() {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    // Temporary mock alert — replace with backend data later
    const mockAlert = {
      sound: 'Fire Alarm',
      priority: 'High',
      message: 'Evacuate immediately!',
    };
    setAlert(mockAlert);
    Vibration.vibrate(2000);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hazard Detection</Text>

      {alert ? (
        <View style={styles.alertBox}>
          <Text style={styles.sound}>{alert.sound}</Text>
          <Text style={styles.priority}>Priority: {alert.priority}</Text>
          <Text style={styles.message}>{alert.message}</Text>
        </View>
      ) : (
        <Text style={styles.waiting}>Listening for hazards...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  title: { fontSize: 24, color: '#FFD700', fontWeight: 'bold', marginBottom: 20 },
  alertBox: { backgroundColor: '#FF5555', padding: 25, borderRadius: 12, alignItems: 'center', width: '80%' },
  sound: { fontSize: 22, color: '#fff', fontWeight: 'bold' },
  priority: { fontSize: 18, color: '#fff' },
  message: { fontSize: 16, color: '#fff', marginTop: 10 },
  waiting: { color: '#ccc', fontSize: 16 },
});
