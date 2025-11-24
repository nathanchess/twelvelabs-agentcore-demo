# TwelveLabs × AWS Strands Agent Demo

<p align="center">
  <img src="assets/tl_logo_black.png" alt="TwelveLabs Logo" width="220">
</p>

Cross-platform desktop application that fuses TwelveLabs’ video intelligence with AWS Strands Agent tooling to turn static video archives into interactive Slack-native insights. Built for the 2025 AWS re:Invent conference to showcase how MCP servers, AgentCore runtimes, and TwelveLabs models collaborate inside a single Electron experience.

---

## Quick Links
- Latest macOS & Windows builds (zip + installers): [Release v1.0.0](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0) [[1]](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0)
- Technical Architecture Diagram (LucidChart): [Strands Agent Integration](https://lucid.app/lucidchart/40b7aa79-6da6-4bed-bd63-5f34e3955685/edit?view_items=McO_sIZsgpDT%2CL_N_FOkbTwWR%2C1dO__CpjlG8n%2CceO_i_dsF7J2%2C5yO_-oCSiLhl%2C3~M_kWj3GR6q%2CfWO_ykzQ1eVH%2Cz-O_~5-stUaC%2CLWO_XsAfAyCf%2CdLO_lEZEZeQ5%2CyaO_BHhCXflV%2CpcO_nBJHo49W%2Cm-N_QkFpJf~N%2CMXO_Br0AepVd%2CHzO_5cd6CqNR%2CGXO_2nwaDfqQ%2CSXO_7rOd5mDQ%2CYXO_p~Hrg_Qt&page=0_0&invitationId=inv_ba388ce0-6ad8-4f77-9ac1-c8a4edc405db)
- Technical Architecture Briefing (Google Doc): [AWS re:Invent | Strands Agent TwelveLabs Integration](https://docs.google.com/document/d/1jvfr4kleZ-ghZ7v8RwLEaRPO0W9GEiMHqToBy8Mr9y0/edit?usp=sharing)
- Strands Agent Reference: [strands-agents/tools](https://github.com/strands-agents/tools)

---

## Architecture at a Glance

![Full Architecture Overview](assets/FullArchitecture.png)

---

## Why a Desktop Application?
- **Instant local video discovery** – Electron + Node recursively scan Zoom archives, generate FFmpeg thumbnails, and stage uploads without shipping sensitive media to the cloud.
- **Secure by design** – Only TwelveLabs video IDs traverse the network; original media remains on-device. AWS AgentCore PII redaction and TwelveLabs governance policies ensure enterprise compliance.
- **Agent-native UX** – The Strands Agent chat interface streams markdown-rendered responses, mirroring the live agent loop so presenters can narrate each tool call in real time.

---

## Features
- **Video ingestion pipeline** – FFmpeg preprocessing, thumbnailing, and upload orchestration directly from the desktop client.
- **TwelveLabs intelligence** – Marengo for semantic search, Pegasus for conversational reasoning across indexed recordings.
- **Slack connectivity** – Socket Mode listener plus message dispatch tools for @mentions, channel replies, and DM workflows.
- **AWS AgentCore runtime sessions** – Deterministic agent loops with CloudWatch observability for every MCP/tool invocation.
- **Environment management** – Secure storage and validation for TwelveLabs API keys, Slack Bot/App tokens, and AgentCore credentials.
- **CI/CD** – GitHub Actions builds notarized macOS `.dmg`/`.zip` artifacts and signed Windows installers on every tagged release.

---

## Prerequisites
| Requirement | Why it matters |
|-------------|----------------|
| TwelveLabs API Key | Authenticates Marengo/Pegasus search, chat, and index management. |
| Slack Bot Token & Slack App-Level Token | Enables Socket Mode ingestion plus message send APIs. |
| AWS credentials with AgentCore access | Launches runtime sessions, subscribes to logs, and invokes agent endpoints. |
| FFmpeg (bundled) | Generates thumbnails and supports HLS → MP4 conversions for video snippets. |
| Zoom/meeting archive directory | Source media for preprocessing and indexing. |

Optional but recommended: AWS CloudWatch viewer, MCP-compatible tools you intend to showcase, and LucidChart access for the official diagram.

---

## Frontend Overview
- **Stack**: ElectronJS, NodeJS, React, FFmpeg, Vite, GitHub Actions.
- **Modules**:
  - *Local Archive Preprocessor* – Recursively scans user-selected folders, queues FFmpeg thumbnail jobs, and surfaces searchable metadata.
  - *Credential Manager* – UI surface in `AccountInformation.jsx` to capture TwelveLabs, Slack, and AgentCore secrets with inline validation.
  - *Agent Chat Surface* – `AgentChat.jsx` streams AgentCore responses, converts markdown → HTML, and renders Slack-style message cards.
  - *Video Dashboard* – `VideoDashboard.jsx` marries thumbnails, gist summaries, and playback controls with upload/index buttons.
- **Packaging**: GitHub Actions → `electron-builder` produce platform-specific installers stored under GitHub Releases.

---

## Backend Overview
- **Stack**: AWS AgentCore, Strands Agent, TwelveLabs SDK, FFmpeg, Slack API, AWS CloudWatch.
- **Agent Loop**:
  1. **Prompt decomposition** – Strands Agent plans tool usage (or pure LLM response if no tools needed).
  2. **Tool execution** – Toolkit includes Slack Socket Mode, Slack Send Message, TwelveLabs search/chat, FFmpeg HLS conversion, environment variable mutators, and custom MCP servers.
  3. **Observation & response** – Intermediate results logged to CloudWatch, final markdown streamed to the Electron client.
- **Observability**: CloudWatch dashboards capture each reasoning step for live demos, debugging, and prompt iteration.

---

## Installation & Run Instructions

### Option 1: Download the Release Build
1. Grab the latest macOS `.dmg`/`.zip` or Windows `.exe` from [Release v1.0.0](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0) [[1]](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0).
2. Install (macOS) or run the signed installer (Windows).
3. Launch the **TwelveLabs Strands Agent** app and proceed to onboarding.

### Option 2: Run from Source
```bash
git clone https://github.com/nathanchess/twelvelabs-agentcore-demo.git
cd twelvelabs-agentcore-demo/electron-app
npm install
npm run dev        # launches Electron with live reload
npm run build      # produces production binaries via electron-builder
```
For backend utilities, create a Python virtual environment, install `requirements.txt`, and run scripts under `test/` for prompt or session exercises.

---

## First-Run Experience
1. **Set credentials** – Open the sidebar → *Account Settings* and paste TwelveLabs API Key, Slack Bot Token, Slack App Token, and AgentCore endpoint credentials.
2. **Choose archive folder** – Point the preprocessor at your Zoom (or other) meeting directory; thumbnails populate automatically.
3. **Index videos** – Select videos → *Upload to TwelveLabs*; monitor status until each asset shows a Marengo/Pegasus-ready badge.
4. **Start Agent session** – Open the chat panel, @mention the TwelveLabs Strands Agent, and type a natural-language request (e.g., “Summarize last quarter’s roadmap call”).
5. **Review Slack output** – The agent can respond in-app and simultaneously push formatted messages or attachments back into Slack channels/DMs.

---

## Additional Notes
- **Custom tools** under `custom_tools/` expose helper actions (Slack channel discovery, video fetching, TwelveLabs index management) that can be imported as MCP resources.
- **Dockerization** is available for backend testers who prefer containerized FFmpeg and AgentCore clients—mirror the environment variables from the desktop UI.
- **Future enhancements**: advanced timeline scrubbing, auto-tagging with Marengo embeddings, and multi-tenant vault integration for enterprise key management.

---

## License
Distributed for demo and conference enablement. See repository for license details.

