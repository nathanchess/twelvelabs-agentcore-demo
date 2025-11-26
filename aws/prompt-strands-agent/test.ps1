# PowerShell script for testing Lambda Function URL

$LAMBDA_URL = "https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/"

# Replace with your actual session ID
# Get one by running: aws bedrock-agent-runtime create-session --region us-east-1
$SESSION_ID = "ydasoijkfhjaeiw9ojfpaewjfeqw3jfqwojfeiojwepiofjqwepoifjweqpoifjewqopifqwejofjwqepoij"

Write-Host "Testing Lambda Function URL..." -ForegroundColor Green
Write-Host "URL: $LAMBDA_URL" -ForegroundColor Cyan
Write-Host ""

# Test 1: POST with JSON body
Write-Host "=== Test 1: POST with JSON body ===" -ForegroundColor Yellow
$body = @{
    runtimeSessionId = $SESSION_ID
    prompt = "Hello, how are you?"
} | ConvertTo-Json

Write-Host "Sending body:" -ForegroundColor Cyan
Write-Host $body -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $LAMBDA_URL -Method Post -Body $body -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""

# Debug test - see what Lambda receives
Write-Host "=== Debug Test: Check what Lambda receives ===" -ForegroundColor Yellow
try {
    $debugUrl = "$LAMBDA_URL" + "?debug=true"
    $response = Invoke-RestMethod -Uri $debugUrl -Method Get
    Write-Host "Lambda Event Structure:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Debug test error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Cyan
    }
}

Write-Host ""