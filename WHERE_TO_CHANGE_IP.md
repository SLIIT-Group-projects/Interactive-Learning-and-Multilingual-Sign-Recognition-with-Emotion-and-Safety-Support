# Where to Change IP Address - Step by Step

## Step 1: Find Your Computer's IP Address

**Windows:**
1. Press `Win + R`
2. Type `cmd` and press Enter
3. Type: `ipconfig`
4. Look for **"IPv4 Address"** - that's your IP!
   - Example: `192.168.1.15` or `192.168.0.105`

**Mac:**
1. Open Terminal
2. Type: `ifconfig | grep "inet "`
3. Look for IP starting with `192.168.` or `10.` (NOT `127.0.0.1`)

## Step 2: Change IP Address in Code

### Option A: Quick Fix (Change in Code) ⚡

**File:** `frontend/config/api.ts`

**Line 30** - Change this:
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.11:5000"; // ⬅️ CHANGE THIS IP!
```

**To your IP:**
```typescript
const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.15:5000"; // ⬅️ YOUR IP HERE
```

**Also update Line 55** (if needed):
```typescript
const possibleIPs = ["192.168.1.15", "192.168.1.10"]; // ⬅️ UPDATE THESE!
```

**And Line 78** (if needed):
```typescript
return "http://192.168.1.15:5000"; // ⬅️ CHANGE THIS IP!
```

### Option B: Use .env File (Recommended) ✅

**File:** `frontend/.env` (create this file if it doesn't exist)

**Add this line:**
```env
EXPO_PUBLIC_API_URL=http://YOUR_IP_HERE:5000
```

**Example** (if your IP is 192.168.1.15):
```env
EXPO_PUBLIC_API_URL=http://192.168.1.15:5000
```

## Step 3: Restart Expo

After changing the IP:
1. Stop Expo (Ctrl+C)
2. Clear cache and restart:
```bash
npx expo start --clear
```

## Step 4: Test

From your phone's browser, try:
```
http://YOUR_IP:5000/health
```

If you see a response, it works! ✅

## Summary

**Main file to edit:** `frontend/config/api.ts`  
**Line to change:** Line 30  
**Change:** `192.168.1.11` → Your actual IP address

**OR create:** `frontend/.env` file with:
```
EXPO_PUBLIC_API_URL=http://YOUR_IP:5000
```
