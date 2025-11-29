# Kubernetes Pod Exec Helper Script
# Usage: .\scripts\k8s-exec.ps1 <command>
# Example: .\scripts\k8s-exec.ps1 "python3 scripts/testing/comprehensive_pdf_test.py"

param(
    [Parameter(Mandatory=$true)]
    [string]$Command
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
Write-Host "🚀 Executing command: $Command" -ForegroundColor Cyan
Write-Host ""

# Execute the command
& $kubectl exec -n default $podName -- sh -c $Command

