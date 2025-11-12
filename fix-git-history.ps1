# PowerShell script to remove node_modules from Git history
# Run this in PowerShell

Write-Host "Step 1: Removing node_modules from Git history..." -ForegroundColor Yellow
git filter-branch --force --index-filter "git rm -rf --cached --ignore-unmatch node_modules" --prune-empty --tag-name-filter cat -- --all

Write-Host ""
Write-Host "Step 2: Cleaning up..." -ForegroundColor Yellow
git for-each-ref --format="%(refname)" refs/original/ | ForEach-Object { git update-ref -d $_ }

Write-Host ""
Write-Host "Step 3: Running garbage collection..." -ForegroundColor Yellow
git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Host ""
Write-Host "✅ Done! Now you can force push with:" -ForegroundColor Green
Write-Host "   git push origin --force --all" -ForegroundColor Green




