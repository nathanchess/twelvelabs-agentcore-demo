import json
import os
from dotenv import load_dotenv

load_dotenv()

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools import use_aws, slack, environment 
from custom_tools import chat_video, search_video, get_slack_channel_ids, get_video_index

os.environ["BYPASS_TOOL_CONSENT"] = "true"

app = BedrockAgentCoreApp()
agent = Agent(
    tools=[slack, environment, chat_video, search_video, use_aws, get_slack_channel_ids, get_video_index]
)

@app.entrypoint
async def invoke(payload):
    """
    Process system request directly and ONLY from Electron app.
    """
    system_message = payload.get("prompt")
    stream = agent.stream_async(system_message)

    async for event in stream:
        if "data" in event:
            yield event['data']

if __name__ == '__main__':
    app.run()