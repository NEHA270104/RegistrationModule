# Deployment Script for BizFlow Registration
# Run: .\deploy.ps1 or powershell -ExecutionPolicy Bypass -File deploy.ps1

param(
    [switch]$SkipGit,
    [switch]$FrontendOnly,
    [switch]$BackendOnly,
    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  BizFlow Registration Deployment" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Change to project root
Set-Location $ProjectRoot

# Step 1: Git Commit and Push
if (-not $SkipGit) {
    Write-Host "[1/3] Committing and pushing to GitHub..." -ForegroundColor Yellow

    # Check for changes
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        # Stage all changes
        git add .

        # Get commit message
        if (-not $CommitMessage) {
            $CommitMessage = Read-Host "Enter commit message (or press Enter for default)"
            if (-not $CommitMessage) {
                $CommitMessage = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
            }
        }

        # Commit
        git commit -m "$CommitMessage"

        # Push
        git push origin main
        Write-Host "  Pushed to GitHub successfully!" -ForegroundColor Green
    } else {
        Write-Host "  No changes to commit." -ForegroundColor Gray
    }
} else {
    Write-Host "[1/3] Skipping Git (--SkipGit flag)" -ForegroundColor Gray
}

# Step 2: Deploy Frontend to Firebase
if (-not $BackendOnly) {
    Write-Host "`n[2/3] Deploying frontend to Firebase Hosting..." -ForegroundColor Yellow

    firebase deploy --only hosting

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Frontend deployed successfully!" -ForegroundColor Green
        Write-Host "  URL: https://bizflowai-478116.web.app" -ForegroundColor Cyan
    } else {
        Write-Host "  Frontend deployment failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[2/3] Skipping Frontend (--BackendOnly flag)" -ForegroundColor Gray
}

# Step 3: Deploy Backend to GCP Cloud Run
if (-not $FrontendOnly) {
    Write-Host "`n[3/3] Deploying backend to GCP Cloud Run..." -ForegroundColor Yellow

    # Use gcloud.cmd directly
    $gcloudPath = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    if (-not (Test-Path $gcloudPath)) {
        $gcloudPath = "gcloud"
    }

    & $gcloudPath builds submit --config=cloudbuild.yaml --project=bizflowai-478116

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Backend deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  Backend deployment failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[3/3] Skipping Backend (--FrontendOnly flag)" -ForegroundColor Gray
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nURLs:" -ForegroundColor Cyan
Write-Host "  Frontend: https://bizflowai-478116.web.app" -ForegroundColor White
Write-Host "  API:      https://bizflowai-478116.web.app/api" -ForegroundColor White
Write-Host ""
