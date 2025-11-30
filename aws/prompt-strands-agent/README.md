# Prompt Strands Agent Lambda Function

## Overview
This Lambda function acts as a proxy between the Electron app and AWS Bedrock AgentCore, allowing the app to call the agent via API Gateway instead of directly using AWS SDK.

## API Gateway Integration

### Request Format

**POST with JSON body:**
```json
{
  "runtimeSessionId": "session-id-here",
  "prompt": "Your prompt here"
}
```

**GET with query parameters:**
```
?runtimeSessionId=session-id-here&prompt=Your+prompt+here
```

### Response Format

**Success (200):**
```json
{
  "contentType": "text/event-stream",
  "content": "data: \"chunk1\"\ndata: \"chunk2\"\n..."
}
```

**Error (400/500):**
```json
{
  "error": "Error message",
  "errorType": "ExceptionType"
}
```

## Deployment

### 1. Create Lambda Function
```bash
# Package the function
cd aws/prompt-strands-agent
zip lambda_function.zip lambda_function.py

# Or use AWS SAM/CloudFormation/CDK
```

### 2. Set Environment Variables
- `AGENT_RUNTIME_ARN` (optional, defaults to the hardcoded ARN)

### 3. Configure IAM Permissions
The Lambda execution role needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeAgentRuntime"
      ],
      "Resource": [
        "arn:aws:bedrock-agentcore:us-east-1:551588892732:runtime/*"
      ]
    }
  ]
}
```

### 4. API Gateway Setup

**REST API:**
- Create REST API
- Create POST method pointing to Lambda
- Enable CORS if calling from browser/Electron
- Deploy to stage

**HTTP API (Recommended):**
- Create HTTP API
- Add Lambda integration
- Configure route: `POST /prompt-strands-agent`
- Enable CORS

## Client Integration

The Electron app will need to be updated to call the API Gateway endpoint instead of directly calling Bedrock AgentCore. The client should:

1. Parse the SSE format from the `content` field
2. Handle streaming chunks
3. Handle errors appropriately

## Limitations

1. **No True Streaming**: Lambda doesn't support true HTTP streaming responses. All chunks are collected and returned at once. For true streaming, consider:
   - Lambda Function URLs with streaming response (HTTP API v2)
   - WebSocket API Gateway
   - Direct SDK calls (current approach)

2. **Session Management**: Sessions are managed client-side. The Lambda doesn't create or manage sessions.

## Testing

Use the `__main__` block for local testing:
```bash
python lambda_function.py
```

Or test with AWS SAM:
```bash
sam local invoke PromptStrandsAgentFunction --event event.json
```





