TOOL_SPEC = {
    "name": "fetch_video_url",
    "description": """Generates a video clip given time stamp and TwelveLabs video ID. Always attempts to convert HLS to MP4 format for Slack attachment. Returns MP4 file path or MP4 URL if available directly from TwelveLabs. Should be used to fetch the video clip when Slack bot is searching for content in video. 
    Returns the MP4 file path that can be uploaded to Slack using files_upload_v2 action.
    """,
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "video_id": {
                    "type": "string",
                    "description": "The TwelveLabs video ID."
                },
                "index_id": {
                    "type": "string",
                    "description": "The TwelveLabs index ID."
                }
            },
            "required": ["video_id", "index_id"]
        }
    }
}

import os
import subprocess
import tempfile

from typing import Any, Optional, Tuple
from twelvelabs import TwelveLabs
from strands.types.tools import ToolResult, ToolUse

def _check_ffmpeg_available() -> bool:
    """Check if ffmpeg is available in the system."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _convert_hls_to_mp4(hls_url: str, output_path: str) -> Tuple[bool, Optional[str]]:
    """
    Convert HLS stream to MP4 using ffmpeg.
    
    Args:
        hls_url: URL to the HLS stream
        output_path: Path where the MP4 file should be saved
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    try:
        # Use ffmpeg to convert HLS to MP4
        # -i: input URL
        # -c copy: copy codecs (fast, no re-encoding)
        # -bsf:a aac_adtstoasc: fix AAC audio in HLS
        # -y: overwrite output file
        cmd = [
            "ffmpeg",
            "-i", hls_url,
            "-c", "copy",
            "-bsf:a", "aac_adtstoasc",
            "-y",
            output_path
        ]
        
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0 and os.path.exists(output_path):
            return True, None
        else:
            error_msg = result.stderr.decode('utf-8', errors='ignore') if result.stderr else "Unknown ffmpeg error"
            return False, f"ffmpeg conversion failed: {error_msg}"
    except subprocess.TimeoutExpired:
        return False, "ffmpeg conversion timed out after 5 minutes"
    except FileNotFoundError:
        return False, "ffmpeg not found in system PATH"
    except Exception as e:
        return False, f"ffmpeg conversion error: {str(e)}"


def _check_for_mp4_url(video_info) -> Optional[str]:
    """
    Check if TwelveLabs API provides MP4 URL directly.
    
    Args:
        video_info: Video info object from TwelveLabs API
        
    Returns:
        MP4 URL if available, None otherwise
    """
    # Check various possible attributes for MP4 URL
    if hasattr(video_info, 'mp4') and video_info.mp4:
        if hasattr(video_info.mp4, 'video_url'):
            return video_info.mp4.video_url
        elif isinstance(video_info.mp4, str):
            return video_info.mp4
    
    # Check if there's a direct video URL that might be MP4
    if hasattr(video_info, 'video_url'):
        url = video_info.video_url
        if url and (url.endswith('.mp4') or 'mp4' in url.lower()):
            return url
    
    # Check metadata or other attributes
    if hasattr(video_info, 'metadata'):
        metadata = video_info.metadata
        if isinstance(metadata, dict):
            mp4_url = metadata.get('mp4_url') or metadata.get('mp4Url') or metadata.get('video_mp4_url')
            if mp4_url:
                return mp4_url
    
    return None


def fetch_video_url(tool: ToolUse, **kwargs: Any) -> ToolResult:
    """
    Generates a video clip and always attempts to convert to MP4 format for Slack attachment.
    Returns MP4 file path or MP4 URL if available directly from TwelveLabs.

    Args:
        tool: Tool use information containing input parameters:
            index_id: The TwelveLabs index ID.
            video_id: The TwelveLabs video ID.
        **kwargs: Additional keyword arguments

    Returns:
        ToolResult: Dictionary containing status and MP4 file path or error:
        {
            "toolUseId": "unique_id",
            "status": "success|error",
            "content": [{"text": "MP4 file path or error message"}]
        }
    """
    tool_use_id = tool["toolUseId"]
    tool_input = tool["input"]
    
    mp4_file_path = None
    
    try:
        # Extract parameters
        video_id = tool_input["video_id"]
        index_id = tool_input.get("index_id") or os.getenv("TWELVELABS_MARENGO_INDEX_ID") or os.getenv("TWELVELABS_PEGASUS_INDEX_ID")
        
        if not index_id:
            raise ValueError(
                "No index_id provided and TWELVELABS_MARENGO_INDEX_ID or TWELVELABS_PEGASUS_INDEX_ID environment variable not set. "
                "Please provide an index_id or set the environment variable."
            )
        
        # Get API key
        api_key = os.getenv("TWELVELABS_API_KEY")
        if not api_key:
            raise ValueError(
                "TWELVELABS_API_KEY environment variable not set. Please set it to your TwelveLabs API key."
            )

        # Initialize TwelveLabs client and retrieve video info
        client = TwelveLabs(api_key=api_key)
        video_info = client.indexes.videos.retrieve(index_id=index_id, video_id=video_id)

        if not video_info:
            raise ValueError("Video not found.")

        # First, check if MP4 URL is available directly from TwelveLabs
        mp4_url = _check_for_mp4_url(video_info)
        if mp4_url:
            return ToolResult(
                toolUseId=tool_use_id,
                status="success",
                content=[{"text": f"MP4 video URL: {mp4_url}\nYou can download this URL and upload to Slack using files_upload_v2 action."}]
            )

        # Get HLS URL for conversion
        if not hasattr(video_info, 'hls') or not video_info.hls:
            raise ValueError("HLS URL not available and no MP4 URL found. Cannot generate MP4 file.")
        
        hls_url = video_info.hls.video_url if hasattr(video_info.hls, 'video_url') else str(video_info.hls)
        
        # Always attempt to convert HLS to MP4
        # Check if ffmpeg is available
        if not _check_ffmpeg_available():
            raise ValueError(
                "ffmpeg is not available in the system. MP4 conversion requires ffmpeg to be installed. "
                "Please ensure ffmpeg is available in your AWS Agentcore environment (e.g., via Lambda layer)."
            )
        
        # Create temporary file for MP4 output
        temp_dir = tempfile.gettempdir()
        mp4_file_path = os.path.join(temp_dir, f"video_{video_id}.mp4")
        
        # Attempt conversion
        conversion_success, error_message = _convert_hls_to_mp4(hls_url, mp4_file_path)
        
        if conversion_success:
            file_size = os.path.getsize(mp4_file_path)
            file_size_mb = file_size / (1024 * 1024)
            return ToolResult(
                toolUseId=tool_use_id,
                status="success",
                content=[{"text": f"MP4 file created: {mp4_file_path}\nFile size: {file_size_mb:.2f} MB\nYou can now upload this file to Slack using files_upload_v2 action."}]
            )
        else:
            # Conversion failed - clean up and return error
            if mp4_file_path and os.path.exists(mp4_file_path):
                try:
                    os.remove(mp4_file_path)
                except:
                    pass
            
            raise ValueError(
                f"Failed to convert HLS to MP4. {error_message or 'Unknown conversion error'}"
            )

    except Exception as e:
        # Clean up MP4 file if it exists
        if mp4_file_path and os.path.exists(mp4_file_path):
            try:
                os.remove(mp4_file_path)
            except:
                pass
        
        return ToolResult(
            toolUseId=tool_use_id,
            status="error",
            content=[{"text": f"Error generating video clip: {str(e)}"}]
        )