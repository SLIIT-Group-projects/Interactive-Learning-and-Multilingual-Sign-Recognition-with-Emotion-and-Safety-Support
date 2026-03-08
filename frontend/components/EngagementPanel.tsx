import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type Emotion = 'Calm' | 'Happy' | 'Sad';
export type Intensity = 'Low' | 'Medium' | 'High';

type Props = {
	emotion: Emotion;
	intensity: Intensity;
	onSetEmotion: (e: Emotion) => void;
	onSetIntensity: (i: Intensity) => void;
};

export const EngagementPanel: React.FC<Props> = ({ emotion, intensity, onSetEmotion, onSetIntensity }) => {
	const stateLabel = `${emotion} & ${intensity === 'Low' ? 'Focused' : intensity === 'Medium' ? 'Somewhat Active' : 'Highly Active'}`;
	return (
		<View style={styles.container}>
			<Text style={styles.header}>Engagement</Text>
			<View style={styles.row}>
				<View style={styles.group}>
					<Text style={styles.label}>Emotion</Text>
					<View style={styles.buttonsRow}>
						{(['Calm', 'Happy', 'Sad'] as Emotion[]).map(e => (
							<TouchableOpacity key={e} style={[styles.button, emotion === e && styles.buttonActive]} onPress={() => onSetEmotion(e)}>
								<Text style={[styles.btnText, emotion === e && styles.btnTextActive]}>{e}</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
				<View style={styles.group}>
					<Text style={styles.label}>Hand Intensity</Text>
					<View style={styles.buttonsRow}>
						{(['Low', 'Medium', 'High'] as Intensity[]).map(i => (
							<TouchableOpacity key={i} style={[styles.button, intensity === i && styles.buttonActive]} onPress={() => onSetIntensity(i)}>
								<Text style={[styles.btnText, intensity === i && styles.btnTextActive]}>{i}</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
			</View>
			<View style={styles.stateRow}>
				<Text style={styles.stateLabel}>State:</Text>
				<Text style={styles.stateValue}>{stateLabel}</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: '#fff',
		padding: 12,
		borderRadius: 12,
		marginTop: 16,
		elevation: 2,
	},
	header: { fontWeight: '700', fontSize: 16, marginBottom: 8, color: '#333' },
	row: { flexDirection: 'row', justifyContent: 'space-between' },
	group: { flex: 1, marginRight: 8 },
	label: { fontSize: 12, color: '#666', marginBottom: 6 },
	buttonsRow: { flexDirection: 'row' },
	button: {
		paddingHorizontal: 8,
		paddingVertical: 6,
		backgroundColor: '#F1F1F1',
		borderRadius: 8,
		marginRight: 8,
	},
	buttonActive: { backgroundColor: '#07BDD6' },
	btnText: { color: '#333', fontWeight: '600' },
	btnTextActive: { color: '#fff' },
	stateRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
	stateLabel: { fontWeight: '700', marginRight: 8 },
	stateValue: { color: '#555' },
});
