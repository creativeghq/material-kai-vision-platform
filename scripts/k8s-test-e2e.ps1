# Run E2E Test in Kubernetes Pod
# Usage: .\scripts\k8s-test-e2e.ps1

$kubectl = "C:\Users\basil\AppData\Local\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"

Write-Host "=====================================================================================================" -ForegroundColor Cyan
Write-Host "🎯 KUBERNETES E2E TEST RUNNER" -ForegroundColor Cyan
Write-Host "=====================================================================================================" -ForegroundColor Cyan
Write-Host ""

# Get the running pod
Write-Host "🔍 Finding running MIVAA pod..." -ForegroundColor Cyan
$podName = & $kubectl get pods -n default -l app=mivaa-pdf-extractor -o jsonpath='{.items[0].metadata.name}' 2>$null

if (-not $podName) {
    Write-Host "❌ No running MIVAA pod found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found pod: $podName" -ForegroundColor Green
Write-Host ""

# Check pod resources
Write-Host "📊 Pod Resources:" -ForegroundColor Cyan
$resources = & $kubectl get pod -n default $podName -o jsonpath='{.spec.containers[0].resources}'
Write-Host $resources -ForegroundColor Yellow
Write-Host ""

# Run the test
Write-Host "🚀 Starting E2E test..." -ForegroundColor Cyan
Write-Host "⚠️  This may take 10-15 minutes for full PDF processing" -ForegroundColor Yellow
Write-Host ""

& $kubectl exec -n default $podName -- python3 scripts/testing/comprehensive_pdf_test.py

$exitCode = $LASTEXITCODE
Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "✅ E2E test completed successfully!" -ForegroundColor Green
} elseif ($exitCode -eq 137) {
    Write-Host "❌ Pod was OOM killed (exit code 137) - need to increase memory limits" -ForegroundColor Red
} else {
    Write-Host "❌ E2E test failed with exit code: $exitCode" -ForegroundColor Red
}

exit $exitCode

