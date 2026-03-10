# Setting Up for Real Devices (Phone)

## Problem

When testing on a real phone (not emulator), the app can't connect to the backend because phones can't access `localhost` or `10.0.2.2`. You need to use your **laptop's IP address**.

## Solution

### Step 1: Find Your Laptop's IP Address

**Windows:**

```bash
ipconfig
```

Look for "IPv4 Address" under your active network adapter (usually WiFi or Ethernet). It will look like `192.168.8.151` or `192.168.1.10`.

**Mac/Linux:**

```bash
ifconfig
# or
ip addr show
```

### Step 2: Update the API Configuration

You have **3 options**:

#### Option A: Use Environment Variable (Recommended)

1. Create a `.env` file in the `frontend` folder:

```env
EXPO_PUBLIC_API_URL=http://192.168.8.151:5000
```

(Replace `192.168.8.151` with YOUR laptop's IP)

2. Restart Expo:

```bash
npm start
```

#### Option B: Update `frontend/config/api.ts`

Find this line (around line 31):

```typescript
return "http://192.168.8.151:5000";
```

Replace `192.168.8.151` with your laptop's IP address.

#### Option C: Use app.config.js

Create `frontend/app.config.js`:

```javascript
export default {
  expo: {
    // ... existing config ...
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://192.168.8.151:5000",
    },
  },
};
```

### Step 3: Make Sure Backend is Running

```bash
cd backend
npm run dev
```

The backend should be listening on `0.0.0.0:5000` (which allows connections from your phone).

### Step 4: Make Sure Phone and Laptop are on Same Network

- Both devices must be on the **same WiFi network**
- Make sure Windows Firewall allows connections on port 5000

### Step 5: Test Connection

1. On your phone, try opening in browser: `http://YOUR_LAPTOP_IP:5000/health`
   - Example: `http://192.168.8.151:5000/health`
   - You should see: `{"status":"ok","timestamp":"...","service":"..."}`

2. If that works, restart your Expo app and try again.

## Troubleshooting

### Connection timeout on phone

- ✅ Backend is running (`npm run dev` in backend folder)
- ✅ Phone and laptop on same WiFi
- ✅ IP address in config matches your laptop's IP
- ✅ Windows Firewall allows port 5000

### Can't find IP address

- Make sure you're connected to WiFi
- Try `ipconfig /all` (Windows) to see all adapters
- Look for the adapter that's actively connected (usually "Wireless LAN" or "Ethernet")

### Still not working?

1. Check backend logs - do you see requests coming in?
2. Try accessing `http://YOUR_IP:5000/test` from phone's browser
3. Check if Windows Firewall is blocking Node.js

## Current Setup

Based on your system, your laptop's IP addresses are:

- `192.168.8.151` (most likely)
- `192.168.1.10`

The code is currently set to use `192.168.8.151`. If your phone still can't connect, try `192.168.1.10` or check which IP your WiFi adapter is actually using.
