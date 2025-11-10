import json
import os
from dotenv import load_dotenv

load_dotenv()

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands_tools import file_read, use_aws, slack, environment 
from twelvelabs import TwelveLabs
from twelvelabs.indexes import IndexesCreateRequestModelsItem

from custom_tools import chat_video, search_video, get_slack_channel_ids, get_video_index

WINDOWS_USERNAME = "natha"
ZOOM_DOWNLOAD_PATH = f"C:\\Users\\{WINDOWS_USERNAME}\\Documents\\Zoom"
