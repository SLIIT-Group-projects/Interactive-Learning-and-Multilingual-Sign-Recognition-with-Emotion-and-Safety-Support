import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Story } from '../data/stories';

type Props = {
	story: Story;
	onPress: () => void;
};

export const StoryCard: React.FC<Props> = ({ story, onPress }) => {
	const levelColors = {
		Easy: { bg: '#FFFCF3', border: '#F0E6B6', text: '#7A5B00' },
		Medium: { bg: '#F3F8FF', border: '#B6D0F0', text: '#1A4D7A' },
		Hard: { bg: '#FFF0F0', border: '#F0B6B6', text: '#7A1A1A' },
	};

	const levelStyle = levelColors[story.level] || levelColors.Easy;

	// Determine image source - prefer local imageSource, then imageUrl, then fallback to emoji
	const imageSource = story.imageSource 
		? (typeof story.imageSource === 'string' ? { uri: story.imageSource } : story.imageSource)
		: story.imageUrl 
			? { uri: story.imageUrl }
			: null;

	return (
		<TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
			{/* Story Image */}
			<View style={styles.imageContainer}>
				{imageSource ? (
					<Image 
						source={imageSource} 
						style={styles.storyImage}
						resizeMode="cover"
						contentFit="cover"
					/>
				) : (
					<View style={[styles.imagePlaceholder, { backgroundColor: story.coverColor }]}>
						<Text style={styles.emoji}>{story.emoji ?? '📘'}</Text>
					</View>
				)}
			</View>

			{/* Content */}
			<View style={styles.content}>
				<View style={styles.headerRow}>
					<Text style={styles.title} numberOfLines={2}>
						{story.title}
					</Text>
					<View style={[styles.levelBadge, { 
						backgroundColor: levelStyle.bg,
						borderColor: levelStyle.border,
					}]}>
						<Text style={[styles.levelText, { color: levelStyle.text }]}>
							{story.level}
						</Text>
					</View>
				</View>

				<Text style={styles.description} numberOfLines={2}>
					{story.moral}
				</Text>

				<View style={styles.footerRow}>
					<View style={styles.timeBadge}>
						<Text style={styles.timeText}>{story.timeMin}min</Text>
					</View>
					{story.uploadedOn && (
						<Text style={styles.dateText}>{story.uploadedOn}</Text>
					)}
					<TouchableOpacity style={styles.readBtn} onPress={onPress}>
						<Text style={styles.readBtnText}>Read</Text>
					</TouchableOpacity>
				</View>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	card: {
		width: '100%',
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 14,
		marginBottom: 16,
		flexDirection: 'row',
		alignItems: 'flex-start',
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
	},
	imageContainer: {
		width: 100,
		height: 100,
		borderRadius: 12,
		overflow: 'hidden',
		marginRight: 14,
		backgroundColor: '#f0f0f0',
	},
	storyImage: {
		width: '100%',
		height: '100%',
	},
	imagePlaceholder: {
		width: '100%',
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center',
	},
	emoji: { 
		fontSize: 48 
	},
	content: { 
		flex: 1, 
		justifyContent: 'space-between',
		minHeight: 100,
	},
	headerRow: { 
		flexDirection: 'row', 
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		marginBottom: 8,
	},
	title: { 
		fontSize: 16, 
		fontWeight: '900', 
		color: '#212121', 
		flex: 1, 
		marginRight: 8,
		lineHeight: 22,
	},
	levelBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 1,
		alignSelf: 'flex-start',
	},
	levelText: { 
		fontSize: 11, 
		fontWeight: '900',
	},
	description: { 
		fontSize: 13, 
		color: '#666',
		marginBottom: 12,
		lineHeight: 18,
	},
	footerRow: { 
		flexDirection: 'row', 
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: 8,
	},
	timeBadge: {
		backgroundColor: '#FFF9E6',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
	},
	timeText: { 
		fontSize: 12, 
		fontWeight: '700', 
		color: '#B8860B',
	},
	dateText: { 
		fontSize: 12, 
		fontWeight: '600', 
		color: '#07BDD6',
	},
	readBtn: {
		marginLeft: 'auto',
		backgroundColor: '#0A7EA4',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 10,
	},
	readBtnText: { 
		color: '#fff', 
		fontWeight: '800', 
		fontSize: 13,
	},
});
