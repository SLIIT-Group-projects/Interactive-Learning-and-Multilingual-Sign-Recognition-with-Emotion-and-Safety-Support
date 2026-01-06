# Story Images Directory

This directory is for storing local story cover images.

## How to Add Local Images

1. **Save your images here**: Place your story cover images in this directory (`frontend/assets/images/stories/`).

   Recommended image format:
   - **Format**: JPG or PNG
   - **Size**: 400x300 pixels (or similar aspect ratio)
   - **File naming**: Use descriptive names like:
     - `squirrel-story.jpg`
     - `luna-moon.jpg`
     - `colorful-garden.jpg`
     - `baby-dinosaur.jpg`

2. **Update the image mapping**: Edit `frontend/assets/images/storyImages.ts`:

   ```typescript
   // Import your images at the top
   import squirrelStory from './stories/squirrel-story.jpg';
   import lunaStory from './stories/luna-moon.jpg';
   import gardenStory from './stories/colorful-garden.jpg';
   import dinosaurStory from './stories/baby-dinosaur.jpg';

   // Add them to the STORY_IMAGES object
   export const STORY_IMAGES: Record<string, any> = {
     '1': squirrelStory,
     '2': lunaStory,
     '3': gardenStory,
     '4': dinosaurStory,
   };
   ```

3. **Story IDs mapping**:
   - Story ID `'1'`: The Brave Little Squirrel
   - Story ID `'2'`: Luna and the Moon
   - Story ID `'3'`: The Colorful Garden
   - Story ID `'4'`: Story Of Baby Dinosaur

## Current Status

Currently using external image URLs from Unsplash as placeholders. Once you add local images and update `storyImages.ts`, the app will automatically use the local images instead of the external URLs.

## Fallback

If a local image is not available for a story, the app will fall back to the external URL defined in `STORY_IMAGE_URLS` in `storyImages.ts`.
