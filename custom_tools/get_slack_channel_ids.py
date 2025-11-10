TOOL_SPEC = {
    "name": "get_slack_channel_ids",
    "description": """
    Fetches all available Slack channels using SLACK_BOT_TOKEN and SLACK_APP_TOKEN environment variables.
    Organizes Slack channels and returns data in the form of dictionary with ID and metadata about the channel.
    Should be used to help identify the correct ID to pass in to send Slack message tool.

    If JSON structure returned is not proper, will return string that should be parsed to learn about channel metadata.
    """,
    "inputSchema": {}
}

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
 
