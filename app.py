"""
Workshop entrypoint: Hacking the AgentCore (10–20 min).

Attendees focus on this file plus `custom_tools/` (TwelveLabs modules and optional snippets).
Run the AgentCore runtime from this script; use `npm run dev` in `electron-app/` for hot-reload
against the same backend when testing through the desktop UI.

Activity A — Prompt / personality: edit AGENT_SYSTEM_PROMPT below.
Activity B — Strands ecosystem: optional extra tool is wired in get_tools(); see ACTIVITY-HACKING-AGENTCORE.md.
"""

import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools import environment

from custom_tools import chat_video, compliance_checklist, fetch_video_url, get_video_index, search_video

os.environ["BYPASS_TOOL_CONSENT"] = "true"

# --- Activity A: edit this string to change persona and task (ex. "Strict Compliance Officer") ---
AGENT_SYSTEM_PROMPT = """You are a helpful assistant for video intelligence workflows.

When working with TwelveLabs:
- Prefer calling get_video_index first if index IDs may be unset.
- Use search_video for semantic search across indexed videos.
- Use chat_video for questions about a specific video (by video_id or after upload).
- Use fetch_video_url when a clip file or URL is needed from a TwelveLabs video id.

Be concise. If the user asks for compliance-style analysis, structure answers clearly and cite which tools you used."""

app = BedrockAgentCoreApp()


def get_tools():
    """TwelveLabs tools + strands_tools.environment; Activity B adds compliance_checklist."""
    return [
        environment,
        chat_video,
        search_video,
        get_video_index,
        fetch_video_url,
        compliance_checklist,
    ]


agent = Agent(tools=get_tools(), system_prompt=AGENT_SYSTEM_PROMPT)


@app.entrypoint
async def invoke(payload):
    system_message = payload.get("prompt")
    print(f"System message: {system_message}")

    agent(system_message)
    print()


if __name__ == "__main__":
    while True:
        asyncio.run(invoke({
            "prompt": input("Enter a prompt: ")
        }))
