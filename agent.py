import json
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools import environment 
from custom_tools import chat_video, search_video, get_slack_channel_ids, get_video_index, slack, fetch_video_url

os.environ["BYPASS_TOOL_CONSENT"] = "true"

def get_tools():
    return [slack, environment, chat_video, search_video, get_slack_channel_ids, get_video_index, fetch_video_url]

app = BedrockAgentCoreApp()
agent = Agent(
    tools=get_tools()
)

# Track if socket mode has been started to avoid multiple starts
_socket_mode_started = False

@app.entrypoint
async def invoke(payload):
    """
    Process system request directly and ONLY from Electron app.
    """
    global _socket_mode_started
    
    # Check if Slack tokens are available and start socket mode if not already started
    has_bot_token = bool(os.environ.get("SLACK_BOT_TOKEN"))
    has_app_token = bool(os.environ.get("SLACK_APP_TOKEN"))
    
    if not _socket_mode_started and has_bot_token and has_app_token:
        print(f"\n{'='*60}")
        print(f"Checking Slack tokens in invoke()...")
        print(f"   Bot token present: {has_bot_token}")
        print(f"   App token present: {has_app_token}")
        print(f"   Socket mode started: {_socket_mode_started}")
        try:
            from custom_tools.slack import start_socket_mode_auto
            if start_socket_mode_auto(agent):
                _socket_mode_started = True
                print(f"Slack Socket Mode auto-started from invoke()")
            else:
                print(f"Failed to start Socket Mode")
        except Exception as e:
            print(f"Failed to auto-start Slack Socket Mode: {e}")
            print(f"{'='*60}\n")
    elif has_bot_token or has_app_token:
        print(f"   [AGENT] Tokens partial - Bot: {has_bot_token}, App: {has_app_token}")
    
    system_message = payload.get("prompt")
    stream = agent.stream_async(system_message)

    async for event in stream:
        if "data" in event:
            yield event['data']

if __name__ == '__main__':
    app.run()