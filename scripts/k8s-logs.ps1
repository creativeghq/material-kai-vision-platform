# Kubernetes Pod Logs Helper Script
# Usage: .\scripts\k8s-logs.ps1 [-Follow] [-Tail <lines>]
# Example: .\scripts\k8s-logs.ps1 -Follow
# Example: .\scripts\k8s-logs.ps1 -Tail 100

param(
    [switch]$Follow,
    [int]$Tail = 50
)

$kubectl = "C:\Users\basil\AppData\Local\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"

# Get the running pod
Write-Host "🔍 Finding running MIVAA pod..." -ForegroundColor Cyan
$podName = & $kubectl get pods -n default -l app=mivaa-pdf-extractor -o jsonpath='{.items[0].metadata.name}' 2>$null

if (-not $podName) {
    Write-Host "❌ No running MIVAA pod found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found pod: $podName" -ForegroundColor Green
Write-Host "📋 Fetching logs..." -ForegroundColor Cyan
Write-Host ""

# Fetch logs
if ($Follow) {
    & $kubectl logs -n default $podName -f --tail=$Tail
} else {
    & $kubectl logs -n default $podName --tail=$Tail
}

