param (
    [int]$Port = 3000
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
if (-not $root) { $root = (Get-Location).Path }

try {
    $ipEndpoint = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Any, $Port)
    $listener = New-Object System.Net.Sockets.TcpListener $ipEndpoint
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "[ERROR] Port $Port is already in use by another application." -ForegroundColor Red
    Write-Host "You can specify a different port: .\server.bat -Port 3001" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$modeText = if ($Port -eq 5000) { "Card Detection Bypass Active" } else { "Normal Card Scan" }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "WebAR Server Running (Port $Port - $modeText)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Local:     http://localhost:$Port/" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
if ($Port -eq 5000) {
    Write-Host " [BYPASS MODE ACTIVE - Port 5000]" -ForegroundColor Green
    Write-Host " - Card scanning is automatically bypassed on Port 5000." -ForegroundColor Gray
    Write-Host " - 3D Models appear immediately upon selecting a mode." -ForegroundColor Gray
    Write-Host " - Press SPACEBAR or tap the Status Pill to toggle card." -ForegroundColor Gray
} else {
    Write-Host " [NORMAL SCANNING MODE ACTIVE - Port $Port]" -ForegroundColor White
    Write-Host " - Real camera and physical card tracking (same as live production)." -ForegroundColor Gray
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor DarkGray

# Auto-open browser on localhost
try {
    Start-Process "http://localhost:$Port/"
} catch {}

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
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
        $firstLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($firstLine)) {
            $client.Close()
            continue
        }

        # Read headers until empty line
        while (($line = $reader.ReadLine()) -and $line.Trim() -ne "") {}

        $parts = $firstLine -split " "
        $method = $parts[0]
        $rawUrl = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        # Clean query string
        $cleanUrl = ($rawUrl -split "\?")[0]
        $decodedPath = [System.Uri]::UnescapeDataString($cleanUrl.TrimStart('/'))
        $filePath = Join-Path $root ($decodedPath -replace '/', [System.IO.Path]::DirectorySeparatorChar)

        if ($method -eq "OPTIONS") {
            $headers = "HTTP/1.1 204 No Content`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $client.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $fileInfo = New-Object System.IO.FileInfo($filePath)
            $fileLen = $fileInfo.Length

            $headers = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $fileLen`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)

            if ($method -ne "HEAD") {
                $fileStream = [System.IO.File]::OpenRead($filePath)
                $buffer = New-Object byte[] 65536
                while (($bytesRead = $fileStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $stream.Write($buffer, 0, $bytesRead)
                }
                $fileStream.Close()
            }
        } else {
            $body = "404 Not Found: $decodedPath"
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $headers = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bodyBytes, 0, $bodyBytes.Length)
        }

        $stream.Flush()
        $client.Close()
    }
} finally {
    if ($listener) {
        $listener.Stop()
    }
}
