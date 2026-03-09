# Troubleshooting Connection Issues

## Common Error: `ERR_CONNECTION_REFUSED` or `Failed to fetch`

This means your app cannot connect to the backend server. Follow these steps:

### Step 1: Make Sure Backend Server is Running

1. Open a terminal/PowerShell
2. Navigate to the backend folder:
   ```bash
   cd "F:\Research Project\Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support\backend"
   ```
3. Start the server:
   ```bash
   python app.py
   ```
4. You should see:
   ```
   Starting Flask server...
   Model loaded successfully...
   Server ready!
   * Running on http://0.0.0.0:5000
   ```
5. **Keep this terminal window open** while using the app

### Step 2: Find Your Computer's IP Address

#### Windows:
1. Open Command Prompt or PowerShell
2. Run: `ipconfig`
3. Look for "IPv4 Address" under your active network adapter
4. Example: `192.168.1.100`

Or double-click `get_ip_address.bat` in the backend folder

#### Mac/Linux:
```bash
ifconfig | grep "inet "
```
or
```bash
ip addr show | grep "inet "
```

### Step 3: Update API URL in the App

**If testing on a physical device (phone/tablet):**
- `localhost` will NOT work
- You MUST use your computer's IP address

1. In the app, tap **"Configure API"** button
2. Enter your IP address: `http://YOUR_IP:5000`
   - Example: `http://192.168.1.100:5000`
3. Tap **"Test Connection"** to verify
4. You should see: "Connected! Model loaded: Yes"

**If testing on emulator/simulator:**
- Android Emulator: Use `http://10.0.2.2:5000`
- iOS Simulator: Use `http://localhost:5000`
- Web browser: Use `http://localhost:5000`

### Step 4: Check Network Connection

1. **Same Wi-Fi Network**: Your phone and computer must be on the same Wi-Fi network
2. **Firewall**: Windows Firewall might be blocking port 5000
   - Go to Windows Defender Firewall
   - Allow Python through firewall
   - Or allow port 5000
3. **Antivirus**: Some antivirus software blocks local servers

### Step 5: Verify Server is Accessible

Test in a web browser on your phone:
1. Open browser on your phone
2. Go to: `http://YOUR_IP:5000/health`
3. You should see JSON response with server status

## Quick Checklist

- [ ] Backend server is running (terminal shows "Server ready!")
- [ ] Using correct IP address (not localhost on device)
- [ ] Phone and computer on same Wi-Fi
- [ ] Test Connection button shows "Connected!"
- [ ] Firewall not blocking port 5000

## Still Having Issues?

1. Check backend terminal for error messages
2. Try restarting the backend server
3. Try restarting your Expo app
4. Verify IP address hasn't changed (run `ipconfig` again)
5. Check if another app is using port 5000

## Alternative: Use ngrok for Testing

If you can't use local network, you can use ngrok to create a public URL:

1. Install ngrok: https://ngrok.com/
2. Start your backend server
3. In another terminal: `ngrok http 5000`
4. Use the ngrok URL in your app (e.g., `https://abc123.ngrok.io`)




