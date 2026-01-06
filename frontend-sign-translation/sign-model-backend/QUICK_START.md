# Quick Start Guide - Fix Connection Timeout Errors

## 🚨 If you see "ERR_CONNECTION_TIMED_OUT" or "Network request timed out"

### Step 1: Start the Backend Server ⚡

1. **Open PowerShell or Command Prompt**
2. **Navigate to the backend folder:**
   ```powershell
   cd "F:\Research Project\Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support\frontend-sign-translation\sign-model-backend"
   ```

3. **Start the server:**
   ```powershell
   python app.py
   ```

4. **Wait for this message:**
   ```
   ==================================================
   Server ready!
   Loaded models: ['sinhala']
   Server running on http://0.0.0.0:5000
   ==================================================
   ```

5. **⚠️ IMPORTANT: Keep this terminal window open!** The server must stay running.

### Step 2: Find Your Computer's IP Address 📍

**Windows:**
1. Open a new PowerShell/Command Prompt
2. Run: `ipconfig`
3. Look for **"IPv4 Address"** under your active network adapter
4. Example: `192.168.8.151` (this is what you're currently using)

**Or use the helper script:**
- Double-click `get_ip_address.bat` in the backend folder

### Step 3: Update API URL in the App 📱

1. Open the app
2. Look at the **Connection Status** indicator at the top:
   - ✅ Green = Connected
   - ❌ Red = Not Connected
   - 🔄 Yellow = Checking

3. If it shows ❌, tap **"⚙️ Configure API"**
4. Enter your IP address: `http://YOUR_IP:5000`
   - Example: `http://192.168.8.151:5000`
5. Tap **"🔍 Test Connection"**
6. You should see: "✅ Connected! 🎉"

### Step 4: Common Issues & Fixes 🔧

#### Issue: "Cannot connect to server"
**Fix:**
- ✅ Make sure backend server is running (Step 1)
- ✅ Check IP address is correct
- ✅ Phone and computer must be on **same Wi-Fi network**
- ✅ Try restarting the backend server

#### Issue: "Server took too long to respond"
**Fix:**
- ✅ Check if Windows Firewall is blocking port 5000
- ✅ Allow Python through firewall
- ✅ Try restarting both app and server

#### Issue: "Connection refused"
**Fix:**
- ✅ Server might not be running - go back to Step 1
- ✅ Wrong IP address - check with `ipconfig` again
- ✅ IP address might have changed (Wi-Fi reconnection)

### Step 5: Verify Everything Works ✅

1. **Connection Status** shows ✅ (green)
2. **Test Connection** button shows "Connected!"
3. Try detecting a sign - it should work!

### Still Not Working? 🤔

1. **Check backend terminal** for error messages
2. **Try restarting** the backend server
3. **Verify IP address** hasn't changed (`ipconfig`)
4. **Check firewall** - allow Python/port 5000
5. **Test in browser** on your phone: `http://YOUR_IP:5000/health`
   - Should show JSON with server status

### Need More Help?

Check `TROUBLESHOOTING.md` for detailed solutions.

