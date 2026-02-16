# PowerShell script to restart the PathPilo backend server
# This script kills any existing server on port 3003 and starts a new one

Write-Host "🔄 Restarting PathPilo Backend Server..." -ForegroundColor Cyan

# Find and kill existing server process
$existingProcess = netstat -ano | findstr ":3003" | findstr "LISTENING"
if ($existingProcess) {
    # Extract PID from the last column
    $lines = $existingProcess | ForEach-Object { $_.Trim() }
    $firstLine = $lines[0]
    if ($firstLine) {
        $parts = $firstLine -split '\s+'
        $serverPid = $parts[-1]
        Write-Host "Found existing server (PID: $serverPid) - killing it..." -ForegroundColor Yellow
        taskkill /PID $serverPid /F > $null 2>&1
        Write-Host "Killed existing server" -ForegroundColor Green
    }
} else {
    Write-Host "No existing server found on port 3003" -ForegroundColor Blue
}

# Wait for port to be released
Write-Host "⏳ Waiting for port to be released..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Start the server
Write-Host "🚀 Starting new server..." -ForegroundColor Green
npm run dev:server

Write-Host "✅ Server restart complete!" -ForegroundColor Green
