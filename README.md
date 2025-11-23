# Strands Agent

**TwelveLabs Strands Agent - Video Analysis Desktop Application**

A powerful desktop application for analyzing Zoom video recordings using AI-powered video understanding. Streamline your meeting analysis workflow with intelligent video indexing, semantic search, and conversational AI assistance.

---

## 📋 Table of Contents

- [Features](#features)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Support](#support)
- [License](#license)

---

## ✨ Features

### 🎥 Video Management
- **Automatic Video Discovery**: Automatically scans your Zoom recordings folder (`Documents/Zoom/`)
- **Video Indexing**: Upload videos to TwelveLabs for AI-powered analysis
- **Thumbnail Generation**: Automatic thumbnail generation for quick video preview
- **Video Library**: Organized view of all your video recordings with metadata

### 🤖 AI-Powered Analysis
- **Conversational Agent**: Chat with an AI agent about your video content
- **Semantic Video Search**: Find specific moments in videos using natural language queries
- **Video Q&A**: Ask questions about video content and get intelligent answers
- **Meeting Summaries**: Extract key points, decisions, and action items from meetings

### 💬 Slack Integration
- **Auto-Reply**: Automatically respond to Slack messages with video analysis
- **Real-time Processing**: Process Slack events in real-time using Socket Mode
- **Channel Management**: Send messages to specific Slack channels or users
- **Event History**: Access recent Slack events for context

### 🔧 Advanced Capabilities
- **Multi-Modal Understanding**: Analyzes both visual and audio content
- **AWS Bedrock Integration**: Powered by AWS Bedrock AgentCore for enterprise-grade AI
- **Streaming Responses**: Real-time streaming of AI responses
- **Session Management**: Persistent conversation sessions across app restarts

---

## 💻 System Requirements

### Windows
- **Operating System**: Windows 10 or Windows 11
- **Architecture**: 64-bit (x64) or 32-bit (x86)
- **Disk Space**: ~300 MB for installation
- **RAM**: 4 GB minimum (8 GB recommended)
- **Internet Connection**: Required for API access and video indexing

### macOS (Coming Soon)
- macOS 11.0 (Big Sur) or later
- Apple Silicon (M1/M2/M3) or Intel processor
- ~300 MB disk space
- 4 GB RAM minimum

---

## 📦 Installation

### Windows Installation

#### Method 1: Standard Installation (Recommended)

1. **Download the Installer**
   - Download `Strands Agent-1.0.0-setup.exe` from the distribution source
   - File size: ~150-200 MB

2. **Run the Installer**
   - Double-click `Strands Agent-1.0.0-setup.exe`
   - If Windows SmartScreen appears, click "More info" → "Run anyway"
     - *Note: This warning may appear if the app is not code-signed. The app is safe to install.*

3. **Follow the Installation Wizard**
   - Choose installation directory (default: `C:\Users\<YourUsername>\AppData\Local\Programs\strands-agent`)
   - Select whether to create desktop shortcut (recommended)
   - Click "Install"

4. **Launch the Application**
   - The app will launch automatically after installation
   - Or find "Strands Agent" in the Start menu
   - Or double-click the desktop shortcut (if created)

#### Method 2: Portable Installation

If you prefer a portable installation:

1. Extract the `win-unpacked` folder to your desired location
2. Run `strands-agent.exe` directly from the folder
3. No installation required - fully portable

#### Verification

After installation, verify the app works:
- ✅ App launches without errors
- ✅ Video Library page loads
- ✅ Can navigate between pages
- ✅ Account Information page accessible

---

## 🚀 Getting Started

### First-Time Setup

1. **Configure API Keys**
   - Click "Account Information" in the sidebar
   - Enter your **TwelveLabs API Key**
     - Get your API key from [TwelveLabs Dashboard](https://twelvelabs.io)
   - Optionally enter **Slack Bot Token** and **Slack App Token** for Slack integration
   - Click "Save"

2. **Prepare Your Videos**
   - Ensure your Zoom recordings are in: `Documents/Zoom/`
   - The app automatically scans this folder on startup
   - Videos should be in `.mp4` format

3. **Index Your First Video**
   - Go to "Video Library"
   - Click on a video card
   - Click "Index Video" to upload to TwelveLabs
   - Wait for indexing to complete (progress shown in UI)

4. **Start Chatting**
   - After indexing, click "Agent Chat" on the video page
   - Ask questions about the video content
   - Example: "What are the main topics discussed in this meeting?"

---

## ⚙️ Configuration

### API Keys

#### TwelveLabs API Key (Required)
- **Purpose**: Video indexing and analysis
- **Where to get**: [TwelveLabs Dashboard](https://twelvelabs.io)
- **Storage**: Stored locally in browser localStorage (encrypted)

#### Slack Tokens (Optional)
- **Slack Bot Token** (`xoxb-...`): Required for sending messages
- **Slack App Token** (`xapp-...`): Required for Socket Mode (real-time events)
- **Where to get**: [Slack API Dashboard](https://api.slack.com/apps)
- **Required Scopes**:
  - `chat:write`
  - `reactions:write`
  - `channels:history`
  - `app_mentions:read`
  - `channels:read`

#### AWS Credentials (Optional)
- The app uses AWS Bedrock AgentCore for AI capabilities
- Credentials are automatically detected from:
  - AWS credentials file (`~/.aws/credentials`)
  - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - IAM roles (if running on EC2)

### Video Storage

- **Default Location**: `Documents/Zoom/`
- **Supported Formats**: `.mp4` (MPEG-4)
- **Thumbnails**: Stored in `%TEMP%\tl-video-agent-session\`
- **Video Map**: Stored in `%TEMP%\tl-video-agent-session\video-map.json`

---

## 📖 Usage Guide

### Video Library

The Video Library shows all videos found in your Zoom folder:

- **View Videos**: Browse thumbnails and metadata
- **Index Video**: Upload video to TwelveLabs for analysis
- **Delete Video**: Remove video from both local storage and TwelveLabs
- **Open Video**: Click a video card to view details and chat

### Agent Chat

Chat with the AI agent about your videos:

**Example Queries:**
- "Summarize the key points from this meeting"
- "What decisions were made?"
- "Find moments where [person] spoke"
- "What action items were discussed?"
- "Search for discussions about [topic]"

**Features:**
- Streaming responses (real-time)
- Conversation history
- Markdown formatting support
- Tool call visualization

### Video Analysis

After indexing a video, you can:

1. **Search Video Content**
   - Use natural language to find specific moments
   - Example: "Find when Eric Johnson discussed the engineering review"

2. **Ask Questions**
   - Get answers about video content
   - Example: "What was the main topic of discussion?"

3. **Get Summaries**
   - Extract meeting summaries
   - Identify key decisions and action items

### Slack Integration

If configured with Slack tokens:

- **Auto-Reply Mode**: Automatically responds to Slack messages
- **Real-time Processing**: Processes events via Socket Mode
- **Channel Messages**: Send analysis results to Slack channels
- **Thread Support**: Replies in threads for context

---

## 🔧 Troubleshooting

### Installation Issues

**Problem**: Windows SmartScreen warning
- **Solution**: Click "More info" → "Run anyway". The app is safe but may show this if not code-signed.

**Problem**: Installation fails
- **Solution**: 
  - Ensure you have admin rights
  - Check disk space (need ~300 MB)
  - Try running installer as administrator

**Problem**: App won't launch
- **Solution**:
  - Check Windows Event Viewer for errors
  - Try reinstalling
  - Check if antivirus is blocking the app

### Video Issues

**Problem**: Videos not showing in library
- **Solution**:
  - Ensure videos are in `Documents/Zoom/`
  - Check video format is `.mp4`
  - Click refresh or restart the app

**Problem**: Thumbnail not generating
- **Solution**:
  - FFmpeg is bundled with the app - no installation needed
  - Check console logs for FFmpeg errors
  - Ensure video file is not corrupted

**Problem**: Video indexing fails
- **Solution**:
  - Verify TwelveLabs API key is correct
  - Check internet connection
  - Ensure video file is accessible
  - Check TwelveLabs account quota

### Agent Chat Issues

**Problem**: Agent not responding
- **Solution**:
  - Check API keys are configured
  - Verify AWS credentials (if using Bedrock)
  - Check internet connection
  - Review console logs for errors

**Problem**: Responses are slow
- **Solution**:
  - Video indexing may take time (depends on video length)
  - Large videos take longer to process
  - Check network connection speed

### Slack Integration Issues

**Problem**: Slack auto-reply not working
- **Solution**:
  - Verify Slack tokens are correct
  - Check Socket Mode is enabled in Slack app settings
  - Ensure required scopes are granted
  - Check `STRANDS_SLACK_AUTO_REPLY` is set to "true"

**Problem**: Messages not sending
- **Solution**:
  - Verify bot token has `chat:write` scope
  - Check channel ID is correct
  - Ensure bot is added to the channel

### Performance Issues

**Problem**: App is slow
- **Solution**:
  - Close other applications
  - Check available RAM
  - Large video files may slow indexing
  - Consider indexing videos one at a time

**Problem**: High memory usage
- **Solution**:
  - Normal for video processing applications
  - Close and reopen app periodically
  - Process videos in smaller batches

---

## 📝 Logs and Debugging

### Log File Location

- **Windows**: `%LOCALAPPDATA%\strands-agent\logs\prod.txt`
- **Path Example**: `C:\Users\<YourUsername>\AppData\Local\strands-agent\logs\prod.txt`

### Console Logs

- Open Developer Tools: `Ctrl+Shift+I` (or `F12`)
- Check Console tab for errors
- Check Network tab for API calls

### Common Log Messages

- `FFmpeg initialized successfully`: FFmpeg is working
- `Agent session created`: Bedrock connection established
- `Video indexed successfully`: Video uploaded to TwelveLabs
- `Slack Socket Mode started`: Slack integration active

---

## 🆘 Support

### Getting Help

- **Documentation**: Check this README first
- **Issues**: Report bugs or feature requests via your distribution platform
- **TwelveLabs Support**: [support@twelvelabs.io](mailto:support@twelvelabs.io)
- **AWS Bedrock**: [AWS Support Center](https://aws.amazon.com/support/)

### Reporting Issues

When reporting issues, please include:
- Operating system and version
- App version (shown in bottom-right corner)
- Steps to reproduce
- Error messages (from logs)
- Screenshots (if applicable)

---

## 🔐 Security & Privacy

### Data Storage
- API keys stored locally in browser localStorage
- Videos stored locally on your machine
- Video metadata cached locally
- No data sent to third parties except:
  - TwelveLabs (for video analysis)
  - AWS Bedrock (for AI processing)
  - Slack (if configured, for messaging)

### API Keys
- Never shared with third parties
- Stored encrypted in localStorage
- Can be cleared via Account Information page

### Video Privacy
- Videos are uploaded to TwelveLabs for analysis
- Review TwelveLabs privacy policy
- Videos can be deleted from both local and cloud storage

---

## 🗺️ Roadmap

### Upcoming Features
- ✅ Windows support (Current)
- 🔄 macOS support (Coming Soon)
- 🔄 Linux support (Planned)
- 🔄 Auto-updates
- 🔄 Batch video processing
- 🔄 Export meeting summaries
- 🔄 Custom video folders
- 🔄 Advanced search filters

---

## 📄 License

Copyright © 2025 TwelveLabs. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.

---

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Powered by [TwelveLabs](https://twelvelabs.io) for video understanding
- AI capabilities via [AWS Bedrock](https://aws.amazon.com/bedrock/)
- UI built with [React](https://react.dev/) and [Tailwind CSS](https://tailwindcss.com/)

---

## 📞 Contact

**TwelveLabs**
- Website: [https://twelvelabs.io](https://twelvelabs.io)
- Email: [support@twelvelabs.io](mailto:support@twelvelabs.io)

---

**Version**: 1.0.0  
**Last Updated**: January 2025

