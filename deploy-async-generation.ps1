# Deploy generate-interior-design-async edge function
Write-Host "🚀 Deploying generate-interior-design-async edge function..." -ForegroundColor Cyan

# Check if logged in
$loginCheck = npx supabase projects list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not logged in to Supabase. Please run:" -ForegroundColor Red
    Write-Host "   npx supabase login" -ForegroundColor Yellow
    exit 1
}

# Deploy
Write-Host "📦 Deploying function..." -ForegroundColor Yellow
npx supabase functions deploy generate-interior-design-async --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Deployment successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 To view logs, run:" -ForegroundColor Cyan
    Write-Host "   npx supabase functions logs generate-interior-design-async --tail" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔑 Make sure these secrets are set:" -ForegroundColor Cyan
    Write-Host "   - REPLICATE_API_TOKEN" -ForegroundColor Yellow
    Write-Host "   - HUGGINGFACE_API_KEY" -ForegroundColor Yellow
    Write-Host "   - SUPABASE_URL" -ForegroundColor Yellow
    Write-Host "   - SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Yellow
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

