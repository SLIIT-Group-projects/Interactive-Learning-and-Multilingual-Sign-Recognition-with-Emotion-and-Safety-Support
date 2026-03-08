# Fix Network Connection Error in Expo Go

## Problem
Getting "Network request failed" or "Cannot connect to backend server" when using Expo Go on your phone.

## Quick Fix Steps

### 1. Find Your Computer's IP Address

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually WiFi or Ethernet).
Example: `192.168.1.15` or `192.168.0.105`

**Mac/Linux:**
```bash
ifconfig
# or
ip addr
```
Look for your network interface (usually `en0` or `wlan0`).

### 2. Make Sure Backend is Running

In your backend directory, start the server:
```bash
cd backend
npm start
# or
node server.js
# or whatever command you use
```

Verify it's running by opening in browser:
```
http://localhost:5000/health
```
Should return a response.

### 3. Check Backend Accepts Network Connections

Make sure your backend server is configured to accept connections from your network, not just localhost.

**If using Express, check server.js:**
```javascript
// Should be:
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});

// NOT:
app.listen(5000, 'localhost', () => {
  // This only accepts localhost connections
});
```

### 4. Create .env File in Frontend

Create a `.env` file in your `frontend` directory:

```env
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:5000
```

Replace `YOUR_COMPUTER_IP` with the IP you found in step 1.

Example:
```env
EXPO_PUBLIC_API_URL=http://192.168.1.15:5000
```

### 5. Restart Expo

After creating/updating `.env`:
```bash
# Stop Expo (Ctrl+C)
# Then restart:
npx expo start --clear
```

### 6. Check Firewall

**Windows:**
- Open Windows Defender Firewall
- Allow Node.js/your backend through firewall
- Or temporarily disable firewall to test

**Mac:**
- System Preferences > Security & Privacy > Firewall
- Allow Node.js through firewall

### 7. Verify Same Network

- Phone and computer must be on the SAME WiFi network
- Not on different networks or mobile data

### 8. Test Connection

From your phone's browser, try:
```
http://YOUR_COMPUTER_IP:5000/health
```

If this works, the app should work too.

## Alternative: Update IP in Code Directly

If `.env` doesn't work, you can update the IP directly in `frontend/config/api.ts`:

Find line 30:
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.11:5000";
```

Change `192.168.1.11` to your actual IP:
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.15:5000";
```

Then restart Expo.

## Common Issues

1. **IP Changed**: Your IP might change when you reconnect to WiFi. Update `.env` file.
2. **Backend Not Running**: Make sure backend server is actually running.
3. **Wrong Port**: Make sure backend is on port 5000 (or update the port in `.env`).
4. **Different Networks**: Phone and computer must be on same WiFi.
5. **Firewall Blocking**: Allow Node.js through firewall.

## Debug Steps

1. Check console logs - should show: `[API] Final BASE_URL: http://...`
2. Verify the IP shown matches your computer's IP
3. Test backend directly from phone browser
4. Check backend logs for incoming requests
