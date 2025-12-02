# Documentation Cleanup Script
# Removes all status headers, checkmarks, emojis from section headers, and TOC sections

$docsPath = "docs"
$files = Get-ChildItem -Path $docsPath -Filter "*.md"

foreach ($file in $files) {
    Write-Host "Processing: $($file.Name)"
    
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Remove status/version/last updated headers (lines like **Status:** ✅ Production-Ready)
    $content = $content -replace '\*\*Status\*\*:.*?\n', ''
    $content = $content -replace '\*\*Version\*\*:.*?\n', ''
    $content = $content -replace '\*\*Last Updated\*\*:.*?\n', ''
    
    # Remove checkmarks from bullet points
    $content = $content -replace '- ✅ ', '- '
    $content = $content -replace '- ❌ ', '- '
    
    # Remove emojis from section headers (## 🤖 Overview -> ## Overview)
    $content = $content -replace '(?m)^(#{1,6})\s+[🎯🤖📊🏗️🔧📋🚀💡⚙️🎨📝🔄📞🌟⚡🔍📈🎉✨🛠️💻🗂️📚🔐⏰📦🎭🧪🔬🎪🎬🎮🎲🎯🎨🎭🎪🎬🎮🎲]\s+', '$1 '
    
    # Remove Table of Contents sections
    $content = $content -replace '(?ms)^## .*?Table of Contents.*?\n\n.*?\n\n---\n\n', ''
    
    # Remove multiple consecutive blank lines
    $content = $content -replace '(?m)\n{3,}', "`n`n"
    
    # Only write if content changed
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "  ✓ Updated" -ForegroundColor Green
    } else {
        Write-Host "  - No changes" -ForegroundColor Gray
    }
}

Write-Host "`nCleanup complete!" -ForegroundColor Cyan

