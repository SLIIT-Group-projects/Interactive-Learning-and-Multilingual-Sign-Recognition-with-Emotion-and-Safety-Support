# Quick Fix: Phone Can't Connect to API Server

## Problem

Phone browser can't open `http://192.168.13.67:5000/health`

## Solution 1: Fix Windows Firewall (Recommended)

### Option A: Use the PowerShell Script (Easiest)

1. **Right-click** on PowerShell
2. Select **"Run as Administrator"**
3. Navigate to games folder:
   ```powershell
   cd C:\Users\HP\Documents\projects\research\Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support\backend\models\games
   ```
4. Run the script:
   ```powershell
   .\fix_firewall.ps1
   ```

### Option B: Manual Firewall Fix

1. Press `Win + R`, type `wf.msc`, press Enter
2. Click **"Inbound Rules"** → **"New Rule..."**
3. Select **"Port"** → Next
4. Select **"TCP"** and enter port **5000** → Next
5. Select **"Allow the connection"** → Next
6. Check all (Domain, Private, Public) → Next
7. Name it **"ASL API Server"** → Finish

## Solution 2: Verify IP Address

Your IP might have changed. Check it:

```powershell
ipconfig
```

Look for "IPv4 Address" under your WiFi adapter. It might be different from `192.168.13.67`.

**Update `PlayGame.js`** with the correct IP:

```javascript
const API_URL = "http://YOUR_ACTUAL_IP:5000";
```

## Solution 3: Check Network Connection

1. **Make sure phone and laptop are on the same WiFi**
   - Check WiFi name on both devices
   - They must match exactly

2. **Test connectivity:**
   - On phone, open browser
   - Try: `http://YOUR_IP:5000/health`
   - Should see: `{"status":"healthy","model_loaded":true}`

## Solution 4: Alternative - Use ngrok (Bypasses Firewall)

If firewall is too complicated:

1. **Download ngrok:** https://ngrok.com/download
2. **Start API server:**
   ```powershell
   cd backend/models/games
   python api_server.py
   ```
3. **In new terminal, start ngrok:**
   ```powershell
   ngrok http 5000
   ```
4. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)
5. **Update `PlayGame.js`:**
   ```javascript
   const API_URL = "https://abc123.ngrok.io"; // Your ngrok URL
   ```

## Solution 5: Check API Server is Running

Make sure the server is actually running:

```powershell
cd backend/models/games
python api_server.py
```

You should see:

```
Starting server on http://localhost:5000
```

## Testing

After fixing firewall:

1. **From laptop browser:** `http://localhost:5000/health` ✅ Should work
2. **From phone browser:** `http://192.168.13.67:5000/health` ✅ Should work
3. **From app:** Should now connect ✅

## Still Not Working?

1. **Check Windows Defender Firewall:**
   - Windows Security → Firewall & network protection
   - Make sure it's not blocking everything

2. **Try different port:**
   - Change port in `backend/models/games/api_server.py` to `8000`
   - Update `frontend/src/screens/child/PlayGame.js` to use port `8000`
   - Add firewall rule for port `8000`

3. **Check router settings:**
   - Some routers block device-to-device communication
   - Check if "AP Isolation" or "Client Isolation" is enabled
   - Disable it if possible

4. **Use mobile hotspot:**
   - Create hotspot on phone
   - Connect laptop to phone's hotspot
   - Use laptop's IP from hotspot network
