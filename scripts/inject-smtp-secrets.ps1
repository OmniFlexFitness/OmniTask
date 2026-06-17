#Requires -Version 5.1
<#
.SYNOPSIS
  Add new Secret Manager versions for Firebase SMTP credentials (issue #91).

.DESCRIPTION
  Updates EXT_MAIL_SMTP_CONNECTION_URI and EXT_MAIL_SMTP_PASSWORD in Google Cloud
  Secret Manager for project omnitask-475422. Optionally updates
  NODEMAILER_SMTP_PASSWORD for Cloud Functions nodemailer.

  Does not write secrets to disk or echo passwords. Requires:
    gcloud auth login
    Secret Manager Secret Accessor (or Editor) on omnitask-475422

.PARAMETER AppPassword
  16-character Google App Password (no spaces). Prompted securely if omitted.

.PARAMETER SmtpUser
  SMTP auth username. Default: bertin.kenol@omniflexfitness.com

.PARAMETER ProjectId
  GCP project id. Default: omnitask-475422

.PARAMETER IncludeNodemailer
  Also add a NODEMAILER_SMTP_PASSWORD secret version (same App Password).

.EXAMPLE
  .\scripts\inject-smtp-secrets.ps1
  .\scripts\inject-smtp-secrets.ps1 -AppPassword 'xxxx xxxx xxxx xxxx' -IncludeNodemailer

.NOTES
  Runbook: docs/runbooks/configure-firebase-smtp-secrets.md
#>
[CmdletBinding()]
param(
  [string]$AppPassword,
  [string]$SmtpUser = 'bertin.kenol@omniflexfitness.com',
  [string]$ProjectId = 'omnitask-475422',
  [switch]$IncludeNodemailer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Gcloud {
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw 'gcloud CLI not found. Install Google Cloud SDK and run: gcloud auth login'
  }
  $account = gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>$null | Select-Object -First 1
  if (-not $account) {
    throw 'No active gcloud account. Run: gcloud auth login'
  }
  Write-Host "Using gcloud account: $account"
}

function Add-SecretVersion {
  param(
    [Parameter(Mandatory)][string]$SecretId,
    [Parameter(Mandatory)][string]$Plaintext
  )
  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tempFile, $Plaintext, [System.Text.UTF8Encoding]::new($false))
    gcloud secrets versions add $SecretId `
      --project=$ProjectId `
      --data-file=$tempFile `
      --quiet | Out-Null
    Write-Host "Updated secret: $SecretId (new version)"
  }
  finally {
    if (Test-Path $tempFile) {
      Remove-Item $tempFile -Force
    }
  }
}

Assert-Gcloud

$normalizedPassword = ($AppPassword -replace '\s', '')
if (-not $normalizedPassword) {
  $secure = Read-Host 'Google App Password (16 chars, input hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $normalizedPassword = ($bstr -replace '\s', '')
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR([ref]$bstr)
  }
}

if ($normalizedPassword.Length -ne 16) {
  throw "App Password must be 16 characters after removing spaces (got $($normalizedPassword.Length))."
}

$encodedUser = [uri]::EscapeDataString($SmtpUser)
$connectionUri = "smtps://${encodedUser}@smtp.gmail.com:465"

Write-Host "Project: $ProjectId"
Write-Host "SMTP user: $SmtpUser"
Write-Host "Connection URI host: smtp.gmail.com:465 (user URL-encoded in secret)"

Add-SecretVersion -SecretId 'EXT_MAIL_SMTP_CONNECTION_URI' -Plaintext $connectionUri
Add-SecretVersion -SecretId 'EXT_MAIL_SMTP_PASSWORD' -Plaintext $normalizedPassword

if ($IncludeNodemailer) {
  Add-SecretVersion -SecretId 'NODEMAILER_SMTP_PASSWORD' -Plaintext $normalizedPassword
}

Write-Host ''
Write-Host 'Done. Deploy extensions or re-deploy functions so new secret versions bind:'
Write-Host '  npx firebase-tools deploy --only extensions'
Write-Host '  # or trigger the GitHub Actions deploy workflow on live'
