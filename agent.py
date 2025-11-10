import json
import os
from dotenv import load_dotenv

# Temporary ENV VARS for testing
load_dotenv()

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands_tools import file_read, use_aws, slack, environment 
from twelvelabs import TwelveLabs
from twelvelabs.indexes import IndexesCreateRequestModelsItem

from custom_tools import chat_video, search_video

WINDOWS_USERNAME = "natha"
ZOOM_DOWNLOAD_PATH = f"C:\\Users\\{WINDOWS_USERNAME}\\Documents\\Zoom"

# AWS Bedrock Agent & TwelveLabs Client Initialization

twelvelabs_client = TwelveLabs(api_key=os.getenv("TWELVELABS_API_KEY"))

# Tool definitions
@tool
def find_file_from_folder(folder_path: str, file_name: str) -> str:

    """
    Finds a file in the specified folder and returns its full path.

    Args:
        folder_path (str): The path to the folder where the search should begin.
        file_name (str): The name of the file to search for.

    Returns:
        str: The full path of the found file or "File not found." if the file does not exist.
    """

    print(f"Searching for {file_name} in {folder_path}...")

    for root, dirs, files in os.walk(folder_path):
        if file_name in files:
            print(f'Found file at: {os.path.join(root, file_name)}')
            return os.path.join(root, file_name)
    
    return "File not found."

@tool
def get_index() -> str:

    # NOTE: Could possibly be integrated into official Strands tooling... No need for developers to manually navigate to TwelveLabs playground to create index.

    """
    Creates TwelveLabs index with the name strands-agent. Validates if exists, if not creates it and sets environment variable for TWELVELABS_MARENGO_INDEX_ID and TWELVELABS_PEGASUS_INDEX_ID.
    Should be used to validate indexes before any TwelveLabs tools are called.

    Returns:
        str: Confirmation message about index creation or existence.
    """

    print("Checking for existing TwelveLabs index...")

    existing_indexes = twelvelabs_client.indexes.list()

    for index in existing_indexes.items:
        
        if index.index_name == os.getenv('TWELVELABS_INDEX_NAME'):

            os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
            os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

            return "Index already exists with index_id: " + index.id + ". Environment variables are now set for both indexes."
        
    try:

        index = twelvelabs_client.indexes.create(index_name=os.getenv('TWELVELABS_INDEX_NAME'), models=[
            IndexesCreateRequestModelsItem(model_name='marengo2.7', model_options=['visual', 'audio']),
            IndexesCreateRequestModelsItem(model_name='pegasus1.2', model_options=['visual', 'audio']),
        ])

        os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
        os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

        return "Index created successfully with index_id: " + index.id + ". Environment variables are now set for both indexes."
    
    except Exception as e:

        print(f"Error creating index: {e}")

        return "Failed to create index."
    
@tool
def get_slack_channel_ids() -> dict | str:
    
    """
    
    Fetches all available Slack channels using SLACK_BOT_TOKEN and SLACK_APP_TOKEN environment variables.
    Organizes Slack channels and returns data in the form of dictionary with ID and metadata about the channel.
    Should be used to help identify the correct ID to pass in to send Slack message tool.

    If JSON structure returned is not proper, will return string that should be parsed to learn about channel metadata.

    """

    if not os.getenv("SLACK_BOT_TOKEN") or not os.getenv("SLACK_APP_TOKEN"):
        raise Exception("SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in environment variables")
    
    agent = Agent(
        tools=[slack]
    )
    
    result = agent.tool.slack(
        "conversations_list"
    )

    try:

        result_json = json.loads(result)

        return result_json

    except:

        return result

def _upload_file_to_twelvelabs(video_name: str):

    agent = Agent(
        tools=[file_read, chat_video, use_aws, find_file_from_folder, get_index, environment, slack, get_slack_channel_ids],
    )

    video_formatted = video_name + ".mp4"

    prompt = "Please process the video file " + video_formatted + " located in the Zoom folder " + ZOOM_DOWNLOAD_PATH + " into the TwelveLabs index named " + os.getenv('TWELVELABS_MARENGO_INDEX_ID') + "."
    "You should verify the index exists using the get_index tool before processing the video. It will create the index if it does not exist."

    result = agent(prompt)

    slack_announcement_prompt = "Please post message with content " + "\"The video " + video_formatted + " has been successfully uploaded and processed into TwelveLabs index.\" into the #all-strandsagent-playground channel."
    "You should only do this after confirming the video has been fully processed. If there are any errors during processing, do not post the announcement."

    agent(slack_announcement_prompt)

    slack_dm_prompt = "Please summarize the video " + video_formatted + " using TwelveLabs chat_video.py and post the summary into private direct message with user Nathan Che."
    "If you are unable to summarize the video, please inform Nathan Che that there was an issue processing the video."

    agent(slack_dm_prompt)

    return result

if __name__ == "__main__":

    video_file_name = str(input("Enter the video file name (without extension): "))

    _upload_file_to_twelvelabs(video_file_name)