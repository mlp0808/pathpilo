# Simple PathPilo server restart script
Write-Host "Restarting PathPilo Backend Server..." -ForegroundColor Cyan

# Kill any existing server on port 3003
Write-Host "Checking for existing server..." -ForegroundColor Yellow
$existing = netstat -ano | findstr ":3003"
if ($existing) {
    Write-Host "Found server on port 3003, terminating..." -ForegroundColor Yellow
    # Extract PID and kill
    $pid = ($existing | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
    if ($pid -and $pid -match '^\d+$') {
        taskkill /PID $pid /F 2>$null
        Write-Host "Terminated process $pid" -ForegroundColor Green
    }
} else {
    Write-Host "No existing server found" -ForegroundColor Blue
}

# Wait and start server
Write-Host "Starting server..." -ForegroundColor Green
npm run dev:server
