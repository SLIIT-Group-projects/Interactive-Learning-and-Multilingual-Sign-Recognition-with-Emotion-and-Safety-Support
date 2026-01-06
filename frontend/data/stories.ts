import { getStoryImageSource } from '../assets/images/storyImages';

export type Story = {
	id: string;
	title: string;
	level: 'Easy' | 'Medium' | 'Hard';
	timeMin: number;
	coverColor: string;
	storyText: string;
	moral: string;
	emoji?: string;
	uploadedOn?: string; // new optional field for UI
	imageUrl?: string; // Story cover image URL (external)
	imageSource?: any; // Local image require() source
};

export const STORIES: Story[] = [
	{
		id: '1',
		title: 'The Brave Little Squirrel',
		level: 'Easy',
		timeMin: 3,
		coverColor: '#FFD8D8',
		emoji: '🐿️',
		storyText:
			'Once upon a time there was a small squirrel who wanted to find the biggest acorn. He climbed and hopped and asked his friends. The journey taught him that patience and asking for help made the task easier.',
		moral: 'Teamwork makes hard things easier.',
		uploadedOn: '20 Aug',
		// Use image helper - will use local if available, otherwise external URL
		imageSource: getStoryImageSource('1'),
		imageUrl: 'https://images.unsplash.com/photo-1601573712145-15a94a49f67e?w=400&h=300&fit=crop&q=80', // Squirrel with acorn
	},
	{
		id: '2',
		title: 'Luna and the Moon',
		level: 'Medium',
		timeMin: 5,
		coverColor: '#D8EEFF',
		emoji: '🌙',
		storyText:
			'Luna the star wanted to talk to the moon. She learned to wait and to shine in her own way. The moon noticed her and they became friends by sharing light.',
		moral: 'Be patient and shine bright.',
		uploadedOn: '2 Aug',
		imageSource: getStoryImageSource('2'),
		imageUrl: 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=400&h=300&fit=crop&q=80', // Moon with stars in night sky - matches story about Luna (star) and moon
	},
	{
		id: '3',
		title: 'The Colorful Garden',
		level: 'Hard',
		timeMin: 7,
		coverColor: '#E6FFE0',
		emoji: '🌷',
		storyText:
			'In a garden with many colors, flowers competed to be the tallest. A small seed realized beauty comes from helping others and sharing sunlight. The garden grew more colorful together.',
		moral: 'Helping others helps everyone grow.',
		uploadedOn: '10 Aug',
		imageSource: getStoryImageSource('3'),
		imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop&q=80', // Colorful garden with flowers
	},
	{
		id: '4',
		title: 'Story Of Baby Dinosaur',
		level: 'Easy',
		timeMin: 15,
		coverColor: '#FFF3D9',
		emoji: '🦕',
		storyText:
			'A baby dinosaur learns new friends and explores the sunny valley. A short, gentle tale for little readers with bright pictures and simple lessons.',
		moral: 'Curiosity brings friends.',
		uploadedOn: '22 Aug',
		imageSource: getStoryImageSource('4'),
		imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&q=80', // Baby dinosaur
	},
];
