import os

from dotenv import load_dotenv
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands_tools import file_read, use_aws, slack 
from twelvelabs import TwelveLabs
from twelvelabs.indexes import IndexesCreateRequestModelsItem

from tools import chat_video

# Temporary ENV VARS for testing
load_dotenv()

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
    Creates TwelveLabs index with the name strands-agent. Validates if exists, if not creates it.

    Returns:
        str: Confirmation message about index creation or existence.
    """

    print("Checking for existing TwelveLabs index...")

    existing_indexes = twelvelabs_client.indexes.list()

    for index in existing_indexes.items:
        
        if index.index_name == os.getenv('TWELVELABS_INDEX_NAME'):

            os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
            os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

            return "Index already exists with index_id: " + index.id
        
    try:

        index = twelvelabs_client.indexes.create(index_name=os.getenv('TWELVELABS_INDEX_NAME'), models=[
            IndexesCreateRequestModelsItem(model_name='marengo2.7', model_options=['visual', 'audio']),
            IndexesCreateRequestModelsItem(model_name='pegasus1.2', model_options=['visual', 'audio']),
        ])

        os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
        os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

        return "Index created successfully with index_id: " + index.id
    
    except Exception as e:

        print(f"Error creating index: {e}")

        return "Failed to create index."

if __name__ == "__main__":

    app = BedrockAgentCoreApp()
    agent = Agent(
        tools=[file_read, chat_video, use_aws, find_file_from_folder, get_index],
    )

    video_name = str(input())
    video_formatted = video_name + ".mp4"

    prompt = "Please process the video file " + video_formatted + " located in the Zoom folder " + ZOOM_DOWNLOAD_PATH + " into the TwelveLabs index named " + os.getenv('TWELVELABS_MARENGO_INDEX_ID') + "."

    result = agent(prompt)
    