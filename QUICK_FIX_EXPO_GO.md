# Quick Fix for Expo Go Network Error

## Step 1: Find Your Computer's IP Address

**Windows:**
1. Press `Win + R`, type `cmd`, press Enter
2. Type: `ipconfig`
3. Look for "IPv4 Address" - that's your IP (e.g., `192.168.1.15`)

**Mac:**
1. Open Terminal
2. Type: `ifconfig | grep "inet "`
3. Look for IP starting with `192.168.` or `10.` (not `127.0.0.1`)

## Step 2: Create .env File

In your `frontend` folder, create a file named `.env`:

```env
EXPO_PUBLIC_API_URL=http://YOUR_IP_HERE:5000
```

**Example** (if your IP is 192.168.1.15):
```env
EXPO_PUBLIC_API_URL=http://192.168.1.15:5000
```

## Step 3: Make Sure Backend is Running

In a terminal, go to `backend` folder and run:
```bash
npm start
```

You should see: `🚀 Server running on port 5000`

## Step 4: Restart Expo

1. Stop Expo (Ctrl+C in the terminal running Expo)
2. Clear cache and restart:
```bash
npx expo start --clear
```

## Step 5: Test Connection

From your phone's browser, try:
```
http://YOUR_IP:5000/health
```

If you see a response, the connection works!

## Still Not Working?

1. **Check same WiFi**: Phone and computer must be on the SAME WiFi network
2. **Check firewall**: Allow Node.js through Windows/Mac firewall
3. **Check IP changed**: If you reconnect to WiFi, your IP might change - update `.env`
4. **Try different IP**: Sometimes you have multiple IPs - try the other one

## Alternative: Update Code Directly

If `.env` doesn't work, edit `frontend/config/api.ts`:

Find line 30 and change:
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.11:5000";
```

To your IP:
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://YOUR_IP:5000";
```

Then restart Expo.
