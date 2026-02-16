@echo off
echo 🔄 Restarting PathPilo Backend Server...
echo.

REM Find and kill existing server process
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3003 ^| findstr LISTENING') do (
    echo 📍 Found existing server (PID: %%a) - killing it...
    taskkill /PID %%a /F >nul 2>&1
    echo ✅ Killed existing server
    goto :start_server
)

echo ℹ️ No existing server found on port 3003

:start_server
REM Wait for port to be released
echo ⏳ Waiting for port to be released...
timeout /t 3 /nobreak >nul

REM Start the server
echo 🚀 Starting new server...
npm run dev:server

echo.
echo ✅ Server restart complete!
