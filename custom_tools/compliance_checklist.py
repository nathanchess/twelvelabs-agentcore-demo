"""
Workshop snippet (Activity B): a small custom Strands tool that does not call external APIs.

Pair with TwelveLabs tools: use search_video / chat_video for evidence, then this tool to
frame findings for audits or policy review.
"""

from typing import Any

from strands.types.tools import ToolResult, ToolUse

TOOL_SPEC = {
    "name": "compliance_checklist",
    "description": (
        "Returns a structured compliance review checklist for video analysis. "
        "Use alongside search_video or chat_video to organize findings for policy, safety, or disclosure review."
    ),
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Short label for the review context (e.g. 'Q4 town hall').",
                },
            },
            "required": [],
        }
    },
}


def compliance_checklist(tool: ToolUse, **kwargs: Any) -> ToolResult:
    tool_use_id = tool["toolUseId"]
    tool_input = tool.get("input") or {}
    topic = (tool_input.get("topic") or "this content").strip() or "this content"

    text = f"""# Compliance review checklist — {topic}

1. **Policy & commitments** — Were stated policies or commitments accurate and complete?
2. **Risk language** — Flag speculative claims, guarantees, or financial advice without disclaimers.
3. **PII & confidentiality** — Note personal data or unreleased business details shown or discussed.
4. **Record retention** — Confirm retention handling per your organization’s policy.

**Strands ecosystem:** Use `get_video_index` first if indexes are unset, `search_video` to find moments, `chat_video` for targeted Q&A, then map answers to the sections above.
"""
    return {
        "toolUseId": tool_use_id,
        "status": "success",
        "content": [{"text": text}],
    }
