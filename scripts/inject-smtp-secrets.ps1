# Injects Gmail App Password into Secret Manager for OmniTask (#91).
# Requires: gcloud CLI authenticated as a user with secretmanager.versions.add on omnitask-475422
#
# Usage:
#   .\scripts\inject-smtp-secrets.ps1 -AppPassword 'xxxxxxxxxxxxxxxx'
#   .\scripts\inject-smtp-secrets.ps1 -AppPassword 'xxxxxxxxxxxxxxxx' -DeployExtension
#   .\scripts\inject-smtp-secrets.ps1 -AppPassword 'xxxxxxxxxxxxxxxx' -DeployExtension -UpdateNodemailerSecret

param(
  [Parameter(Mandatory = $true)]
  [string]$AppPassword,

  [switch]$DeployExtension,
  [switch]$UpdateNodemailerSecret,
  [string]$ProjectId = 'omnitask-475422',
  [string]$SmtpUser = 'bertin.kenol@omniflexfitness.com'
)

$ErrorActionPreference = 'Stop'

function Ensure-Gcloud {
  $gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($gcloud) {
    return $gcloud.Source
  }

  Write-Host 'gcloud not found. Install Google Cloud SDK, then re-run this script.' -ForegroundColor Yellow
  Write-Host '  winget install Google.CloudSDK' -ForegroundColor Cyan
  Write-Host '  gcloud auth login' -ForegroundColor Cyan
  Write-Host '  gcloud config set project omnitask-475422' -ForegroundColor Cyan
  throw 'gcloud is required to add Secret Manager versions from the CLI.'
}

function Add-SecretVersion {
  param(
    [string]$SecretName,
    [string]$Value
  )

  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tempFile -Value $Value -NoNewline -Encoding ascii
    gcloud secrets versions add $SecretName --project=$ProjectId --data-file=$tempFile | Out-Host
    Write-Host "Added secret version: $SecretName" -ForegroundColor Green
  }
  finally {
    Remove-Item -Force $tempFile -ErrorAction SilentlyContinue
  }
}

$normalizedPassword = ($AppPassword -replace '\s', '')
if ($normalizedPassword.Length -ne 16) {
  throw 'App Password must be 16 characters after removing spaces.'
}

$encodedUser = [uri]::EscapeDataString($SmtpUser)
$connectionUri = "smtps://${encodedUser}@smtp.gmail.com:465"

Ensure-Gcloud | Out-Null
gcloud config set project $ProjectId | Out-Null

Write-Host "Updating EXT_MAIL_SMTP_CONNECTION_URI..." -ForegroundColor Cyan
Add-SecretVersion -SecretName 'EXT_MAIL_SMTP_CONNECTION_URI' -Value $connectionUri

Write-Host "Updating EXT_MAIL_SMTP_PASSWORD..." -ForegroundColor Cyan
Add-SecretVersion -SecretName 'EXT_MAIL_SMTP_PASSWORD' -Value $normalizedPassword

if ($UpdateNodemailerSecret) {
  Write-Host "Updating NODEMAILER_SMTP_PASSWORD (Cloud Functions direct nodemailer path)..." -ForegroundColor Cyan
  Add-SecretVersion -SecretName 'NODEMAILER_SMTP_PASSWORD' -Value $normalizedPassword
}

if ($DeployExtension) {
  $repoRoot = Split-Path $PSScriptRoot -Parent
  Push-Location $repoRoot
  try {
    Write-Host 'Deploying firestore-send-email extension...' -ForegroundColor Cyan
    npx -y firebase-tools@latest deploy --only extensions:firestore-send-email --project $ProjectId
  }
  finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Done. Next: run a mail test.' -ForegroundColor Green
Write-Host '  cd functions && node test-email.js && node check-mail.js' -ForegroundColor Cyan
