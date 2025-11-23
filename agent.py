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
os.environ["STRANDS_SLACK_AUTO_REPLY"] = "true"
os.environ["STRANDS_SLACK_LISTEN_ONLY_TAG"] = ""

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

    system_message = payload.get("prompt")
    
    # Extract tokens from prompt BEFORE processing (Electron embeds them in the prompt text)
    # This allows socket mode to start immediately, independent of agent processing
    import re
    bot_token_match = re.search(r'SLACK_BOT_TOKEN[:\s]+(xoxb-[^\s\n]+)', system_message)
    app_token_match = re.search(r'SLACK_APP_TOKEN[:\s]+(xapp-[^\s\n]+)', system_message)
    
    if bot_token_match and app_token_match:
        os.environ["SLACK_BOT_TOKEN"] = bot_token_match.group(1)
        os.environ["SLACK_APP_TOKEN"] = app_token_match.group(1)
        print(f"✅ Extracted Slack tokens from prompt")
    
    # Start socket mode ONCE if tokens are available (runs independently in background)
    if not _socket_mode_started:
        has_bot_token = bool(os.environ.get("SLACK_BOT_TOKEN"))
        has_app_token = bool(os.environ.get("SLACK_APP_TOKEN"))
        
        if has_bot_token and has_app_token:
            print(f"\n{'='*60}")
            print(f"Starting Slack Socket Mode (independent background process)...")
            print(f"   Bot token present: {has_bot_token}")
            print(f"   App token present: {has_app_token}")
            print(f"   Socket mode started: {_socket_mode_started}")
            try:
                from custom_tools.slack import start_socket_mode_auto
                if start_socket_mode_auto(agent):
                    _socket_mode_started = True
                    print(f"✅ Slack Socket Mode started - now listening for Slack messages independently")
                else:
                    print(f"❌ Failed to start Socket Mode")
            except Exception as e:
                print(f"❌ Failed to start Slack Socket Mode: {e}")
                import traceback
                traceback.print_exc()
            print(f"{'='*60}\n")
    
    # Process the agent stream (independent of socket mode)
    stream = agent.stream_async(system_message)

    async for event in stream:
        if "data" in event:
            yield event['data']
    
if __name__ == '__main__':
    app.run()