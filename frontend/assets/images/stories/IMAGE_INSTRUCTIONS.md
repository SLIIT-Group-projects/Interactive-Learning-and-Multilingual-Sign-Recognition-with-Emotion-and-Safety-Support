# Story Images Setup Instructions

## For "The Brave Little Squirrel" (Story 1)

1. **Save your image file** as: `squirrel-story.png` (or `.jpg`)
   - Location: `frontend/assets/images/stories/squirrel-story.png`
   - This is the colorful forest illustration with the squirrel holding an acorn

2. The image should be:
   - Format: PNG or JPG
   - Recommended size: 400x300 pixels (or similar aspect ratio)
   - Name: `squirrel-story.png` or `squirrel-story.jpg`

3. Once saved, the code in `storyImages.ts` will automatically use this local image instead of the external URL.

## Note

- If the image file doesn't exist, the app will fall back to the external URL
- Make sure the file extension in the import matches your actual file extension (.png or .jpg)
