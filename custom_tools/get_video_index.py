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

def get_video_index(*args, **kwargs) -> dict:
    # NOTE: Could possibly be integrated into official Strands tooling... No need for developers to manually navigate to TwelveLabs playground to create index.

    """
    Creates TwelveLabs index with the name strands-agent. Validates if exists, if not creates it and sets environment variable for TWELVELABS_MARENGO_INDEX_ID and TWELVELABS_PEGASUS_INDEX_ID.
    Should be used to validate indexes before any TwelveLabs tools are called.

    Returns:
        dict: ToolResult format with status and content:
        {
            "status": "success|error",
            "content": [{"text": "Confirmation message about index creation or existence"}]
        }
    """
    
    # Extract tool_use_id if provided (Strands passes ToolUse as first arg)
    tool_use_id = None
    if args:
        # ToolUse object can be accessed like a dict: tool["toolUseId"]
        try:
            tool = args[0]
            tool_use_id = tool.get("toolUseId") if hasattr(tool, 'get') else tool["toolUseId"]
        except (KeyError, AttributeError, TypeError, IndexError):
            pass

    try:
        if not os.getenv("TWELVELABS_API_KEY"):
            error_msg = "TWELVELABS_API_KEY environment variable not set. Please set it to your TwelveLabs API key."
            return {
                "toolUseId": tool_use_id,
                "status": "error",
                "content": [{"text": error_msg}],
            }

        twelvelabs_client = TwelveLabs(api_key=os.getenv("TWELVELABS_API_KEY"))

        # Use default index name if not set
        index_name = os.getenv('TWELVELABS_INDEX_NAME', 'strands-dev')

        existing_indexes = twelvelabs_client.indexes.list()

        for index in existing_indexes.items:
            if index.index_name == index_name:
                os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
                os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

                success_msg = f"Index already exists with index_id: {index.id}. Environment variables are now set for both indexes."
                return {
                    "toolUseId": tool_use_id,
                    "status": "success",
                    "content": [{"text": success_msg}],
                }
        
        index = twelvelabs_client.indexes.create(index_name=index_name, models=[
            IndexesCreateRequestModelsItem(model_name='marengo2.7', model_options=['visual', 'audio']),
            IndexesCreateRequestModelsItem(model_name='pegasus1.2', model_options=['visual', 'audio']),
        ])

        os.environ['TWELVELABS_MARENGO_INDEX_ID'] = index.id
        os.environ['TWELVELABS_PEGASUS_INDEX_ID'] = index.id

        success_msg = f"Index created successfully with index_id: {index.id}. Environment variables are now set for both indexes."
        return {
            "toolUseId": tool_use_id,
            "status": "success",
            "content": [{"text": success_msg}],
        }
    
    except Exception as e:
        error_msg = f"Failed to create index: {e}"
        return {
            "toolUseId": tool_use_id,
            "status": "error",
            "content": [{"text": error_msg}],
        }