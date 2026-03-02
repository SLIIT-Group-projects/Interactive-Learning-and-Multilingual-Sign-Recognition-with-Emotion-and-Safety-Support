# Troubleshooting API Connection Issues

## Quick Checks

### 1. Verify Server is Running
```powershell
# Check if port 5000 is listening
netstat -an | findstr :5000
```
Should show: `TCP    0.0.0.0:5000           0.0.0.0:0              LISTENING`

### 2. Test from Your Computer
```powershell
# Test health endpoint
curl http://192.168.1.2:5000/health
```
Or use the test script:
```powershell
cd Model
python test_api.py
```

### 3. Check Windows Firewall

**Option A: Allow Port 5000 Through Firewall**
```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "ASL API Server" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

**Option B: Temporarily Disable Firewall (for testing only)**
- Go to Windows Security → Firewall & network protection
- Turn off firewall temporarily to test
- **Remember to turn it back on!**

### 4. Verify Network Connection

**On Your Phone:**
1. Open a browser
2. Go to: `http://192.168.1.2:5000/health`
3. You should see: `{"status":"healthy","model_loaded":true}`

If this doesn't work, the phone can't reach your laptop.

### 5. Check IP Address

**Find your current IP:**
```powershell
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

**Make sure:**
- Phone and laptop are on the **same WiFi network**
- IP address matches in `PlayGame.js` (currently set to `192.168.1.2`)

### 6. Test from Phone Browser

If you can access `http://192.168.1.2:5000/health` from your phone's browser, the network is fine and the issue is in the app.

## Common Issues

### Issue: "Connection refused"
**Solution:** 
- Make sure API server is running: `python Model/api_server.py`
- Check firewall settings
- Verify server is listening on `0.0.0.0` (not just `localhost`)

### Issue: "Network request failed"
**Solution:**
- Phone and laptop must be on same WiFi
- Check IP address is correct
- Try accessing from phone browser first

### Issue: "Timeout"
**Solution:**
- Check if firewall is blocking
- Verify network connection
- Try increasing timeout in fetch request

### Issue: Works on emulator but not on phone
**Solution:**
- Emulator uses `localhost` (works)
- Phone needs your laptop's IP address
- Update `API_URL` in `PlayGame.js`

## Testing Steps

1. **Start API Server:**
   ```powershell
   cd Model
   python api_server.py
   ```

2. **Test from Computer:**
   ```powershell
   curl http://192.168.1.2:5000/health
   ```

3. **Test from Phone Browser:**
   - Open browser on phone
   - Go to: `http://192.168.1.2:5000/health`
   - Should see JSON response

4. **If phone browser works but app doesn't:**
   - Check `API_URL` in `PlayGame.js`
   - Check console logs in Expo
   - Verify fetch request format

## Alternative: Use ngrok (for testing)

If firewall is too complicated, use ngrok to create a tunnel:

1. Install ngrok: https://ngrok.com/
2. Start API server: `python Model/api_server.py`
3. In another terminal: `ngrok http 5000`
4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Update `API_URL` in `PlayGame.js` to use the ngrok URL

This bypasses firewall issues but requires internet connection.















