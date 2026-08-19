@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Get-Content -LiteralPath '%~f0' | Select-Object -Skip 6 | Out-String)))" %*
goto :EOF

# ==========================================================
# Embedded WebAR Static HTTP Server
# ==========================================================
param (
    [int]$Port = 3000
)

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$listener = $null

# Get local IP address for mobile phone testing
$localIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*', 'Ethernet*' -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress

try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    if ($localIP) {
        try {
            $listener.Prefixes.Add("http://$($localIP):$Port/")
        } catch {}
    }
    $listener.Start()
} catch {
    try {
        if ($listener) { $listener.Close() }
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$Port/")
        $listener.Start()
    } catch {
        Write-Host "`n[ERROR] Port $Port is already in use by another application." -ForegroundColor Red
        Write-Host "You can specify a different port: .\serve.bat -Port 3001`n" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 WebAR Local Dev Server Running" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Local:     http://localhost:$Port/" -ForegroundColor White
Write-Host " 127.0.0.1: http://127.0.0.1:$Port/" -ForegroundColor White
if ($localIP) {
    Write-Host " Network:   http://$($localIP):$Port/ (Open on Mobile)" -ForegroundColor Yellow
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor DarkGray

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".glb"  = "model/gltf-binary"
    ".gltf" = "model/gltf+json"
    ".mind" = "application/octet-stream"
    ".bin"  = "application/octet-stream"
    ".wasm" = "application/wasm"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.Url.LocalPath
        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        # Decode URL path (e.g. spaces like '%20')
        $decodedPath = [System.Uri]::UnescapeDataString($rawUrl.TrimStart('/'))
        $filePath = Join-Path $root ($decodedPath -replace '/', [System.IO.Path]::DirectorySeparatorChar)

        # CORS Headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "*")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        if (Test-Path -Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $mime
            
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $decodedPath")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }

        $response.Close()
    }
} finally {
    if ($listener -and $listener.IsListening) {
        $listener.Stop()
    }
    if ($listener) {
        $listener.Close()
    }
}
