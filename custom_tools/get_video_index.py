TOOL_SPEC = {
    "name": "get_video_index",
    "description": """Creates TwelveLabs index with the name strands-agent. Validates if exists, if not creates it and sets environment variable for TWELVELABS_MARENGO_INDEX_ID and TWELVELABS_PEGASUS_INDEX_ID.
    Should be used to validate indexes before any TwelveLabs tools are called.

    Returns:
        str: Confirmation message about index creation or existence.
    """,
    "inputSchema": {}
}

import os
from twelvelabs import TwelveLabs
from twelvelabs.indexes import IndexesCreateRequestModelsItem

def get_video_index(**kwargs) -> str:

    # NOTE: Could possibly be integrated into official Strands tooling... No need for developers to manually navigate to TwelveLabs playground to create index.

    """
    Creates TwelveLabs index with the name strands-agent. Validates if exists, if not creates it and sets environment variable for TWELVELABS_MARENGO_INDEX_ID and TWELVELABS_PEGASUS_INDEX_ID.
    Should be used to validate indexes before any TwelveLabs tools are called.

    Returns:
        str: Confirmation message about index creation or existence.
    """

    print("Checking for existing TwelveLabs index...")

    if not os.getenv("TWELVELABS_API_KEY"):
        raise Exception("TWELVELABS_API_KEY environment variable not set. Please set it to your TwelveLabs API key.")

    twelvelabs_client = TwelveLabs(api_key=os.getenv("TWELVELABS_API_KEY"))

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