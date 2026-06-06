#Requires -Version 5.0

Write-Host "========================================"
Write-Host "  Amazon Image Studio - Startup"
Write-Host "========================================"
Write-Host ""

# Step 1: Check Node.js
Write-Host "[Step 1/5] Checking Node.js..."
try {
    $nodeVersion = node --version 2>&1
    $npmVersion = npm --version 2>&1
    Write-Host "[OK] Node.js found: $nodeVersion"
    Write-Host "[OK] npm version: $npmVersion"
} catch {
    Write-Host ""
    Write-Host "[ERROR] Node.js NOT FOUND!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from:"
    Write-Host "https://nodejs.org/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

# Step 2: Clean old processes
Write-Host "[Step 2/5] Cleaning old Node processes..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "[OK] Cleaned"
Write-Host ""

# Step 3: Validate structure
Write-Host "[Step 3/5] Validating project structure..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path "package.json")) {
    Write-Host "[ERROR] Root package.json NOT found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Root package.json found"

if (-not (Test-Path "frontend\package.json")) {
    Write-Host "[ERROR] frontend\package.json NOT found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Frontend package.json found"

if (-not (Test-Path "backend\package.json")) {
    Write-Host "[ERROR] backend\package.json NOT found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Backend package.json found"
Write-Host ""

# Step 4: Check dependencies
Write-Host "[Step 4/5] Checking dependencies..."
Write-Host ""

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing root dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Root install FAILED!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[OK] Root dependencies installed"
} else {
    Write-Host "[OK] Root dependencies found"
}
Write-Host ""

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "[INFO] Installing frontend dependencies..."
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Set-Location ..
        Write-Host "[ERROR] Frontend install FAILED!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Set-Location ..
    Write-Host "[OK] Frontend dependencies installed"
} else {
    Write-Host "[OK] Frontend dependencies found"
}
Write-Host ""

if (-not (Test-Path "backend\node_modules")) {
    Write-Host "[INFO] Installing backend dependencies..."
    Set-Location backend
    npm install --production
    if ($LASTEXITCODE -ne 0) {
        Set-Location ..
        Write-Host "[ERROR] Backend install FAILED!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Set-Location ..
    Write-Host "[OK] Backend dependencies installed"
} else {
    Write-Host "[OK] Backend dependencies found"
}
Write-Host ""

# Step 5: Start services
Write-Host "[Step 5/5] Starting services..."
Write-Host ""
Write-Host "========================================"
Write-Host "  Starting..."
Write-Host "========================================"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:3001"
Write-Host ""
Write-Host "Press Ctrl+C to stop"
Write-Host ""

Set-Location $scriptDir
npm run dev
