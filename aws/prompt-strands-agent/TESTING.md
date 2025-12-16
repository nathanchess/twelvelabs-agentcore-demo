# Testing the Lambda Function

## Prerequisites

1. **Get a Session ID**: You need to create an agent session first. You can do this by:
   - Using the Electron app (it creates sessions automatically)
   - Using AWS CLI:
     ```bash
     aws bedrock-agent-runtime create-session --region us-east-1
     ```
   - Using the Electron app's `create-agent-session` IPC handler

2. **Lambda Function URL**: 
   ```
   https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/
   ```

## Quick Test with curl

### Test 1: POST with JSON body
```bash
curl -X POST "https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{
    "runtimeSessionId": "YOUR_SESSION_ID_HERE",
    "prompt": "Hello, how are you?"
  }'
```

### Test 2: GET with query parameters
```bash
curl -X GET "https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/?runtimeSessionId=YOUR_SESSION_ID_HERE&prompt=Hello%2C%20how%20are%20you%3F"
```

### Test 3: Missing parameters (should return 400)
```bash
curl -X POST "https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello"
  }'
```

## Using the Test Scripts

### Linux/Mac (bash)
```bash
chmod +x test.sh
# Edit test.sh and replace YOUR_SESSION_ID_HERE with your actual session ID
./test.sh
```

### Windows (PowerShell)
```powershell
# Edit test.ps1 and replace your-session-id-here with your actual session ID
.\test.ps1
```

## Using Postman

1. **Create a new POST request**
   - URL: `https://dcj6rgsoxhp3uxevzhkw275ppi0pmdld.lambda-url.us-east-1.on.aws/`
   - Method: POST
   - Headers:
     - `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "runtimeSessionId": "YOUR_SESSION_ID_HERE",
       "prompt": "Hello, how are you?"
     }
     ```

2. **Send the request** and check the response

## Expected Response Format

### Success (200)
```json
{
  "contentType": "text/event-stream",
  "content": "data: \"chunk1\"\ndata: \"chunk2\"\n..."
}
```

### Error (400 - Missing parameters)
```json
{
  "error": "Missing required parameter: runtimeSessionId"
}
```

### Error (500 - Server error)
```json
{
  "error": "Error message here",
  "errorType": "ExceptionType"
}
```

## Getting a Session ID

### Option 1: Using AWS CLI
```bash
aws bedrock-agent-runtime create-session --region us-east-1
```

This will return:
```json
{
  "sessionId": "your-session-id-here",
  "sessionStatus": "ACTIVE"
}
```

### Option 2: Using the Electron App
1. Open the Electron app
2. Open browser DevTools (Ctrl+Shift+I or Cmd+Option+I)
3. In the console, run:
   ```javascript
   window.api.createAgentSession().then(sessionId => console.log('Session ID:', sessionId))
   ```

### Option 3: Using Python (boto3)
```python
import boto3

client = boto3.client('bedrock-agent-runtime', region_name='us-east-1')
response = client.create_session()
print(f"Session ID: {response['sessionId']}")
```

## Troubleshooting

### Error: "Missing required parameter"
- Make sure you're sending both `runtimeSessionId` and `prompt`
- Check that the JSON is properly formatted

### Error: "CredentialsProviderError"
- The Lambda function needs proper IAM permissions
- Make sure the Lambda execution role has `bedrock-agentcore:InvokeAgentRuntime` permission

### Error: "Invalid session ID"
- Session IDs expire after a period of inactivity
- Create a new session and try again

### No response or timeout
- Check CloudWatch logs for the Lambda function
- Verify the agent runtime ARN is correct
- Check that the Bedrock AgentCore service is available in your region








