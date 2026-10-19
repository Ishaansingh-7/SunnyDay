param(
    [string]$SenderEmail = "",
    [string]$Stack = "sunnyday",
    [string]$Region = "ap-southeast-2"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-Ok($step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed (exit code $LASTEXITCODE)" }
}

if (-not $SenderEmail) {
    $SenderEmail = Read-Host "Email address to send updates from (you'll get a verification link)"
}

Write-Host "1/5 Creating or updating the AWS resources (this takes 5-10 minutes the first time)..."
sam deploy --template-file template.yaml --stack-name $Stack --region $Region `
    --capabilities CAPABILITY_IAM --resolve-s3 `
    --parameter-overrides "SenderEmail=$SenderEmail" `
    --no-confirm-changeset --no-fail-on-empty-changeset
Assert-Ok "sam deploy"

$outputs = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
    --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
Assert-Ok "describe-stacks"
function Out($key) { ($outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue }

Write-Host "2/5 Writing the site's account settings..."
@(
    "VITE_COGNITO_REGION=$(Out 'Region')"
    "VITE_USER_POOL_ID=$(Out 'UserPoolId')"
    "VITE_USER_POOL_CLIENT_ID=$(Out 'UserPoolClientId')"
) | Set-Content -Path ".env.production" -Encoding ascii

Write-Host "3/5 Building the site..."
npm ci
Assert-Ok "npm ci"
npm run build
Assert-Ok "npm run build"

Write-Host "4/5 Uploading to S3..."
aws s3 cp dist/index.html "s3://$(Out 'WebsiteBucketName')/index.html" --region $Region `
    --cache-control "no-cache" --content-type "text/html; charset=utf-8"
Assert-Ok "s3 upload"

Write-Host "5/5 Refreshing CloudFront..."
aws cloudfront create-invalidation --distribution-id (Out 'DistributionId') --paths "/*" | Out-Null
Assert-Ok "cloudfront invalidation"

Write-Host ""
Write-Host "SunnyDay is live at $(Out 'WebsiteUrl')"
Write-Host "A brand-new CloudFront address can take 5-10 minutes to start working."
Write-Host ""
Write-Host "Before emails can go out:"
Write-Host "  1. Open the 'Amazon Web Services' email sent to $SenderEmail and click the verification link."
Write-Host "  2. New accounts can only email verified addresses. To email anyone, open the SES console,"
Write-Host "     choose 'Request production access' and describe SunnyDay as a weather-update service."
