<p align="center">
  <img src="assets/tl_logo_black.png" alt="TwelveLabs Logo" width="300"/>
</p>

<h1 align="center">🎬 Strands Agent - Video Intelligence Desktop Application</h1>

<p align="center">
  <strong>Cross-platform desktop application for intelligent video processing, indexing, and enterprise Slack communication</strong>
</p>

<p align="center">
  <a href="https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0">
    <img src="https://img.shields.io/badge/Download-v1.0.0-blue?style=for-the-badge&logo=github" alt="Download"/>
  </a>
  <a href="https://strandsagents.com/latest/documentation/docs/">
    <img src="https://img.shields.io/badge/Strands_Agent-Documentation-orange?style=for-the-badge" alt="Documentation"/>
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20MacOS-lightgrey?style=for-the-badge" alt="Platform"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AWS_re:Invent-2025-FF9900?style=for-the-badge&logo=amazon-aws" alt="AWS re:Invent 2025"/>
</p>

---

## 🎥 Video Demo

Watch the full demonstration of Strands Agent in action:

<p align="center">
  <a href="https://www.youtube.com/watch?v=cT1Shbx64eE">
    <img src="https://img.youtube.com/vi/cT1Shbx64eE/maxresdefault.jpg" alt="Video Demo" width="600"/>
  </a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=cT1Shbx64eE">▶️ Watch on YouTube</a>
</p>

---

## 🚀 Overview

**Strands Agent** is a cross-platform desktop application designed for **Windows** and **MacOS** that revolutionizes how enterprises interact with their video archives. Built to pre-process Zoom video recordings, this application leverages the power of **AWS Strands Agent** and **TwelveLabs' Pegasus and Marengo models** to index, summarize, and deeply understand video content.

The application proactively communicates insights and answers questions from your enterprise team directly through **Slack**, making video intelligence accessible to everyone in your organization.

> 🏆 **This software will be demonstrated at AWS re:Invent 2025**

---

## 📋 Quick Links

| Resource | Link |
|----------|------|
| 📥 **Download** | [GitHub Releases v1.0.0](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0) |
| 📖 **Strands Agent Docs** | [Documentation](https://strandsagents.com/latest/documentation/docs/) |
| 🏗️ **Technical Architecture** | [LucidChart Diagram](https://lucid.app/lucidchart/40b7aa79-6da6-4bed-bd63-5f34e3955685/edit?viewport_loc=539%2C-503%2C3799%2C1780%2C0_0&invitationId=inv_ba388ce0-6ad8-4f77-9ac1-c8a4edc405db) |
| 📄 **Architecture Document** | [Technical Explanation](https://docs.google.com/document/d/1jvfr4kleZ-ghZ7v8RwLEaRPO0W9GEiMHqToBy8Mr9y0/edit?usp=sharing) |
| 🎬 **Video Demo** | [YouTube](https://www.youtube.com/watch?v=cT1Shbx64eE) |

---

## ✨ Core Features

### 💬 Slack Integration

- **Slack DM Support** - Direct message the agent for one-on-one video intelligence queries
- **Slack Socket Mode** - Real-time listening to your team's messages and questions across channels
- **Proactive Communication** - The agent actively shares insights and answers questions without being prompted

### 🎞️ Video Processing

- **FFmpeg Local Pre-processing** - Efficient local video compression and format conversion before cloud upload
- **Zoom Archive Support** - Native support for processing Zoom meeting recordings and archives
- **Cross-platform Compatibility** - Seamless operation on both Windows and MacOS

### 🧠 TwelveLabs AI Integration

- **Pegasus Model** - Advanced video understanding and summarization capabilities
- **Marengo Model** - Powerful video search and semantic understanding
- **Video Indexing** - Automatic indexing of video content for instant retrieval
- **Natural Language Queries** - Ask questions about your videos in plain English

### ☁️ AWS Cloud Infrastructure

- **AgentCore Deployment** - Serverless agent deployment on AWS infrastructure
- **Strands Agent Framework** - Built on the powerful Strands Agent SDK for robust AI agent capabilities
- **TwelveLabs Tool Integration** - Custom tools for seamless TwelveLabs API interaction

---

## 🏗️ Architecture

### Backend Architecture

<p align="center">
  <img src="assets/Backend.png" alt="Backend Architecture" width="800"/>
</p>

The backend leverages AWS AgentCore for serverless deployment, integrating Strands Agent with custom TwelveLabs tools for video intelligence processing.

### Frontend Architecture

<p align="center">
  <img src="assets/Frontend.png" alt="Frontend Architecture" width="800"/>
</p>

Built with Electron for cross-platform desktop support, featuring a modern React-based UI for intuitive video management and agent interaction.

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Desktop Framework** | Electron |
| **Frontend** | React, Vite |
| **Agent Framework** | AWS Strands Agent |
| **Video AI** | TwelveLabs (Pegasus, Marengo) |
| **Video Processing** | FFmpeg |
| **Communication** | Slack SDK (Socket Mode) |
| **Cloud Deployment** | AWS AgentCore |
| **Language** | Python, JavaScript |

---

## 📦 Installation

### Download Pre-built Binaries

Download the latest release for your platform:

👉 **[Download v1.0.0](https://github.com/nathanchess/twelvelabs-agentcore-demo/releases/tag/v1.0.0)**

- **Windows**: `Strands Agent-1.0.0-setup.exe`
- **MacOS**: `Strands Agent-1.0.0.dmg`

### Build from Source

```bash
# Clone the repository
git clone https://github.com/nathanchess/twelvelabs-agentcore-demo.git
cd aws-strands

# Install Python dependencies
pip install -r requirements.txt

# Navigate to Electron app
cd electron-app

# Install Node dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

---

## ⚙️ Configuration

The application requires the following environment variables:

```env
# TwelveLabs Configuration
TWELVELABS_API_KEY=your_api_key

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

---

## 📚 Documentation

For comprehensive documentation on the Strands Agent framework:

📖 **[Strands Agent Documentation](https://strandsagents.com/latest/documentation/docs/)**

For detailed technical architecture explanation:

📄 **[Technical Architecture Document](https://docs.google.com/document/d/1jvfr4kleZ-ghZ7v8RwLEaRPO0W9GEiMHqToBy8Mr9y0/edit?usp=sharing)**

For visual architecture diagrams:

🏗️ **[LucidChart Technical Architecture](https://lucid.app/lucidchart/40b7aa79-6da6-4bed-bd63-5f34e3955685/edit?viewport_loc=539%2C-503%2C3799%2C1780%2C0_0&invitationId=inv_ba388ce0-6ad8-4f77-9ac1-c8a4edc405db)**

---

## 🎯 Use Cases

- **Meeting Summarization** - Automatically summarize Zoom meetings and share key points with your team
- **Video Search** - Find specific moments in hours of video content using natural language
- **Knowledge Management** - Index your video library for instant organizational knowledge retrieval
- **Team Q&A** - Let team members ask questions about video content directly in Slack
- **Proactive Insights** - Receive automatic notifications about important video content

---

## 🏆 AWS re:Invent 2025

This application will be featured at **AWS re:Invent 2025**, demonstrating the powerful combination of:

- AWS Strands Agent framework
- TwelveLabs video intelligence
- Enterprise Slack integration
- Cross-platform desktop deployment

---

## 📄 License

This project is developed for demonstration purposes at AWS re:Invent 2025.

---

<p align="center">
  Made with ❤️ using <strong>AWS Strands Agent</strong> and <strong>TwelveLabs</strong>
</p>
