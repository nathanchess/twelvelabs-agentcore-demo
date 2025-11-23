
"""
Slack Integration Tool for Strands Agents
========================================

This module provides a comprehensive integration between Slack and Strands agents,
enabling AI-powered interactions within Slack workspaces through:

1. Real-time event processing via Socket Mode
2. Direct API access to all Slack methods
3. Simplified message sending with a dedicated tool

Key Features:
------------
- Socket Mode support for real-time events
- Access to all Slack API methods (auto-detected)
- Event history storage and retrieval
- Automatic message reaction handling
- Thread support for conversations
- Agent delegation for message processing
- Environment variable configuration
- Comprehensive error handling
- Dynamic toggling of auto-reply mode

Setup Requirements:
-----------------
1. Slack App with appropriate scopes:
   - chat:write
   - reactions:write
   - channels:history
   - app_mentions:read
   - channels:read
   - reactions:read
   - groups:read
   - im:read
   - mpim:read

2. Environment variables:
   - SLACK_BOT_TOKEN: xoxb-... token from Slack app
   - SLACK_APP_TOKEN: xapp-... token with Socket Mode enabled
   - STRANDS_SLACK_LISTEN_ONLY_TAG (optional): Only process messages with this tag
   - STRANDS_SLACK_AUTO_REPLY (optional): Set to "true" to enable automatic replies

Usage Examples:
-------------
# Basic setup with Strands agent
```python
from strands import Agent
from strands_tools import slack

# Create agent with Slack tool
agent = Agent(tools=[slack])

# Use the agent to interact with Slack
result = agent.tool.slack(
    action="chat_postMessage",
    parameters={"channel": "C123456", "text": "Hello from Strands!"}
)

# For simple message sending, use the dedicated tool
result = agent.tool.slack_send_message(
    channel="C123456",
    text="Hello from Strands!",
    thread_ts="1234567890.123456"  # Optional - reply in thread
)

# Start Socket Mode to listen for real-time events
agent.tool.slack(action="start_socket_mode")

# Get recent events from Slack
events = agent.tool.slack(
    action="get_recent_events",
    parameters={"count": 10}
)

# Toggle auto-reply mode using the environment tool
agent.tool.environment(
    action="set",
    name="STRANDS_SLACK_AUTO_REPLY",
    value="true"  # Set to "false" to disable auto-replies
)
```

Socket Mode:
----------
The tool includes a socket mode handler that connects to Slack's real-time
messaging API and processes events through a Strands agent. When enabled, it:

1. Listens for incoming Slack events
2. Adds a "thinking" reaction to show processing
3. Uses a Strands agent to generate responses
4. Removes the "thinking" reaction and adds a completion reaction
5. Stores events for later retrieval

Real-time events are stored in a local file system at: ./slack_events/events.jsonl

Auto-Reply Mode:
--------------
You can control whether the agent automatically sends replies to Slack or simply
processes messages without responding:

- Set STRANDS_SLACK_AUTO_REPLY=true: Agent will automatically send responses to Slack
- Default behavior (false): Agent will process messages but won't automatically reply

This feature allows you to:
1. Run in "listen-only" mode to monitor without responding
2. Toggle auto-reply behavior dynamically using the environment tool
3. Implement custom reply logic using the slack_send_message tool

Error Handling:
------------
The tool includes comprehensive error handling for:
- API rate limiting
- Network issues
- Authentication problems
- Malformed requests
- Socket disconnections

When errors occur, appropriate error messages are returned and logged.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List

from slack_bolt import App
from slack_sdk.errors import SlackApiError
from slack_sdk.socket_mode import SocketModeClient
from slack_sdk.socket_mode.request import SocketModeRequest
from slack_sdk.socket_mode.response import SocketModeResponse
from slack_sdk.web.client import WebClient
from strands import Agent, tool

# Configure logging
# Set up logging to output to console if not already configured
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
logger = logging.getLogger(__name__)

# System prompt for Slack communications
SLACK_SYSTEM_PROMPT = """
You are an AI assistant integrated with a Slack workspace. Important guidelines:

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: SLACK AUTO-REPLY BEHAVIOR (MUST FOLLOW)
═══════════════════════════════════════════════════════════════════════════════

**WHEN RESPONDING TO SLACK MESSAGES (auto-reply mode):**

⚠️ **ABSOLUTE RULE**: Complete ALL tool calls FIRST, then send ONE final message with complete results.

❌ **NEVER DO THIS**:
- Send "I'm working on it..." or "Let me check..." messages
- Send intermediate status updates
- Send multiple messages during tool execution
- Send a message after each tool call
- Send messages like "I'm setting up..." or "This might take a moment..."

✅ **ALWAYS DO THIS**:
- Execute ALL necessary tools silently (get_video_index, search_video, chat_video, etc.)
- Gather ALL information needed
- Process ALL results
- Compose ONE complete message with all findings
- Send that ONE message using slack_send_message

**WORKFLOW**: Tools → Analysis → ONE Complete Message → Done

**EXAMPLE**: If asked "Find when Eric Johnson spoke":
1. Use get_video_index to find the video
2. Use search_video to find Eric Johnson's speaking moments
3. Process all results
4. Send ONE message: "Eric Johnson spoke at these times: [complete list]"

**REMEMBER**: The user expects ONE complete answer, not a conversation. Complete your work silently, then deliver the final result.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: SLACK FORMATTING RULES (MUST FOLLOW FOR ALL MESSAGES)
═══════════════════════════════════════════════════════════════════════════════

Slack uses 'mrkdwn' syntax, NOT standard Markdown. This is CRITICAL for auto-reply messages.

BOLD TEXT FORMATTING:
- ALWAYS use SINGLE asterisks (*text*) for bold text
- NEVER use double asterisks (**text**) - they will display literally and look broken
- When formatting timestamps or time ranges, use: *start_time - end_time*

EXAMPLES OF CORRECT FORMATTING:
1. *0:00 - 0:54* (highest confidence match)
2. *0:54 - 1:22*
3. *1:22 - 2:29*

EXAMPLES OF WRONG FORMATTING (DO NOT USE):
1. **0:00 - 0:54** ← This will show as **0:00 - 0:54** literally in Slack
2. **0:54 - 1:22** ← This will show as **0:54 - 1:22** literally in Slack

OTHER FORMATTING:
- Italic: use single underscores (_text_)
- Code: use backticks (`code`)
- Bullet points: use • character or single asterisk (*)
- Do NOT use Markdown headers (### Header) - Slack will display them literally

═══════════════════════════════════════════════════════════════════════════════

1. MESSAGE IDENTIFICATION:
   - You'll receive ALL events including your own messages echoed back
   - NEVER respond to your own messages - check bot_id/user_id carefully
   - Your messages typically have a bot_id or app_user_id field
   - The user field in your messages may be different from regular user messages

2. INTERACTION CAPABILITIES:
   - Send messages with slack_send_message(channel, text, thread_ts)
   - Add reactions with slack(action="reactions_add", parameters={"channel": "...", "name": "emoji_name", "timestamp": "..."})
   - Upload images with slack(action="files_upload_v2", parameters={"channel_id": "...", "file": "...", "title": "..."})
   - Upload audio with slack(action="files_upload_v2", parameters={"channel_id": "...", "file": "/path/to/audio.mp3", "title": "Audio Title", "filetype": "mp3"})
   - Create rich messages with blocks using chat_postMessage action

3. CONVERSATION FLOW:
   - Maintain context across messages in threads
   - Use thread_ts parameter to keep conversations organized
   - Prefer thread replies for multi-turn conversations

4. CONTENT GUIDELINES:
   - Keep responses concise and formatted for chat readability
   - Use emoji reactions as appropriate signals
   - Follow communication priority: Speaking/Audio > Text speaking > Images > Plain text > Reactions
   - When possible, prioritize sending audio messages over other forms of communication

Use slack_send_message tool to communicate back. Remember: ALWAYS use single asterisks (*text*) for bold, NEVER double asterisks (**text**).
"""  # noqa: E501

# Initialize Slack app and client based on environment variables
#SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
#SLACK_APP_TOKEN = os.environ.get("SLACK_APP_TOKEN")

# Initialize clients as None first
app = None
client = None
socket_client = None

# Event storage configuration
EVENTS_DIR = Path.cwd() / "slack_events"
EVENTS_FILE = EVENTS_DIR / "events.jsonl"

# Make sure events directory exists
EVENTS_DIR.mkdir(parents=True, exist_ok=True)


def initialize_slack_clients():
    """
    Initialize Slack clients if tokens are available.

    This function sets up three global clients:
    1. app: Slack Bolt application for handling events
    2. client: WebClient for making Slack API calls
    3. socket_client: SocketModeClient for real-time events

    Environment Variables:
        SLACK_BOT_TOKEN: The bot token starting with 'xoxb-'
        SLACK_APP_TOKEN: The app-level token starting with 'xapp-'

    Returns:
        tuple: (success, error_message)
            - success (bool): True if initialization was successful
            - error_message (str): None if successful, error details otherwise

    Example:
        success, error = initialize_slack_clients()
        if not success:
            logger.error(f"Failed to initialize Slack: {error}")
    """
    global app, client, socket_client

    bot_token = os.environ.get("SLACK_BOT_TOKEN")
    app_token = os.environ.get("SLACK_APP_TOKEN")

    if not bot_token or not app_token:
        return (
            False,
            "SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in environment variables",
        )

    try:
        app = App(token=bot_token)
        client = WebClient(token=bot_token)
        socket_client = SocketModeClient(app_token=app_token, web_client=client)
        
        # Add message event handler to Bolt App for Socket Mode
        # This ensures the app subscribes to message events
        @app.message("")
        def handle_message(message, say):
            """Handle all messages - this ensures subscription to message events."""
            # The actual processing happens in SocketModeHandler
            # This handler just ensures the app subscribes to the event
            pass
        
        # Auto-start socket mode if agent is available and not already started
        if socket_handler.agent is not None and not socket_handler.is_connected:
            logger.info("🔄 Auto-starting Socket Mode after token initialization...")
            socket_handler.start(socket_handler.agent)
        
        return True, None
    except Exception as e:
        logger.error(f"Error initializing Slack clients: {e}")
        return False, f"Error initializing Slack clients: {str(e)}"


class SocketModeHandler:
    """
    Handle Socket Mode connections and events for real-time Slack interactions.

    This class manages the connection to Slack's Socket Mode API, which allows
    for real-time event processing without requiring a public-facing endpoint.

    Key Features:
    - Automatic connection management
    - Event processing with Strands agents
    - Event storage for historical access
    - Reaction-based status indicators (thinking, completed, error)
    - Thread-based conversation support
    - Error handling with visual feedback

    Typical Usage:
    ```python
    # Initialize the handler
    handler = SocketModeHandler()

    # Start listening for events
    handler.start()

    # Process events for a while...

    # Stop the connection when done
    handler.stop()
    ```

    Events Processing Flow:
    1. Event received from Slack
    2. Event acknowledged immediately
    3. Event stored to local filesystem
    4. "thinking_face" reaction added to show processing
    5. Event processed by Strands agent
    6. "thinking_face" reaction removed
    7. "white_check_mark" reaction added on success
    8. Error handling with "x" reaction if needed
    """

    def __init__(self):
        self.client = None
        self.is_connected = False
        self.agent = None

    def _setup_client(self):
        """Set up the socket client if not already initialized."""
        if socket_client is None:
            success, error_message = initialize_slack_clients()
            if not success:
                raise ValueError(error_message)
        self.client = socket_client
        self._setup_listeners()

    def _setup_listeners(self):
        """Set up event listeners for Socket Mode."""

        def process_event(client: SocketModeClient, req: SocketModeRequest):
            """Process incoming Socket Mode events."""
            logger.info("🎯 Socket Mode Event Received!")
            logger.info(f"Event Type: {req.type}")

            # Always acknowledge the request first
            response = SocketModeResponse(envelope_id=req.envelope_id)
            client.send_socket_mode_response(response)
            logger.info("✅ Event Acknowledged")

            try:
                # Store event in file system
                event_data = {
                    "event_type": req.type,
                    "payload": req.payload,
                    "timestamp": time.time(),
                    "envelope_id": req.envelope_id,
                }

                # Save event to disk
                EVENTS_DIR.mkdir(parents=True, exist_ok=True)
                with open(EVENTS_FILE, "a") as f:
                    f.write(json.dumps(event_data) + "\n")

                # Process the event based on type
                event = req.payload.get("event", {})

                # Handle message events
                if req.type == "events_api" and event.get("type") == "message" and not event.get("subtype"):
                    logger.info("💬 Processing Message Event")
                    self._process_message(event)

                # Handle interactive events
                elif req.type == "interactive":
                    logger.info("🔄 Processing Interactive Event")
                    interactive_context = {
                        "type": "interactive",
                        "channel": req.payload.get("channel", {}).get("id"),
                        "user": req.payload.get("user", {}).get("id"),
                        "ts": req.payload.get("message", {}).get("ts"),
                        "actions": req.payload.get("actions", []),
                        "full_payload": req.payload,
                    }
                    self._process_interactive(interactive_context)

                logger.info("✅ Event Processing Complete")

            except Exception as e:
                logger.error(f"Error processing socket mode event: {e}", exc_info=True)

        # Add the event listener
        self.client.socket_mode_request_listeners.append(process_event)

    def _process_message(self, event):
        """Process a message event using a Strands agent."""
        # Get bot info once and cache it
        if not hasattr(self, "bot_info"):
            try:
                self.bot_info = client.auth_test()
            except Exception as e:
                logger.error(f"Error getting bot info: {e}")
                self.bot_info = {"user_id": None, "bot_id": None}

        # Skip processing if this is our own message
        is_bot_message = bool(event.get("bot_id"))
        is_own_user = event.get("user") == self.bot_info.get("user_id")
        has_app_id = "app_id" in event
        
        if is_bot_message or is_own_user or has_app_id:
            logger.info("Skipping own message")
            return

        channel_id = event.get("channel")
        text = event.get("text", "")
        user = event.get("user")
        ts = event.get("ts")

        logger.info(f"Processing message: {text}")
        logger.info(f"Channel ID: {channel_id}")
        logger.info(f"User: {user}")
        logger.info(f"Timestamp: {ts}")

        if self.agent is None:
            logger.error("No agent found")
            return

        tools = list(self.agent.tool_registry.registry.values())
        trace_attributes = self.agent.trace_attributes

        agent = Agent(
            model=self.agent.model,
            messages=[],
            system_prompt=f"{self.agent.system_prompt}\n{SLACK_SYSTEM_PROMPT}",
            tools=tools,
            callback_handler=self.agent.callback_handler,
            trace_attributes=trace_attributes,
        )

        # Add thinking reaction
        try:
            if client:
                client.reactions_add(name="thinking_face", channel=channel_id, timestamp=ts)
        except Exception as e:
            logger.error(f"Error adding thinking reaction: {e}")

        # Get recent events for context
        slack_default_event_count = int(os.getenv("SLACK_DEFAULT_EVENT_COUNT", "42"))
        recent_events = self._get_recent_events(slack_default_event_count)
        event_context = f"\nRecent Slack Events: {json.dumps(recent_events)}" if recent_events else ""

        # Process with agent
        try:
            # Check if we should process this message (based on environment tag)
            listen_only_tag = os.environ.get("STRANDS_SLACK_LISTEN_ONLY_TAG", "")
            if listen_only_tag:
                if listen_only_tag not in text:
                    logger.info(f"Skipping message - does not contain tag: {listen_only_tag}")
                    return

            # Refresh the system prompt with latest context handled from Slack events
            agent.system_prompt = (
                f"{SLACK_SYSTEM_PROMPT}\n\nEvent Context:\nCurrent: {json.dumps(event)}{event_context}"
            )

            logger.info(f"Agent system prompt: {agent.system_prompt}")

            # Process with agent
            agent_prompt = f"[Channel: {channel_id}] User {user} says: {text}"
            response = agent(agent_prompt)
            
            logger.info(f"Response: {response}")

            # If we have a valid response, send it back to Slack
            if response and str(response).strip():
                if client:
                    logger.info(f"Sending response to Slack: {response}")
                    # Check if auto-reply is enabled
                    auto_reply_enabled = os.getenv("STRANDS_SLACK_AUTO_REPLY", "true").lower() == "true"
                    if auto_reply_enabled:
                        client.chat_postMessage(
                            channel=channel_id,
                            text=str(response).strip(),
                            thread_ts=ts,
                        )

                    # Remove thinking reaction
                    client.reactions_remove(name="thinking_face", channel=channel_id, timestamp=ts)

                    # Add completion reaction
                    client.reactions_add(name="white_check_mark", channel=channel_id, timestamp=ts)

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)

            # Try to send error message to channel
            if client:
                try:
                    # Remove thinking reaction
                    client.reactions_remove(name="thinking_face", channel=channel_id, timestamp=ts)

                    # Add error reaction and message
                    client.reactions_add(name="x", channel=channel_id, timestamp=ts)

                    # Only send error message if auto-reply is enabled
                    if os.getenv("STRANDS_SLACK_AUTO_REPLY", "true").lower() == "true":
                        client.chat_postMessage(
                            channel=channel_id,
                            text=f"Error processing message: {str(e)}",
                            thread_ts=ts,
                        )
                except Exception as e2:
                    logger.error(f"Error sending error message: {e2}")

    def _process_interactive(self, event):
        """Process an interactive event."""
        # Process interactive events similar to messages
        if client and self.agent:
            tools = list(self.agent.tool_registry.registry.values())

            agent = Agent(
                model=self.agent.model,
                messages=[],
                system_prompt=SLACK_SYSTEM_PROMPT,
                tools=tools,
                callback_handler=self.agent.callback_handler,
            )

            channel_id = event.get("channel")
            actions = event.get("actions", [])
            ts = event.get("ts")

            # Create context message for the agent
            interaction_text = f"Interactive event from user {event.get('user')}. Actions: {actions}"

            try:
                agent.system_prompt = f"{SLACK_SYSTEM_PROMPT}\n\nInteractive Context:\n{json.dumps(event, indent=2)}"
                response = agent(interaction_text)

                # Only send a response if auto-reply is enabled
                if os.getenv("STRANDS_SLACK_AUTO_REPLY", "true").lower() == "true":
                    client.chat_postMessage(
                        channel=channel_id,
                        text=str(response).strip(),
                        thread_ts=ts,
                    )

                # Add a reaction to indicate completion
                client.reactions_add(name="white_check_mark", channel=channel_id, timestamp=ts)

            except Exception as e:
                logger.error(f"Error processing interactive event: {e}", exc_info=True)
                try:
                    # Add error reaction
                    client.reactions_add(name="x", channel=channel_id, timestamp=ts)
                except Exception as e2:
                    logger.error(f"Error adding error reaction: {e2}")

    def _get_recent_events(self, count: int) -> List[Dict[str, Any]]:
        """Get recent events from the file system."""
        if not EVENTS_FILE.exists():
            return []

        try:
            with open(EVENTS_FILE, "r") as f:
                # Get the last 'count' events
                lines = f.readlines()[-count:]
                events = []
                for line in lines:
                    try:
                        event_data = json.loads(line.strip())
                        events.append(event_data)
                    except json.JSONDecodeError:
                        continue
                return events
        except Exception as e:
            logger.error(f"Error reading events file: {e}")
            return []

    def start(self, agent):
        """Start the Socket Mode connection."""
        logger.info("🚀 Starting Socket Mode Connection...")

        self.agent = agent

        if not self.is_connected:
            try:
                self._setup_client()
                self.client.connect()
                self.is_connected = True
                logger.info("✅ Socket Mode connection established!")
                return True
            except Exception as e:
                logger.error(f"❌ Error starting Socket Mode: {str(e)}")
                return False
        logger.info("ℹ️ Already connected, no action needed")
        return True

    def stop(self):
        """Stop the Socket Mode connection."""
        if self.is_connected and self.client:
            try:
                self.client.close()
                self.is_connected = False
                logger.info("Socket Mode connection closed")
                return True
            except Exception as e:
                logger.error(f"Error stopping Socket Mode: {e}", exc_info=True)
                return False
        return True


# Initialize socket handler
socket_handler = SocketModeHandler()


def start_socket_mode_auto(agent_instance):
    """
    Auto-start socket mode with the given agent instance.
    This function can be called from agent.py to automatically start socket mode.
    
    Args:
        agent_instance: The Strands Agent instance to use for processing messages
        
    Returns:
        bool: True if socket mode started successfully, False otherwise
    """
    if socket_handler.start(agent_instance):
        logger.info("✅ Socket Mode auto-started successfully")
        return True
    else:
        logger.error("❌ Failed to auto-start Socket Mode")
        return False


@tool
def slack(action: str, parameters: Dict[str, Any] = None, agent=None) -> str:
    """Slack integration for messaging, events, and interactions.

    This tool provides complete access to Slack's API methods and real-time
    event handling through a unified interface. It enables Strands agents to
    communicate with Slack workspaces, respond to messages, add reactions,
    manage channels, and more.

    Action Categories:
    -----------------
    1. Slack API Methods: Any method from the Slack Web API (e.g., chat_postMessage)
       Direct passthrough to Slack's API using the parameters dictionary

    2. Socket Mode Actions:
       - start_socket_mode: Begin listening for real-time events
       - stop_socket_mode: Stop the Socket Mode connection

    3. Event Management:
       - get_recent_events: Retrieve stored events from history

    Args:
        action: The action to perform. Can be:
            - Any valid Slack API method (chat_postMessage, reactions_add, etc.)
            - "start_socket_mode": Start listening for real-time events
            - "stop_socket_mode": Stop listening for real-time events
            - "get_recent_events": Retrieve recent events from storage
        parameters: Parameters for the action. For Slack API methods, these are
                  passed directly to the API. For custom actions, specific
                  parameters may be needed.

    Returns:
        str: Result of the requested action, typically containing a success/error
             status and relevant details or response data.

    Examples:
    --------
    # Send a message with CORRECT formatting (single asterisks for bold)
    result = slack(
        action="chat_postMessage",
        parameters={{
            "channel": "C0123456789",
            "text": "*Important*: Meeting summary\n• *0:00 - 0:54* (highest confidence match)",
            "blocks": [{{"type": "section", "text": {{"type": "mrkdwn", "text": "*Bold* message"}}}}]
        }}
    )
    
    # WRONG - Do NOT use double asterisks or Markdown headers:
    # text="**Important**: ### Header"  ← Will display literally!

    # Add a reaction to a message
    result = slack(
        action="reactions_add",
        parameters={{
            "channel": "C0123456789",
            "timestamp": "1234567890.123456",
            "name": "thumbsup"
        }}
    )

    # Start listening for real-time events
    result = slack(action="start_socket_mode")

    # Get recent events
    result = slack(action="get_recent_events", parameters={{"count": 10}})

    Notes:
    -----
    - Slack event stream include your own messages, do not reply yourself.
    - Required environment variables: SLACK_BOT_TOKEN, SLACK_APP_TOKEN
    - Optional environment variables:
      - STRANDS_SLACK_AUTO_REPLY: Set to "true" to enable automatic replies to messages
      - STRANDS_SLACK_LISTEN_ONLY_TAG: Only process messages containing this tag
      - SLACK_DEFAULT_EVENT_COUNT: Number of events to retrieve by default (default: 42)
    - Events are stored locally at ./slack_events/events.jsonl
    - See Slack API documentation for all available methods and parameters
    - Remember: ALWAYS use single asterisks (*text*) for bold, NEVER double asterisks (**text**).
    - Do NOT use double asterisks (**bold**) or hashes (### Header). Slack will display those characters literally.
    - Use • character or single asterisk (*) for bullet points.
    - Do NOT use Markdown headers (### Header) - Slack will display them literally.
    
    """
    # Store agent reference for auto-starting socket mode later
    if agent is not None:
        socket_handler.agent = agent
    
    # Initialize Slack clients if needed
    if action != "get_recent_events" and client is None:
        success, error_message = initialize_slack_clients()
        if not success:
            return f"Error: {error_message}"
    
    # Auto-start socket mode if tokens are available and not already started
    has_bot_token = bool(os.environ.get("SLACK_BOT_TOKEN"))
    has_app_token = bool(os.environ.get("SLACK_APP_TOKEN"))
    has_agent = socket_handler.agent is not None
    is_connected = socket_handler.is_connected
    
    if has_agent and not is_connected and has_bot_token and has_app_token:
        logger.info("🔄 Auto-starting Socket Mode (tokens detected)...")
        socket_handler.start(socket_handler.agent)

    # Set default parameters
    if parameters is None:
        parameters = {}

    try:
        # Handle Socket Mode actions
        if action == "start_socket_mode":
            # Use provided agent, or keep existing agent if already started
            agent_to_use = agent if agent is not None else socket_handler.agent
            if agent_to_use is None:
                return "❌ Error: Agent instance required to start Socket Mode. Socket Mode must be started with an agent instance."
            if socket_handler.start(agent_to_use):
                return "✅ Socket Mode connection established and ready to receive real-time events"
            return "❌ Failed to establish Socket Mode connection"

        elif action == "stop_socket_mode":
            if socket_handler.stop():
                return "✅ Socket Mode connection closed"
            return "❌ Failed to close Socket Mode connection"

        # Handle event retrieval
        elif action == "get_recent_events":
            count = parameters.get("count", 5)
            if not EVENTS_FILE.exists():
                return "No events found in storage"

            with open(EVENTS_FILE, "r") as f:
                lines = f.readlines()[-count:]
                events = []
                for line in lines:
                    try:
                        event_data = json.loads(line.strip())
                        events.append(event_data)
                    except json.JSONDecodeError:
                        continue

                # Always return a string, never None
                if events:
                    return f"Slack events: {json.dumps(events)}"
                else:
                    return "No valid events found in storage"

        # Standard Slack API methods
        else:
            # Check if method exists in the Slack client
            if hasattr(client, action) and callable(getattr(client, action)):
                method = getattr(client, action)
                response = method(**parameters)
                return f"✅ {action} executed successfully\n{json.dumps(response.data, indent=2)}"
            else:
                return f"❌ Unknown Slack action: {action}"

    except SlackApiError as e:
        logger.error(f"Slack API Error in {action}: {e.response['error']}")
        return f"Error: {e.response['error']}\nError code: {e.response.get('error')}"
    except Exception as e:
        logger.error(f"Error executing {action}: {str(e)}", exc_info=True)
        return f"Error: {str(e)}"


@tool
def slack_send_message(channel: str, text: str, thread_ts: str = None) -> str:
    """Send a message to a Slack channel.

    This is a simplified interface for the most common Slack operation: sending messages.
    It wraps the Slack API's chat_postMessage method with a more direct interface,
    making it easier to send basic messages to channels or threads.

    ═══════════════════════════════════════════════════════════════════════════════
    CRITICAL FORMATTING RULES FOR SLACK MESSAGES:
    ═══════════════════════════════════════════════════════════════════════════════
    - ALWAYS use SINGLE asterisks (*text*) for bold text, NEVER double asterisks (**text**)
    - Double asterisks (**text**) will display literally in Slack and look broken
    - Do NOT use Markdown headers (### Header) - Slack will display them literally
    - For timestamps/time ranges: use *start_time - end_time* (single asterisks)
    - For bullet points: use • character or single asterisk (*)
    - For italic: use single underscores (_text_)
    - For code: use backticks (`code`)

    Examples of CORRECT formatting:
    - *0:00 - 0:54* (highest confidence match)
    - *Meeting Format Change*: The team decided...
    - • *Key Point*: Important information

    Examples of WRONG formatting (DO NOT USE):
    - **0:00 - 0:54** ← Will show as **0:00 - 0:54** literally
    - ### Key Decision ← Will show as ### Key Decision literally
    - **Meeting Format Change**: ← Will show as **Meeting Format Change**: literally

    Args:
        channel: The channel ID to send the message to. This should be the Slack
                channel ID (e.g., "C0123456789") rather than the channel name.
                To get a list of available channels and their IDs, use:
                slack(action="conversations_list")

        text: The message text to send. MUST use Slack 'mrkdwn' syntax:
              - Bold: *text* (single asterisks, NOT **text**)
              - Italic: _text_
              - Code: `code`
              - Strikethrough: ~text~
              - Bullet points: • or *
              - Do NOT use Markdown headers (###) or double asterisks (**)
              - Can include @mentions and channel links

        thread_ts: Optional thread timestamp to reply in a thread. When provided,
                  the message will be sent as a reply to the specified thread
                  rather than as a new message in the channel.

    Returns:
        str: Result message indicating success or failure, including the timestamp
             of the sent message on success.

    Examples:
    --------
    # Send a simple message to a channel
    result = slack_send_message(
        channel="C0123456789",
        text="Hello from Strands!"
    )

    # Reply to a thread
    result = slack_send_message(
        channel="C0123456789",
        text="This is a thread reply",
        thread_ts="1234567890.123456"
    )

    # Send a message with CORRECT formatting (single asterisks for bold)
    result = slack_send_message(
        channel="C0123456789",
        text="*Important*: Please review this _document_. Timestamps: *0:00 - 0:54*"
    )

    # WRONG - Do NOT use double asterisks or Markdown headers
    # result = slack_send_message(
    #     channel="C0123456789",
    #     text="**Important**: ### Header"  # This will display literally!
    # )

    Notes:
    -----
    - For more advanced message formatting using blocks, attachments, or other
      Slack features, use the main slack tool with the chat_postMessage action.
    - This function automatically ensures the Slack clients are initialized.
    - Channel IDs typically start with 'C', direct message IDs with 'D'.
    - REMEMBER: Single asterisks (*text*) for bold, NEVER double asterisks (**text**)
    """
    if client is None:
        success, error_message = initialize_slack_clients()
        if not success:
            return f"Error: {error_message}"

    try:
        params = {"channel": channel, "text": text}
        if thread_ts:
            params["thread_ts"] = thread_ts

        response = client.chat_postMessage(**params)
        if response and response.get("ts"):
            return f"Message sent successfully. Timestamp: {response['ts']}"
        else:
            return "Message sent but no timestamp received from Slack API"
    except Exception as e:
        error_msg = str(e) if e else "Unknown error occurred"
        return f"Error sending message: {error_msg}"
