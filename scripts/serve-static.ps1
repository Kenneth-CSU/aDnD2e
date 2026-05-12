param(
    [int]$Port = 8080,
    [string]$RootPath = "."
)

$ErrorActionPreference = "Stop"

$resolvedRoot = (Resolve-Path $RootPath).Path
$prefix = "http://localhost:$Port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm" = "text/html; charset=utf-8"
    ".js" = "application/javascript; charset=utf-8"
    ".mjs" = "application/javascript; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".txt" = "text/plain; charset=utf-8"
    ".svg" = "image/svg+xml"
    ".png" = "image/png"
    ".jpg" = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif" = "image/gif"
    ".webp" = "image/webp"
    ".ico" = "image/x-icon"
}

function Get-ContentType([string]$path) {
    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($mimeTypes.ContainsKey($ext)) {
        return $mimeTypes[$ext]
    }
    return "application/octet-stream"
}

function Write-TextResponse($response, [int]$statusCode, [string]$message) {
    $response.StatusCode = $statusCode
    $response.ContentType = "text/plain; charset=utf-8"
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start HTTP listener on $prefix"
    Write-Host "Try running PowerShell as Administrator or use a different port."
    throw
}

Write-Host "Serving static files from: $resolvedRoot"
Write-Host "Listening on: $prefix"
Write-Host "Press Ctrl+C to stop."

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ([string]::IsNullOrWhiteSpace($rawPath) -or $rawPath -eq "/") {
            $rawPath = "/index.html"
        }

        $relativePath = $rawPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
        $candidatePath = Join-Path $resolvedRoot $relativePath

        $fullPath = [IO.Path]::GetFullPath($candidatePath)
        if (-not $fullPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Write-TextResponse $response 403 "Forbidden"
            continue
        }

        if ((Test-Path $fullPath) -and (Get-Item $fullPath).PSIsContainer) {
            $fullPath = Join-Path $fullPath "index.html"
        }

        if (-not (Test-Path $fullPath -PathType Leaf)) {
            Write-TextResponse $response 404 "Not Found"
            continue
        }

        $bytes = [IO.File]::ReadAllBytes($fullPath)
        $response.StatusCode = 200
        $response.ContentType = Get-ContentType $fullPath
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
    } catch [System.Net.HttpListenerException] {
        break
    } catch {
        if ($context -and $context.Response -and $context.Response.OutputStream) {
            try {
                Write-TextResponse $context.Response 500 "Internal Server Error"
            } catch {
            }
        }
    }
}

$listener.Stop()
$listener.Close()
