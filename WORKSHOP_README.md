# Workshop: Editing the AgentCore

**Focus:** `app.py` and `custom_tools/` — attendees run the AgentCore script, not the full packaged app, to save time. Optional: use the Electron dev shell for hot-reload.

---

## Goals

1. Show how quickly you can change **persona** and **task** via prompt engineering on the agent.
2. Show how **TwelveLabs** fits beside **other Strands tools** (`strands_tools.environment`, custom tools).

---

## Prerequisites

- Python env with project dependencies (`requirements.txt`).
- `.env` with `TWELVELABS_API_KEY` and index-related variables as in the main project README.
- For UI hot-reload: Node.js, then from `electron-app/`: `npm install` once, then `npm run dev`.

---

## Activity A — Prompt engineering and personality

1. Open **`app.py`** and find `AGENT_SYSTEM_PROMPT`.
2. Change the persona and instructions — for example a **Strict Compliance Officer** who only answers in the context of policy risk, citations, and explicit disclaimers.
3. Open **`custom_tools/`** and pick a TwelveLabs module (e.g. **`chat_video.py`**, **`search_video.py`**).
4. Point out **`TOOL_SPEC`**: the `description` field is what the model sees — small edits change how the agent invokes the API.
5. Optional: in **`chat_video.py`**, note the **`client.analyze(..., prompt=prompt, ...)`** call — that is the Pegasus prompt sent to TwelveLabs for video Q&A.

**Test**

- Run the AgentCore app as your project expects (e.g. `python app.py` or your documented AgentCore command).
- Or run **`npm run dev`** from **`electron-app/`** so the desktop UI hot-reloads while you edit `app.py` and tools; send prompts and confirm new behavior.

---

## Activity B — Strands ecosystem

1. In **`app.py`**, show **`get_tools()`**: `environment` from `strands_tools` sits alongside **`chat_video`**, **`search_video`**, **`get_video_index`**, **`fetch_video_url`**, and the workshop snippet **`compliance_checklist`**.
2. Open **`custom_tools/compliance_checklist.py`**: a **non-TwelveLabs** tool that returns a structured checklist — illustrates composing custom logic with video tools.
3. To **remove** the extra tool for a slimmer demo, delete `compliance_checklist` from the import line and from the list returned by `get_tools()`.
4. To **add your own** tool, copy `compliance_checklist.py`, rename the module and `TOOL_SPEC["name"]`, implement your handler, then import and append it in `get_tools()`.

**Snippet (alternative compliance helper)**

If you prefer a standalone paste-in, create `custom_tools/my_compliance_tool.py` using the same pattern as `compliance_checklist.py` (`TOOL_SPEC` + one handler returning `ToolResult`), then add:

```python
from custom_tools import my_compliance_tool
```

and append `my_compliance_tool` to the list in `get_tools()`.

**Test**

- Same as Activity A: AgentCore run or `npm run dev` and verify the agent can call both TwelveLabs tools and `compliance_checklist` in one conversation.

---

## Timing (suggested)

| Segment | Minutes | Content |
|--------|---------|---------|
| Intro | 2 | `app.py` = persona; `custom_tools` = tools + API prompts |
| Activity A | 8–12 | Edit `AGENT_SYSTEM_PROMPT` + peek at `TOOL_SPEC` / Pegasus prompt |
| Activity B | 5–8 | `get_tools()` map; `compliance_checklist`; optional custom paste-in |
| Q&A | 2–3 | Env vars, indexes, `npm run dev` vs script-only |

---

## Files reference (workshop)

| File | Role |
|------|------|
| `app.py` | `AGENT_SYSTEM_PROMPT`, `get_tools()`, AgentCore `@app.entrypoint` |
| `custom_tools/chat_video.py` | TwelveLabs Pegasus / `analyze` prompt |
| `custom_tools/search_video.py` | Marengo semantic search |
| `custom_tools/get_video_index.py` | Index ensure / env setup |
| `custom_tools/compliance_checklist.py` | Example non-API Strands tool (Activity B) |

This document is **only** for the workshop; the repository’s main **`README.md`** remains the canonical project documentation.
