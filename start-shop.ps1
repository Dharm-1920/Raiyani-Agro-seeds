$ErrorActionPreference = 'Stop'
$shopRoot = $PSScriptRoot
$apiProcess = $null

function Test-ShopApi {
    try {
        $null = Invoke-RestMethod 'http://127.0.0.1:5000/api/products?limit=1' -TimeoutSec 2
        return $true
    } catch { return $false }
}

try {
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath "$shopRoot/server/.env")) {
        throw 'Configure server/.env before starting the shop. See ADMIN_SETUP.md.'
    }
    foreach ($folder in @('server', 'client')) {
        if (-not (Test-Path -LiteralPath "$shopRoot/$folder/node_modules")) {
            & $npmCommand --prefix "$shopRoot/$folder" ci
            if ($LASTEXITCODE -ne 0) { throw "Could not install $folder dependencies." }
        }
    }
    if (-not (Test-ShopApi)) {
        Write-Host 'Starting the product API. Keep MongoDB running.'
        $apiLog = Join-Path ([System.IO.Path]::GetTempPath()) ('raiyani-api-' + [guid]::NewGuid().ToString('N'))
        $apiProcess = Start-Process -FilePath $nodeCommand -ArgumentList ('"' + "$shopRoot/server/server.js" + '"') -WorkingDirectory "$shopRoot/server" -WindowStyle Hidden -RedirectStandardOutput "$apiLog.log" -RedirectStandardError "$apiLog.error.log" -PassThru
        $apiReady = $false
        for ($attempt = 0; $attempt -lt 15; $attempt++) {
            if (Test-ShopApi) { $apiReady = $true; break }
            if ($apiProcess.HasExited) { break }
            Start-Sleep -Seconds 1
        }
        if (-not $apiReady) {
            throw "The product API could not start. Check that MongoDB is running and server/.env has the correct MONGO_URI. Details: $apiLog.error.log"
        }
    }
    Write-Host 'Product API connected. Opening the shop in your browser.'
    $uiReady = $false
    try { $uiReady = (Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
    if ($uiReady) {
        Start-Process 'http://localhost:5173/'
    } else {
        Write-Host 'Keep this window open while using the shop.'
        & $npmCommand --prefix "$shopRoot/client" run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
        if ($LASTEXITCODE -ne 0) { throw 'The storefront could not start.' }
    }
} catch {
    if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
