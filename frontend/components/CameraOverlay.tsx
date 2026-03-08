import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, Platform } from 'react-native';
// If you don't have expo-camera installed, install with: expo install expo-camera
import { Camera } from 'expo-camera';

type Props = {
	permissionGranted: boolean;
	onEnablePress: () => void;
	cameraRef?: React.RefObject<Camera>;
};

export const CameraOverlay: React.FC<Props> = ({ permissionGranted, onEnablePress, cameraRef }) => {
	const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
			onPanResponderRelease: () => {
				// Keep position
			},
		})
	).current;

	return (
		<Animated.View
			style={[styles.overlay, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
			{...panResponder.panHandlers}
		>
			{permissionGranted ? (
				// Camera preview (small). If expo-camera isn't installed, replace with a placeholder box.
				<View style={styles.camWrap}>
					{/* Replace below with:
					   <Camera ref={cameraRef} style={{flex: 1}} ratio="16:9" />
					   (expo-camera must be installed)
					*/}
					<Camera style={styles.camera} ref={cameraRef} ratio="4:3" />
				</View>
			) : (
				<View style={styles.placeholder}>
					<Text style={styles.camIcon}>📷</Text>
					<Text style={styles.camText}>Camera</Text>
					<TouchableOpacity onPress={onEnablePress} style={styles.enableBtn}>
						<Text style={styles.enableText}>Enable Camera</Text>
					</TouchableOpacity>
				</View>
			)}
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	overlay: {
		position: 'absolute',
		top: 12,
		right: 12,
		width: 120,
		height: 160,
		borderRadius: 12,
		overflow: 'hidden',
		backgroundColor: '#fff',
		elevation: 6,
		shadowColor: '#000',
		shadowOpacity: 0.15,
		shadowRadius: 6,
	},
	placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
	camIcon: { fontSize: 28 },
	camText: { marginTop: 6, fontWeight: '700', color: '#333' },
	enableBtn: { marginTop: 8, backgroundColor: '#07BDD6', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
	enableText: { color: '#fff', fontWeight: '700' },
	camWrap: { flex: 1, backgroundColor: '#000' },
	camera: { flex: 1 },
});
