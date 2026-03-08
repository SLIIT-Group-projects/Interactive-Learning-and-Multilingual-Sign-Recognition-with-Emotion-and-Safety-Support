/**
 * Story Image Assets
 * 
 * To add local images:
 * 1. Save your story images to frontend/assets/images/stories/
 * 2. Import them here using: import storyName from './stories/story-name.jpg';
 * 3. Export them in the STORY_IMAGES object below
 * 
 * Currently using external URLs from Unsplash for story covers.
 * You can replace these with local images by:
 * - Saving images to frontend/assets/images/stories/
 * - Importing them above
 * - Adding them to the STORY_IMAGES object
 */

// Import local story images
import squirrelStory from './stories/squirrel-story.png'; // Story 1: "The Brave Little Squirrel" - colorful forest scene
import lunaStory from './stories/luna-moon.png'; // Story 2: "Luna and the Moon" - moon and stars illustration
import gardenStory from './stories/colorful-garden.png'; // Story 3: "The Colorful Garden" - garden with flowers
import dinosaurStory from './stories/baby-dinosaur.png'; // Story 4: "Story Of Baby Dinosaur" - dinosaur scene

export const STORY_IMAGES: Record<string, any> = {
  // Local images for all stories
  '1': squirrelStory, // The Brave Little Squirrel - colorful forest illustration with squirrel holding acorn
  '2': lunaStory, // Luna and the Moon - moon and stars illustration
  '3': gardenStory, // The Colorful Garden - colorful garden with flowers
  '4': dinosaurStory, // Story Of Baby Dinosaur - dinosaur scene
};

// External image URLs as fallback - matched to story content
export const STORY_IMAGE_URLS: Record<string, string> = {
  // Story 1: The Brave Little Squirrel - about a squirrel finding the biggest acorn
  // Image: Cute squirrel with acorn, matching the story about climbing and finding acorns
  '1': 'https://images.unsplash.com/photo-1601573712145-15a94a49f67e?w=400&h=300&fit=crop&q=80',
  
  // Story 2: Luna and the Moon - about a star (Luna) wanting to talk to the moon
  // Image: Moon and stars in night sky, matching the story about stars and moon friendship
  '2': 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=400&h=300&fit=crop&q=80',
  
  // Story 3: The Colorful Garden - about flowers competing to be tallest, helping each other
  // Image: Beautiful colorful garden with flowers, matching the story theme
  '3': 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop&q=80',
  
  // Story 4: Story Of Baby Dinosaur - about a baby dinosaur learning and exploring
  // Image: Cute baby dinosaur, matching the story about a young dinosaur's adventure
  '4': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&q=80',
};

/**
 * Get image source for a story
 * Returns local image if available, otherwise returns external URL
 */
export function getStoryImageSource(storyId: string): any {
  if (STORY_IMAGES[storyId]) {
    return STORY_IMAGES[storyId];
  }
  return STORY_IMAGE_URLS[storyId] ? { uri: STORY_IMAGE_URLS[storyId] } : null;
}
