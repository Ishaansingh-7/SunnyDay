<#
  Uploads SunnyDay to a GitHub repository.

  1. Create an empty repository on github.com (no README, no .gitignore, no licence).
  2. Run:  .\upload-to-github.ps1 -RepoUrl https://github.com/<your-username>/SunnyDay.git
  Run it again any time to push new changes.
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [string]$Message = "SunnyDay: weather forecasting and climate analytics on AWS"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git isn't installed. Get it from https://git-scm.com/download/win, then run this again." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".git")) {
  git init | Out-Null
  Write-Host "Created a new Git repository."
}

if (-not (git config user.name)) {
  $name = Read-Host "Name to show on your commits"
  git config user.name "$name"
}
if (-not (git config user.email)) {
  $mail = Read-Host "Email for your commits (use the one on your GitHub account)"
  git config user.email "$mail"
}

git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m $Message | Out-Null
  Write-Host "Committed your changes."
} else {
  Write-Host "Nothing new to commit."
}

git branch -M main

$remotes = git remote
if ($remotes -contains "origin") {
  git remote set-url origin $RepoUrl
} else {
  git remote add origin $RepoUrl
}

Write-Host "Pushing to $RepoUrl ..."
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "The push didn't go through. If GitHub asks you to sign in, finish that in the browser window and run this again." -ForegroundColor Yellow
  exit 1
}

$web = $RepoUrl -replace '\.git$', ''
Write-Host ""
Write-Host "Done. Your project is at $web" -ForegroundColor Green
