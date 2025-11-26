import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore'

function createBedrockAgentCoreClient() {
    const config = {
        region: 'us-east-1',
    };
    return new BedrockAgentCoreClient(config);
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    let streamEnded = false; // Track if stream has been ended to prevent double-ending
    
    try {
        // Parse request - supports both Lambda Function URL and API Gateway formats
        let runtimeSessionId = null;
        let prompt = null;

        // Try to get from request body (Lambda Function URL or API Gateway POST with JSON)
        if (event.body) {
            try {
                const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
                runtimeSessionId = body.runtimeSessionId || body.runtime_session_id;
                prompt = body.prompt;
            } catch (e) {
                console.warn('Failed to parse body as JSON:', e);
            }
        }

        // Fallback to direct event properties (for testing or direct invocation)
        if (!runtimeSessionId) {
            runtimeSessionId = event.runtimeSessionId || event.runtime_session_id;
        }
        if (!prompt) {
            prompt = event.prompt;
        }

        // Fallback to query parameters
        if (!runtimeSessionId || !prompt) {
            const queryParams = event.queryStringParameters || {};
            if (!runtimeSessionId) {
                runtimeSessionId = queryParams.runtimeSessionId || queryParams.runtime_session_id;
            }
            if (!prompt) {
                prompt = queryParams.prompt;
            }
        }

        // Validate required parameters
        if (!runtimeSessionId || !prompt) {
            responseStream.setContentType('application/json');
            responseStream.write(JSON.stringify({
                error: 'Missing required parameters: runtimeSessionId and prompt'
            }));
            responseStream.end();
            return;
        }

        console.log(`Invoking agent with session: ${runtimeSessionId.substring(0, 20)}...`);
        console.log(`Prompt preview: ${prompt.substring(0, 100)}...`);

        const agentCoreClient = createBedrockAgentCoreClient();

        const payloadJson = JSON.stringify({
            prompt: prompt
        });

        const command = new InvokeAgentRuntimeCommand({
            runtimeSessionId: runtimeSessionId,
            agentRuntimeArn: process.env.AGENT_RUNTIME_ARN || "arn:aws:bedrock-agentcore:us-east-1:551588892732:runtime/agentv2-ygWXvkBdWG",
            qualifier: "DEFAULT",
            payload: new TextEncoder().encode(payloadJson)
        });

        const response = await agentCoreClient.send(command);

        // Check for errors in response
        if (response.error || (response.response && response.response.statusCode >= 400)) {
            const errorMessage = response.error?.message || response.error || 'Unknown error from Bedrock AgentCore';
            console.error('Bedrock AgentCore error:', errorMessage);
            responseStream.setContentType('application/json');
            responseStream.write(JSON.stringify({ error: errorMessage }));
            responseStream.end();
            return;
        }

        const stream = response.response;

        if (!stream) {
            responseStream.setContentType('application/json');
            responseStream.write(JSON.stringify({ error: 'No stream found in response' }));
            responseStream.end();
            return;
        }

        responseStream.setContentType('text/event-stream');

        const decoder = new TextDecoder();

        stream.on('data', (chunk) => {
            const decoded = decoder.decode(chunk, { stream: true });
            responseStream.write(decoded);
        });

        stream.on('end', () => {
            // Stream completed
            if (!streamEnded) {
                streamEnded = true;
                responseStream.end();
            }
        });

        stream.on('error', (error) => {
            console.error('Error reading stream:', error);
            if (!streamEnded) {
                streamEnded = true;
                // Send error in SSE format that client can parse
                responseStream.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                responseStream.end();
            }
        });

    } catch (error) {
        console.error('Error in handler:', error);
        if (!streamEnded) {
            streamEnded = true;
            responseStream.setContentType('application/json');
            responseStream.write(JSON.stringify({
                error: error.message,
                errorType: error.constructor.name
            }));
            responseStream.end();
        }
    }
});