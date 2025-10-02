# Generate Material Kai Platform API Keys

function Get-RandomHex {
    param([int]$Length)
    $bytes = New-Object byte[] $Length
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($bytes)
    return [System.BitConverter]::ToString($bytes).Replace('-','').ToLower()
}

Write-Host "=== Material Kai Platform API Keys ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "MATERIAL_KAI_API_KEY:" -ForegroundColor Yellow
$apiKey = "mk_api_2024_" + (Get-RandomHex -Length 32)
Write-Host $apiKey -ForegroundColor Green
Write-Host ""

Write-Host "MATERIAL_KAI_WORKSPACE_ID:" -ForegroundColor Yellow
$workspaceId = "workspace_main_2024_basil_material_kai_vision"
Write-Host $workspaceId -ForegroundColor Green
Write-Host ""

Write-Host "MATERIAL_KAI_CLIENT_ID:" -ForegroundColor Yellow
$clientId = "client_" + (Get-RandomHex -Length 16)
Write-Host $clientId -ForegroundColor Green
Write-Host ""

Write-Host "MATERIAL_KAI_CLIENT_SECRET:" -ForegroundColor Yellow
$clientSecret = Get-RandomHex -Length 32
Write-Host $clientSecret -ForegroundColor Green
Write-Host ""

Write-Host "MATERIAL_KAI_WEBHOOK_SECRET:" -ForegroundColor Yellow
$webhookSecret = Get-RandomHex -Length 32
Write-Host $webhookSecret -ForegroundColor Green
Write-Host ""

Write-Host "ENCRYPTION_KEY:" -ForegroundColor Yellow
$encryptionKey = Get-RandomHex -Length 32
Write-Host $encryptionKey -ForegroundColor Green
Write-Host ""

Write-Host "Save these securely - they won't be shown again!" -ForegroundColor Red

