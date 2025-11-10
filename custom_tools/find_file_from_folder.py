TOOL_SPEC = {
    "name": "find_file_from_folder",
    "description": """Finds a file in the specified folder and returns its full path.

    Args:
        folder_path (str): The path to the folder where the search should begin.
        file_name (str): The name of the file to search for.

    Returns:
        str: The full path of the found file or "File not found." if the file does not exist.""",
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "folder_path": {
                    "type": "string",
                    "description": "The path to the folder where the search should begin."
                },
                "file_name": {
                    "type": "string",
                    "description": "The name of the file to search for."
                }
            },
            "required": ["folder_path", "file_name"]
        }
    }
}

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