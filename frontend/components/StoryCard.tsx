import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Story } from '../data/stories';
import { MAGIC } from '../src/theme/childMagicTheme';

type Props = {
	story: Story;
	onPress: () => void;
};

export const StoryCard: React.FC<Props> = ({ story, onPress }) => {
	const levelColors = {
		Easy: { bg: MAGIC.softPurpleBg, border: MAGIC.softPurpleBorder, text: MAGIC.purple600 },
		Medium: { bg: '#E0E7FF', border: '#C7D2FE', text: MAGIC.textPrimary },
		Hard: { bg: MAGIC.softPinkBg, border: MAGIC.softPinkBorder, text: '#9D174D' },
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
					<View style={styles.readBtnWrap}>
						<LinearGradient
							colors={MAGIC.sessionGrad}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 0 }}
							style={styles.readBtnGrad}
						>
							<Text style={styles.readBtnText}>Read ✨</Text>
						</LinearGradient>
					</View>
				</View>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	card: {
		width: '100%',
		backgroundColor: MAGIC.cardWhite,
		borderRadius: 32,
		padding: 16,
		marginBottom: 16,
		flexDirection: 'row',
		alignItems: 'flex-start',
		borderBottomWidth: 6,
		borderBottomColor: MAGIC.purple100,
		elevation: 4,
		shadowColor: '#7c3aed',
		shadowOpacity: 0.1,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 6 },
	},
	imageContainer: {
		width: 100,
		height: 100,
		borderRadius: 22,
		overflow: 'hidden',
		marginRight: 14,
		backgroundColor: MAGIC.purple100,
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
		color: MAGIC.textPrimary, 
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
		color: MAGIC.textMuted,
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
		backgroundColor: MAGIC.softPurpleBg,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 14,
	},
	timeText: { 
		fontSize: 12, 
		fontWeight: '800', 
		color: MAGIC.purple600,
	},
	dateText: { 
		fontSize: 12, 
		fontWeight: '600', 
		color: MAGIC.textMuted,
	},
	readBtnWrap: {
		marginLeft: 'auto',
		borderRadius: 18,
		overflow: 'hidden',
	},
	readBtnGrad: {
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	readBtnText: { 
		color: '#fff', 
		fontWeight: '800', 
		fontSize: 12,
	},
});
