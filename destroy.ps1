param(
    [string]$Stack = "sunnyday",
    [string]$Region = "ap-southeast-2"
)

$ErrorActionPreference = "Stop"
$bucket = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" --output text
aws s3 rm "s3://$bucket" --recursive --region $Region
sam delete --stack-name $Stack --region $Region --no-prompts
Write-Host "SunnyDay and all its AWS resources were deleted."
