@echo off
echo Finding your computer's IP address...
echo.
echo Your IP addresses:
ipconfig | findstr /i "IPv4"
echo.
echo Use this IP address in your app (e.g., http://192.168.1.9:5000)
echo.
pause




