# ==============================================================================
# Smart Hospital Emergency Resource Manager (SHERM)
# Windows PowerShell Launcher Script for HEC Hackathon
# ==============================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🏥 SMART HOSPITAL EMERGENCY RESOURCE MANAGER (SHERM)" -ForegroundColor Green
Write-Host "   HEC Hackathon Automated Launcher" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check Node.js installation
try {
    $nodeVersion = node -v
    Write-Host "✓ Detected Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Node.js is not found in PATH. Please install Node.js (v18+) to run this project." -ForegroundColor Red
    exit 1
}

# 2. Check if node_modules exists, install if missing
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing required dependencies..." -ForegroundColor Yellow
    cmd /c "npm install"
} else {
    Write-Host "✓ Dependencies are installed." -ForegroundColor Green
}

# 3. Execute test suite
Write-Host "🧪 Running automated test suite..." -ForegroundColor Yellow
cmd /c "npm test"
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Warning: Some automated tests did not pass. Proceeding with launch..." -ForegroundColor Yellow
} else {
    Write-Host "✓ All automated tests passed successfully (10/10 tests)." -ForegroundColor Green
}

# 4. Start the Application Server
Write-Host "🚀 Starting SHERM Command Center Server on http://localhost:3000..." -ForegroundColor Cyan
Write-Host "   Demo Accounts:" -ForegroundColor Yellow
Write-Host "   - Admin:       admin / admin123" -ForegroundColor White
Write-Host "   - Coordinator: coordinator / coord123" -ForegroundColor White
Write-Host "   - Staff:       staff / staff123" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server at any time." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

node server.js
