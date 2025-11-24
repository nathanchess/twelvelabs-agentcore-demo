import { app, shell, BrowserWindow, ipcMain, protocol, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TwelveLabs } from 'twelvelabs-js'
import { BedrockAgentRuntimeClient, CreateSessionCommand, EndSessionCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore'

import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import fsp from 'fs/promises'
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Logging setup for production
let logFileStream = null;
let LOG_FILE_PATH = null;

function setupLogging() {
  try {
    // Use Local AppData instead of Roaming for easier access
    // Windows: C:\Users\<username>\AppData\Local\strands-agent\logs
    // macOS: ~/Library/Application Support/strands-agent/logs
    // Linux: ~/.config/strands-agent/logs
    let logsDir;
    if (process.platform === 'win32') {
      // Use Local AppData on Windows
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      logsDir = path.join(localAppData, 'strands-agent', 'logs');
    } else {
      // Use userData for macOS/Linux
      logsDir = path.join(app.getPath('userData'), 'logs');
    }
    
    LOG_FILE_PATH = path.join(logsDir, 'strands-agent.log');
    
    console.log('Log file will be at:', LOG_FILE_PATH);
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('Created logs directory:', logsDir);
    }
    
    // Create write stream for log file
    logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });
    
    // Override console methods to also write to file
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const writeToFile = (level, ...args) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      const logLine = `[${timestamp}] [${level}] ${message}\n`;
      
      if (logFileStream) {
        logFileStream.write(logLine);
      }
      
      // Also output to original console
      if (level === 'ERROR') {
        originalError(...args);
      } else if (level === 'WARN') {
        originalWarn(...args);
      } else {
        originalLog(...args);
      }
    };
    
    console.log = (...args) => writeToFile('LOG', ...args);
    console.error = (...args) => writeToFile('ERROR', ...args);
    console.warn = (...args) => writeToFile('WARN', ...args);
    
    console.log('Logging initialized. Log file:', LOG_FILE_PATH);
  } catch (error) {
    // If logging setup fails, continue without file logging
    console.error('Failed to setup file logging:', error);
  }
}

// App Constants - Initialize on app ready
let sessionTempDir = null;
let videoMapPath = null;

function initializeAppPaths() {
  if (!sessionTempDir) {
    try {
      const tempPath = app.getPath('temp');
      console.log('Temp path:', tempPath);
      
      sessionTempDir = path.join(tempPath, 'tl-video-agent-session');
      videoMapPath = path.join(sessionTempDir, 'video-map.json');
      
      console.log('Session temp dir:', sessionTempDir);
      console.log('Video map path:', videoMapPath);
      
      // Ensure directory exists
      if (!fs.existsSync(sessionTempDir)) {
        try {
          fs.mkdirSync(sessionTempDir, { recursive: true });
          console.log('✓ Created session temp directory:', sessionTempDir);
        } catch (mkdirError) {
          console.error('✗ Failed to create session temp directory:', mkdirError);
          console.error('Error details:', {
            code: mkdirError.code,
            errno: mkdirError.errno,
            path: mkdirError.path,
            syscall: mkdirError.syscall
          });
          throw mkdirError;
        }
      } else {
        console.log('✓ Session temp directory already exists:', sessionTempDir);
      }
      
      // Ensure video map file exists
      if (!fs.existsSync(videoMapPath)) {
        try {
          fs.writeFileSync(videoMapPath, '{}', 'utf8');
          console.log('✓ Created video map file:', videoMapPath);
        } catch (writeError) {
          console.error('✗ Failed to create video map file:', writeError);
          console.error('Error details:', {
            code: writeError.code,
            errno: writeError.errno,
            path: writeError.path,
            syscall: writeError.syscall
          });
          throw writeError;
        }
      } else {
        console.log('✓ Video map file already exists:', videoMapPath);
      }
      
      // Verify both exist after creation
      const dirExists = fs.existsSync(sessionTempDir);
      const fileExists = fs.existsSync(videoMapPath);
      console.log('Verification - Directory exists:', dirExists, 'File exists:', fileExists);
      
      // Test write permissions
      try {
        const testFile = path.join(sessionTempDir, '.write-test');
        fs.writeFileSync(testFile, 'test', 'utf8');
        fs.unlinkSync(testFile);
        console.log('✓ Write permissions verified');
      } catch (writeTestError) {
        console.error('✗ Write permission test failed:', writeTestError);
        throw new Error(`No write permissions to temp directory: ${writeTestError.message}`);
      }
      
      if (!dirExists || !fileExists) {
        throw new Error(`Failed to verify paths exist. Dir: ${dirExists}, File: ${fileExists}`);
      }
      
    } catch (error) {
      console.error('✗ CRITICAL: Failed to initialize app paths:', error);
      console.error('Error stack:', error.stack);
      // Don't throw - let the app continue but log the error
      // The app will try to create paths when needed
    }
  }
  
  return { sessionTempDir, videoMapPath };
}

// In-memory session storage (cleared when app closes)
let agentSessionId = null;

// Create Bedrock Agent Runtime client for session management
function createBedrockRuntimeClient() {
  const config = {
    region: 'us-east-1',
  };
  
  // Only add credentials if both are provided
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // Otherwise, AWS SDK will use default credential provider chain
  
  return new BedrockAgentRuntimeClient(config);
}

// Create Bedrock Agent Core client for invoking agents
function createBedrockAgentCoreClient() {
  const config = {
    region: 'us-east-1',
  };
  
  // Only add credentials if both are provided
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // Otherwise, AWS SDK will use default credential provider chain
  
  return new BedrockAgentCoreClient(config);
}

let runtimeClient = null; // For session management
let agentCoreClient = null; // For agent invocation

// FFmpeg setup - handle both dev and production paths
let ffmpegPath = null;
let ffmpeg = null;

function findFFmpegPath() {
  const defaultPath = require('@ffmpeg-installer/ffmpeg').path;
  console.log('FFmpeg default path from @ffmpeg-installer:', defaultPath);
  
  // Check if default path exists and is executable (not in ASAR)
  if (fs.existsSync(defaultPath) && !defaultPath.includes('app.asar')) {
    return defaultPath;
  }
  
  // In production builds, FFmpeg must be in app.asar.unpacked
  // Try multiple possible locations
  const possiblePaths = [];
  
  if (process.platform === 'win32') {
    // Windows paths
    if (process.resourcesPath) {
      possiblePaths.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-ia32', 'ffmpeg.exe')
      );
    }
    // Also try relative to current file location
    possiblePaths.push(
      path.join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
      path.join(__dirname, '..', '..', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe')
    );
  } else if (process.platform === 'darwin') {
    // macOS paths
    if (process.resourcesPath) {
      possiblePaths.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'darwin-x64', 'ffmpeg'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg')
      );
    }
  } else {
    // Linux paths
    if (process.resourcesPath) {
      possiblePaths.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg')
      );
    }
  }
  
  // Try each path
  for (const altPath of possiblePaths) {
    if (fs.existsSync(altPath)) {
      console.log('Found FFmpeg at:', altPath);
      return altPath;
    }
  }
  
  return null;
}

try {
  ffmpegPath = findFFmpegPath();
  
  if (!ffmpegPath) {
    console.error('FFmpeg not found in any expected location!');
    console.error('Default path was:', require('@ffmpeg-installer/ffmpeg').path);
    console.error('Resources path:', process.resourcesPath);
    console.error('__dirname:', __dirname);
    throw new Error('FFmpeg binary not found');
  }
  
  // Verify it's executable (not in ASAR)
  if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    throw new Error(`FFmpeg is inside ASAR archive (read-only): ${ffmpegPath}. It must be in app.asar.unpacked`);
  }
  
  ffmpeg = require('fluent-ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('FFmpeg initialized successfully at:', ffmpegPath);
} catch (error) {
  console.error('Failed to initialize FFmpeg:', error);
  // FFmpeg will be null, thumbnail generation will fail gracefully
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function _generateVideoFileHash(filePath) {
  const videoFileStream = fs.createReadStream(filePath);
  const videoHash = crypto.createHash('sha256');

  return new Promise((resolve, reject) => {
    videoFileStream.on('data', (chunk) => videoHash.update(chunk));
    videoFileStream.on('end', () => { resolve(videoHash.digest('hex')) });
    videoFileStream.on('error', (err) => reject(err));
  });
}

async function _check_index(apiKey) {

  const twelvelabsClient = new TwelveLabs({
    apiKey: apiKey
  });

  try {

    const indexPager = await twelvelabsClient.indexes.list();
    for await (const index of indexPager) {
      if (index.indexName === 'strands-dev') {
        return index;
      }
    }
    
    const index = await twelvelabsClient.indexes.create({
      indexName: 'strands-dev',
      models: [
        {
          modelName: "marengo2.7",
          modelOptions: ["visual", "audio"]
        },
        {
          modelName: "pegasus1.2",
          modelOptions: ["visual", "audio"]
        }
      ]
    })

    console.log('Index created:', index);

    return index;

  } catch (error) {
    console.error('Error checking index:', error);
    throw new Error('Failed to check index');
  }
}

async function _index_video(apiKey, index, filepath) {
  try {

    const twelvelabsClient = new TwelveLabs({
      apiKey: apiKey
    });
    const videoFileStream = fs.createReadStream(filepath);

    const indexTask = await twelvelabsClient.tasks.create({
      indexId: index.id,
      videoFile: videoFileStream,
      enableVideoStream: true,
    })

    const task = await twelvelabsClient.tasks.waitForDone(indexTask.id, {
      timeout: 3,
      callback: (task) => {
        console.log('Status: ' + task.status);
      }
    })

    if (task.status !== "ready") {
      throw new Error('Task failed to complete');
    }

    const videoTaskContent = await twelvelabsClient.tasks.retrieve(indexTask.id);

    if (!videoTaskContent || !videoTaskContent.hls || !videoTaskContent.hls.videoUrl || !videoTaskContent.videoId || !videoTaskContent.indexId || !videoTaskContent.createdAt) {
      throw new Error('Failed to retrieve video task content');
    }

    return {
      hlsUrl: videoTaskContent.hls.videoUrl,
      videoId: videoTaskContent.videoId,
      indexId: videoTaskContent.indexId,
      createdAt: videoTaskContent.createdAt,
    }

  } catch (error) {
    console.error('Error indexing video:', error);
    return null;
  }
}

async function _delete_hash(hash) {
  // Ensure paths are initialized
  if (!videoMapPath) initializeAppPaths();
  const videoMap = JSON.parse(await fsp.readFile(videoMapPath, 'utf8'));
  if (videoMap[hash]) {
    delete videoMap[hash];
    await fsp.writeFile(videoMapPath, JSON.stringify(videoMap, null, 2));
  }
}

async function _check_video_id(apiKey, videoId, indexId) {

  try {
    const twelveLabsClient = new TwelveLabs({
      apiKey: apiKey
    })
    const video = await twelveLabsClient.indexes.videos.retrieve(indexId, videoId)
    if (video.id) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}

async function _create_agent_session() {
  // Return existing session ID if available
  if (agentSessionId) {
    return agentSessionId;
  }

  try {
    // Lazy initialization of runtime client for session management
    if (!runtimeClient) {
      runtimeClient = createBedrockRuntimeClient();
    }
    
    const command = new CreateSessionCommand({})
    const response = await runtimeClient.send(command)
    
    // Store session ID in memory (persists for app lifetime)
    agentSessionId = response.sessionId;
    console.log('Agent session created:', agentSessionId);
    
    return agentSessionId;
  } catch (error) {
    console.error('Error creating agent session:', error)
    // Reset client on error so it can be recreated with potentially updated credentials
    runtimeClient = null;
    agentSessionId = null;
    return null
  }
}

function _get_agent_session() {
  // Return current session ID without creating a new one
  return agentSessionId;
}

async function _end_agent_session() {
  // End the agent session if one exists
  if (!agentSessionId) {
    console.log('No active session to end');
    return;
  }

  try {
    // Ensure runtime client is initialized
    if (!runtimeClient) {
      runtimeClient = createBedrockRuntimeClient();
    }

    const command = new EndSessionCommand({
      sessionIdentifier: agentSessionId
    });

    const response = await runtimeClient.send(command);
    console.log('Agent session ended successfully:', {
      sessionId: response.sessionId,
      sessionStatus: response.sessionStatus
    });

    // Clear session ID
    agentSessionId = null;
  } catch (error) {
    console.error('Error ending agent session:', error);
    // Still clear the session ID even if ending fails
    agentSessionId = null;
  }
}

// Register custom protocol schemes as privileged before app is ready
// This is required for custom protocols to work in production builds
// Note: This must be called before app.whenReady()
if (protocol.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'thumb',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
        allowServiceWorkers: true
      }
    },
    {
      scheme: 'video',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
        allowServiceWorkers: true
      }
    }
  ]);
  console.log('Protocol schemes registered as privileged');
} else {
  console.warn('protocol.registerSchemesAsPrivileged not available');
}

app.whenReady().then(() => {
  // Setup logging first (requires app to be ready)
  setupLogging();
  console.log('=== App Ready - Starting Initialization ===');
  
  // Initialize app paths and ensure they exist
  // This MUST succeed before proceeding
  console.log('=== Initializing App Paths ===');
  try {
    const { sessionTempDir: dir, videoMapPath: file } = initializeAppPaths();
    if (!dir || !file) {
      console.error('CRITICAL: App paths not initialized properly!');
    } else {
      console.log('=== App Paths Initialized Successfully ===');
      console.log('  Directory:', dir);
      console.log('  File:', file);
    }
  } catch (error) {
    console.error('CRITICAL ERROR during app path initialization:', error);
    console.error('Error stack:', error.stack);
    // Continue anyway - individual handlers will try to initialize if needed
  }

  // Register custom protocol for serving thumbnails
  // MUST be registered before createWindow() is called
  // Unregister first if already registered (for hot reload in dev)
  if (protocol.isProtocolRegistered('thumb')) {
    protocol.unregisterProtocol('thumb');
    console.log('Unregistered existing thumb protocol');
  }
  
  const thumbHandlerRegistered = protocol.registerFileProtocol('thumb', (request, callback) => {
    console.log('=== THUMBNAIL PROTOCOL HANDLER CALLED ===');
    console.log('Request URL:', request.url);
    console.log('Request headers:', request.headers);
    try {
      // Parse the URL - request.url will be something like "thumb://C%3A%5CUsers%5Cnatha%5C..."
      let filePath = request.url;
      
      // Remove protocol prefix
      if (filePath.startsWith('thumb://')) {
        filePath = filePath.substring(8);
      } else if (filePath.startsWith('thumb:')) {
        filePath = filePath.substring(6);
      }
      
      // Decode URI component to handle special characters and Windows paths
      const decodedPath = decodeURIComponent(filePath);
      
      // Normalize the path for the current platform
      const normalizedPath = path.normalize(decodedPath);
      
      console.log('Decoded path:', decodedPath);
      console.log('Normalized path:', normalizedPath);
      console.log('File exists:', fs.existsSync(normalizedPath));
      
      if (fs.existsSync(normalizedPath)) {
        console.log('Serving thumbnail file:', normalizedPath);
        callback({ path: normalizedPath });
      } else {
        console.error('Thumbnail file not found:', normalizedPath);
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } catch (error) {
      console.error('Error serving thumbnail:', error);
      console.error('Request URL:', request.url);
      console.error('Error stack:', error.stack);
      callback({ error: -2 }); // FAILED
    }
  });
  
  if (thumbHandlerRegistered) {
    console.log('Thumb protocol registered successfully');
  } else {
    console.error('FAILED to register thumb protocol!');
  }
  
  // Verify protocol is registered
  console.log('Protocol is registered:', protocol.isProtocolRegistered('thumb'));

  // Register custom protocol for video preview
  protocol.registerFileProtocol('video', (request, callback) => {
    try {
      // Parse the URL more robustly
      let filePath = request.url;
      // Remove protocol prefix (handle both video:// and video:)
      if (filePath.startsWith('video://')) {
        filePath = filePath.substring(8); // Remove 'video://'
      } else if (filePath.startsWith('video:')) {
        filePath = filePath.substring(6); // Remove 'video:'
      }
      
      // Decode URI component to handle special characters and Windows paths
      const decodedPath = decodeURIComponent(filePath);
      
      // Normalize Windows paths (handle both / and \)
      const normalizedPath = path.normalize(decodedPath);
      
      if (fs.existsSync(normalizedPath)) {
        callback({ path: normalizedPath });
      } else {
        console.error('Video file not found:', normalizedPath);
        console.error('Original URL:', request.url);
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } catch (error) {
      console.error('Error serving video:', error);
      console.error('Request URL:', request.url);
      console.error('Error stack:', error.stack);
      callback({ error: -2 }); // FAILED
    }
  });

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  ipcMain.handle('delete-video', async (event, apiKey, filePath) => {
    try {
      // Ensure paths are initialized
      if (!videoMapPath) initializeAppPaths();
      const videoMap = JSON.parse(await fsp.readFile(videoMapPath, 'utf8'));
      const videoFileHash = await _generateVideoFileHash(filePath);


      if (apiKey && videoMap[videoFileHash] && videoMap[videoFileHash].videoId) {

        const twelveLabsClient = new TwelveLabs({
          apiKey: apiKey
        })

        const index = await _check_index(apiKey);
        const videoExists = await _check_video_id(apiKey, videoMap[videoFileHash].videoId, index.id);

        if (videoMap[videoFileHash] && videoMap[videoFileHash].videoId && videoExists) {

          const deleteVideoResponse = await twelveLabsClient.indexes.videos.delete(index.id, videoMap[videoFileHash].videoId)

          if (!deleteVideoResponse || !deleteVideoResponse.success) {
            throw new Error('Failed to delete video');
          }
        }
      }

      if (videoMap[videoFileHash]) {
        await _delete_hash(videoFileHash)
      }

      fs.unlinkSync(filePath);

      return {
        success: true,
        content: null
      }

    } catch (error) {
      console.error('Error deleting video:', error);
      return {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('create-agent-session', async (event) => {
    return await _create_agent_session()
  })

  ipcMain.handle('get-agent-session', async (event) => {
    return _get_agent_session()
  })

  ipcMain.handle('get-video-content', async (event, apiKey, hash) => {
    // Ensure paths are initialized
    if (!videoMapPath) initializeAppPaths();
    const videoMap = JSON.parse(await fsp.readFile(videoMapPath, 'utf8'));

    if (videoMap[hash]) {

      const indexId = videoMap[hash].indexId
      const videoId = videoMap[hash].videoId
      const videoExists = await _check_video_id(apiKey, videoId, indexId)

      if (!videoExists) {
        await _delete_hash(hash)
        return null;
      }

      return videoMap[hash]

    }

    return null
  })

  ipcMain.handle('prompt-strands-agent', async (event, prompt, twelveLabsApiKey, slack_bot_token, slack_app_token, chat_history, videoId, streamBackToUser = true) => {

    console.log('Prompting Strands Agent:', prompt)
    console.log('TwelveLabs API Key:', twelveLabsApiKey)
    console.log('Slack Bot Token:', slack_bot_token)
    console.log('Slack App Token:', slack_app_token)
    console.log('Video ID:', videoId)

    const prompt_template = `
    You are a helpful assistant that analyzes Zoom video recordings then answers questions about the video.

    Alongside answering questions you can also search the video for specific moments, or summarize the video.
    You can also send messages in a Slack channel, in provided the Slack bot token and app token.
    The Slack channel will likely have people that were in the video recording and you may be asked to send messages to them based on the prompt.
    If specific name is mentioned to send message to in Slack, list our channel IDs and find the appropriate channel ID to send the private message to in Slack.
    Try your best not to default to sending messages in a public channel, unless explicitly told to do so.

    Use the following formatting guidelines when sending messages to Slack:

    /********** START NEW SLACK FORMATTING INSTRUCTIONS **********/
    
    **CRITICAL: When you are asked to send a message or summary to Slack, you MUST format it using only Slack's 'mrkdwn' syntax, NOT standard Markdown.**
    
    * For **bold**, you MUST use single asterisks: *This is bold in Slack*
    * For bullet points, you MUST use the • character or a single asterisk (*).
    * Do NOT use double asterisks (**bold**) or hashes (### Header). Slack will display those characters literally.
    
    /********** END NEW SLACK FORMATTING INSTRUCTIONS **********/

    /********** START HEARTBEAT INSTRUCTIONS **********/

    **CRITICAL: If the user sends the prompt 'heartbeat', your ONLY action is to respond with the single word 'ack'. This is a keep-alive signal. Do not say anything else.
    
    /********** END HEARTBEAT INSTRUCTIONS **********/

    The user will provide you with a video ID, representing the video ID indexed in TwelveLabs. You can use this video ID to analyze the video.
    
    Here is the video ID:
    ${videoId}

    If NOT provided the Slack bot token and app token, you will not be able to send messages in a Slack channel.
    If NOT provided the TwelveLabs API key, you will not be able to analyze the video.

    Here is the chat history:
    ${chat_history.map(message => `${message.role}: ${message.content}`).join('\n')}

    Please continue the conversation based on the chat history and the prompt.

    Here is the API key and tokens:
    TwelveLabs API Key: ${twelveLabsApiKey}
    Slack Bot Token: ${slack_bot_token}
    Slack App Token: ${slack_app_token}

    You must set the API keys and tokens with the following names:
    1. SLACK_BOT_TOKEN
    2. SLACK_APP_TOKEN
    3. TWELVELABS_API_KEY

    Varying from the above names will result in errors and failures to perform actions.

    Automatically set API keys and tokens if provided. No need for confirmation. Do NOT write the API keys and tokens to the response, just handle them internally.
    If a key action is required that requires a certain key or token, please ask the user to navigate to the "Account Information" page to set the key or token.
    You should explicitly state it the API keys and tokens are set, if properly set and provided.

    DO NOT write the API keys and tokens to the response, just handle them internally.
    DO NOT take extra actions, especially in regards to Slack or TwelveLabs. Do only what you are told to do and clarify if needed with the user.

    Here is the prompt:
    ${prompt}
    `

    try {
      // Ensure we have a session ID
      if (!agentSessionId) {
        await _create_agent_session();
        if (!agentSessionId) {
          throw new Error('Failed to create agent session');
        }
      }

      // Ensure Agent Core client is initialized
      if (!agentCoreClient) {
        agentCoreClient = createBedrockAgentCoreClient();
      }

      // Use InvokeAgentRuntimeCommand with BedrockAgentCoreClient
      // The agent.py expects payload.get("prompt"), so we need to send JSON
      const payloadJson = JSON.stringify({
        prompt: prompt_template
      });
      
      const encoder = new TextEncoder();
      const command = new InvokeAgentRuntimeCommand({
        runtimeSessionId: agentSessionId,
        agentRuntimeArn: "arn:aws:bedrock-agentcore:us-east-1:551588892732:runtime/agentv2-ygWXvkBdWG",
        qualifier: "DEFAULT", // Optional
        payload: encoder.encode(payloadJson) // Required: Uint8Array of JSON string
      })
      
      console.log('Invoking agent with session:', agentSessionId);
      console.log('Input text preview:', prompt_template.substring(0, 200) + '...');

      const response = await agentCoreClient.send(command)

      // Check for error in response
      if (response.error || (response.response && response.response.statusCode >= 400)) {
        const errorMessage = response.error?.message || response.error || 'Unknown error from Bedrock AgentCore';
        console.error('Bedrock AgentCore error:', errorMessage);
        
        // If it's a ValidationException about tool results, reset the session
        if (errorMessage.includes('ValidationException') && errorMessage.includes('toolResult')) {
          console.log('Tool result mismatch detected - resetting session');
          agentSessionId = null; // Force new session creation on next call
          runtimeClient = null; // Reset client to ensure fresh session
        }
        
        if (streamBackToUser) {
          event.sender.send('prompt-strands-agent-error', errorMessage);
        }
        throw new Error(errorMessage);
      }

      // Transform response to string
      if (response.response && typeof response.response.transformToString === 'function') {
        let textResponse;
        try {
          textResponse = await response.response.transformToString();
          console.log('Response text length:', textResponse?.length || 0);
          console.log('Response text preview (first 500 chars):', textResponse?.substring(0, 2000) || 'empty');
        } catch (transformError) {
          console.error('Error transforming response to string:', transformError);
          if (streamBackToUser) {
            event.sender.send('prompt-strands-agent-error', `Error reading response: ${transformError.message || transformError}`);
          }
          throw transformError;
        }
        
        // Check if response contains an error message
        if (textResponse && typeof textResponse === 'string') {
          // Check for common error patterns in SSE format
          if (textResponse.includes('"error"') || textResponse.includes('"error_type"') || textResponse.includes('EventLoopException') || textResponse.includes('EventLoopExecution')) {
            console.error('Error detected in response text');
            console.error('Response text:', textResponse);
            try {
              // Try to parse error from SSE format - look for JSON error objects
              const errorMatch = textResponse.match(/"error"\s*:\s*"([^"]+)"/);
              const errorTypeMatch = textResponse.match(/"error_type"\s*:\s*"([^"]+)"/);
              const errorMessageMatch = textResponse.match(/"message"\s*:\s*"([^"]+)"/);
              
              if (errorMatch || errorTypeMatch || errorMessageMatch) {
                const errorMsg = errorMatch?.[1] || errorMessageMatch?.[1] || errorTypeMatch?.[1] || 'Unknown error';
                console.error('Parsed error message:', errorMsg);
                
                // If it's a ValidationException about tool results, reset the session
                if (errorMsg.includes('ValidationException') && errorMsg.includes('toolResult')) {
                  console.log('Tool result mismatch detected - resetting session');
                  agentSessionId = null; // Force new session creation on next call
                  runtimeClient = null; // Reset client to ensure fresh session
                }
                
                if (streamBackToUser) {
                  event.sender.send('prompt-strands-agent-error', errorMsg);
                }
                return {
                  success: false,
                  error: errorMsg
                };
              }
            } catch (e) {
              // If we can't parse the error, send the raw error text
              console.error('Could not parse error from response:', e);
              if (streamBackToUser) {
                event.sender.send('prompt-strands-agent-error', 'An error occurred during streaming. Check console for details.');
              }
              return {
                success: false,
                error: 'An error occurred during streaming'
              };
            }
          }
        }
        
        // Parse SSE format: data: "text"
        // Preserve spacing by not trimming lines - only skip truly empty lines
        const lines = textResponse.split('\n');
        for (const line of lines) {
          // Only skip completely empty lines (no content at all)
          if (!line || line.length === 0) continue;
          
          // Check for SSE format without trimming (to preserve leading spaces)
          if (line.trim().startsWith('data: ')) {
            // Find where 'data: ' starts (accounting for leading whitespace)
            const dataIndex = line.indexOf('data: ');
            if (dataIndex !== -1) {
              const data = line.substring(dataIndex + 6); // Remove 'data: ' prefix, preserve any leading whitespace before it
              
              // Parse JSON-encoded string (simple approach like old code)
              // Handle JSON-encoded strings (remove quotes if present)
              let cleanedData = data;
              if (data.startsWith('"') && data.endsWith('"')) {
                try {
                  cleanedData = JSON.parse(data);
                } catch (e) {
                  // If not valid JSON, just remove outer quotes
                  cleanedData = data.slice(1, -1);
                }
              }
              
              if (cleanedData && cleanedData !== '[DONE]') {
                if (streamBackToUser) {
                  event.sender.send('prompt-strands-agent-response', cleanedData);
                }
              }
            }
          } else if (!line.trim().startsWith(':')) {
            // Non-SSE format line, send as-is (preserve spacing)
            if (streamBackToUser) {
              event.sender.send('prompt-strands-agent-response', line);
            }
          }
        }
        
        if (streamBackToUser) {
          event.sender.send('prompt-strands-agent-complete');
        }
      } else if (response.response && response.response.getReader) {
        // Handle streaming response if transformToString is not available
        const reader = response.response.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Process complete lines (SSE format)
            // Preserve spacing by not trimming lines unnecessarily
            let lastNewlineIndex = buffer.lastIndexOf('\n');
            
            if (lastNewlineIndex !== -1) {
              const completeLines = buffer.substring(0, lastNewlineIndex + 1);
              buffer = buffer.substring(lastNewlineIndex + 1);
              
              const lines = completeLines.split('\n');
              for (const line of lines) {
                // Only skip completely empty lines
                if (!line || line.length === 0) continue;

                console.log("LINE:", line);
                
                // Check for SSE format without trimming (to preserve leading spaces)
                if (line.trim().startsWith('data: ')) {
                  const dataIndex = line.indexOf('data: ');
                  if (dataIndex !== -1) {
                    const data = line.substring(dataIndex + 6);
                    // Handle JSON-encoded strings (simple approach like old code)
                    let cleanedData = data;
                    if (data.startsWith('"') && data.endsWith('"')) {
                      try {
                        cleanedData = JSON.parse(data);
                      } catch (e) {
                        // If not valid JSON, just remove outer quotes
                        cleanedData = data.slice(1, -1);
                      }
                    }
                    
                    if (cleanedData && cleanedData !== '[DONE]') {
                      if (streamBackToUser) {
                        event.sender.send('prompt-strands-agent-response', cleanedData);
                      }
                    }
                  }
                } else if (!line.trim().startsWith(':')) {
                  // Non-SSE format line, send as-is (preserve spacing)
                  if (streamBackToUser) {
                    event.sender.send('prompt-strands-agent-response', line);
                  }
                }
              }
            }
          }

          // Process any remaining buffer
          if (buffer && buffer.trim()) {
            const trimmedBuffer = buffer.trim();
            if (trimmedBuffer.startsWith('data: ')) {
              const data = trimmedBuffer.substring(6);
              // Handle JSON-encoded strings (simple approach like old code)
              let cleanedData = data;
              if (data.startsWith('"') && data.endsWith('"')) {
                try {
                  cleanedData = JSON.parse(data);
                } catch (e) {
                  // If not valid JSON, just remove outer quotes
                  cleanedData = data.slice(1, -1);
                }
              }
              if (cleanedData && cleanedData !== '[DONE]') {
                if (streamBackToUser) {
                  event.sender.send('prompt-strands-agent-response', cleanedData);
                }
              }
            } else if (!trimmedBuffer.startsWith(':')) {
              // Non-SSE format, send as-is
              if (streamBackToUser) {
                event.sender.send('prompt-strands-agent-response', trimmedBuffer);
              }
            }
          }
          
          if (streamBackToUser) {
            event.sender.send('prompt-strands-agent-complete');
          }
        } catch (streamError) {
          console.error('Error reading response stream:', streamError);
          throw streamError;
        }
      }

    } catch (error) {
      console.error('Error prompting strands agent:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        fault: error.$fault,
        stack: error.stack
      });
      
      // Extract error message - check for nested error messages
      let errorMessage = error.message || 'Unknown error occurred';
      if (error.message && error.message.includes('EventLoopExecution')) {
        errorMessage = 'An error occurred in the agent backend. This may be due to an async event loop issue.';
      } else if (error.$metadata?.httpStatusCode) {
        errorMessage = `Request failed with status ${error.$metadata.httpStatusCode}: ${error.message || 'Unknown error'}`;
      }
      
      if (streamBackToUser) {
        event.sender.send('prompt-strands-agent-error', errorMessage);
      }
      return {
        success: false,
        error: errorMessage
      }
    }

    return {
      success: true
    }
  })

  ipcMain.handle('get-video-gist', async (event, apiKey, videoId, indexId) => {

    try {

      const twelveLabsClient = new TwelveLabs({
        apiKey: apiKey
      })

      const videoInfo = await twelveLabsClient.indexes.videos.retrieve(indexId, videoId)

      if (!videoInfo || !videoInfo.systemMetadata) {
        throw new Error('Failed to retrieve video info');
      }

      let transcript = [];

      if (videoInfo.transcription) {
        videoInfo.transcription.forEach((item) => {
          transcript.push({
            "start": item.start,
            "end": item.end,
            "text": item.value
          })
        })
      }

      const videoSummaryResponse = await twelveLabsClient.summarize({
        videoId: videoId,
        type: 'summary',
      })

      if (!videoSummaryResponse || !videoSummaryResponse.summary) {
        throw new Error('Failed to retrieve video summary');
      }

      const videoChapterResponse = await twelveLabsClient.summarize({
        videoId: videoId,
        type: 'chapter',
      })

      if (!videoChapterResponse || !videoChapterResponse.chapters) {
        throw new Error('Failed to retrieve video chapters');
      }

      return {
        success: true,
        content: {
          "filename": videoInfo.systemMetadata?.filename,
          "duration": videoInfo.systemMetadata?.duration,
          "transcript": transcript,
          "summary": videoSummaryResponse.summary,
          "chapters": videoChapterResponse.chapters
        }
      }

    } catch (error) {
      console.error('Error getting video gist:', error);
      return {
        success: false,
        error: error.message
      }
    }

  })

  ipcMain.handle('upload-video', async (event, filePath, targetFileName) => {
    try {
      const platform = os.platform();
      let directoryPath = '';

      if (platform === 'win32') {
        const systemRoot = path.parse(process.cwd()).root;
        directoryPath = path.join(systemRoot, 'Users', os.userInfo().username, 'Documents', 'Zoom');
      } else if (platform === 'darwin') {
        directoryPath = path.join(os.homedir(), 'Documents', 'Zoom');
      } else {
        throw new Error('Unsupported platform: ' + platform);
      }

      if (!fs.existsSync(directoryPath)) {
        throw new Error('Directory does not exist. ' + directoryPath);
      }

      const newFilePath = path.join(directoryPath, targetFileName + path.extname(filePath));
      await fsp.copyFile(filePath, newFilePath, fs.constants.COPYFILE_EXCL);

      console.log('Video file uploaded to:', newFilePath);

      return {
        success: true,
        content: newFilePath
      }

    } catch (error) {
      console.error('Error cloning video file:', error);
      return {
        success: false,
        error: error.message,
        content: null
      }
    }

  })

  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(options)
      return {
        success: !result.canceled,
        filePaths: result.filePaths,
        canceled: result.canceled
      }
    } catch (error) {
      console.error('Error showing open dialog:', error)
      return {
        success: false,
        error: error.message,
        filePaths: [],
        canceled: true
      }
    }
  })

  ipcMain.handle('get-video-hash', async (event, filepath) => {
    return await _generateVideoFileHash(filepath);
  })

  ipcMain.handle('index-video', async (event, apiKey, filepath) => {

    console.log('Indexing video:', filepath)
    console.log('API Key:', apiKey)

    try {
      // Ensure paths are initialized
      if (!videoMapPath) initializeAppPaths();
      const videoFileHash = await _generateVideoFileHash(filepath);
      const videoMap = JSON.parse(await fsp.readFile(videoMapPath, 'utf8'));
      if (videoMap[videoFileHash]) {
        return {
          success: true,
          content: videoMap[videoFileHash]
        }
      }

      const index =await _check_index(apiKey);
      const videoContent = await _index_video(apiKey, index, filepath);

      videoMap[videoFileHash] = videoContent;
      await fsp.writeFile(videoMapPath, JSON.stringify(videoMap, null, 2));

      videoContent['hash'] = videoFileHash;

      return {
        success: true,
        content: videoContent
      }

    } catch (error) {
      
      console.error('Error indexing video:', error);
      
      return {
        success: false,
        error: error.message,
        content: null
      }
    }
  })

  ipcMain.handle('fetch-thumbnail', async (event, filepath, output_dir = null) => {
    // Ensure paths are initialized and use default if not provided
    if (!sessionTempDir) initializeAppPaths();
    if (!output_dir) output_dir = sessionTempDir;
  
    try {
      console.log('=== FETCH THUMBNAIL STARTED ===');
      console.log('Input filepath:', filepath);
      console.log('Output directory:', output_dir);
      console.log('FFmpeg path:', ffmpegPath);
      console.log('FFmpeg path exists:', fs.existsSync(ffmpegPath));
  
      if (!fs.existsSync(filepath)) {
        throw new Error('File does not exist. ' + filepath);
      }
  
      // Ensure output directory exists
      if (!fs.existsSync(output_dir)) {
        console.log('Output directory does not exist, creating:', output_dir);
        fs.mkdirSync(output_dir, { recursive: true });
        console.log('Output directory created');
      }
      
      // Verify we can write to the output directory
      try {
        const testFile = path.join(output_dir, '.write-test');
        fs.writeFileSync(testFile, 'test', 'utf8');
        fs.unlinkSync(testFile);
        console.log('✓ Write permissions verified for output directory');
      } catch (writeError) {
        console.error('✗ Cannot write to output directory:', writeError);
        throw new Error(`No write permissions to output directory: ${writeError.message}`);
      }
  
      const videoFileName = path.basename(filepath, path.extname(filepath));
      const thumbnailPath = path.join(output_dir, `${videoFileName}.png`);

      console.log('Generating thumbnail for:', filepath);
      console.log('Thumbnail will be saved to:', thumbnailPath);
      console.log('Video filename:', videoFileName);

      if (!fs.existsSync(thumbnailPath)) {
        console.log('Thumbnail does not exist, generating...');
        
        // Verify FFmpeg is available
        if (!ffmpeg || !ffmpegPath || !fs.existsSync(ffmpegPath)) {
          throw new Error(`FFmpeg not available. Path: ${ffmpegPath || 'null'}. Thumbnail generation requires FFmpeg to be installed.`);
        }
        
        await new Promise((resolve, reject) => {
          const ffmpegProcess = ffmpeg(filepath).screenshots({
            timestamps: ['1'],
            filename: `${videoFileName}.png`,
            folder: output_dir,
          });
          
          ffmpegProcess.on('error', (err) => {
            console.error('✗ FFmpeg error generating thumbnail:', err);
            console.error('FFmpeg error message:', err.message);
            console.error('FFmpeg error code:', err.code);
            console.error('FFmpeg stderr:', err.stderr);
            reject(err);
          }).on('end', () => {
            console.log('✓ FFmpeg thumbnail generation completed');
            // Small delay to ensure file is written
            setTimeout(() => {
              if (fs.existsSync(thumbnailPath)) {
                console.log('✓ Thumbnail file verified:', thumbnailPath);
                resolve();
              } else {
                console.error('✗ Thumbnail file not found after generation:', thumbnailPath);
                reject(new Error('Thumbnail file was not created'));
              }
            }, 100);
          }).on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
          });
        });
      } else {
        console.log('✓ Thumbnail already exists:', thumbnailPath);
      }

      // Verify thumbnail was created
      if (!fs.existsSync(thumbnailPath)) {
        throw new Error('Thumbnail file was not created: ' + thumbnailPath);
      }
      
      // Verify thumbnail file is not empty
      const stats = fs.statSync(thumbnailPath);
      if (stats.size === 0) {
        throw new Error('Thumbnail file is empty: ' + thumbnailPath);
      }
      console.log('✓ Thumbnail file size:', stats.size, 'bytes');

      // Convert thumbnail to data URL using nativeImage for better reliability
      // This works across all platforms and doesn't require custom protocols
      try {
        const image = nativeImage.createFromPath(thumbnailPath);
        if (image.isEmpty()) {
          throw new Error('Failed to load thumbnail image');
        }
        const dataUrl = image.toDataURL();
        
        console.log('Returning thumbnail as data URL (length:', dataUrl.length, 'chars)');
        console.log('Original path:', thumbnailPath);

        return { success: true, content: dataUrl }
      } catch (imageError) {
        console.warn('Failed to convert thumbnail to data URL, falling back to protocol URL:', imageError);
        // Fallback to custom protocol if nativeImage fails
        const protocolUrl = `thumb://${encodeURIComponent(thumbnailPath)}`;
        console.log('Returning thumbnail URL:', protocolUrl);
        return { success: true, content: protocolUrl }
      }
  
    } catch (error) {
      console.error('Error fetching thumbnail:', error);
      return {
        success: false,
        error: error.message,
        content: null
      }
    }
  })
  
  ipcMain.handle('scan-folder', async (event) => {
  
      try {
  
        const platform = os.platform();
        let directoryPath = '';
  
        if (platform === 'win32') {
          const systemRoot = path.parse(process.cwd()).root;
          directoryPath = path.join(systemRoot, 'Users', os.userInfo().username, 'Documents', 'Zoom');
        } else if (platform === 'darwin') {
          directoryPath = path.join(os.homedir(), 'Documents', 'Zoom');
        } else {
          throw new Error('Unsupported platform: ' + platform);
        }
  
        if (!fs.existsSync(directoryPath)) {
          throw new Error('Directory does not exist. ' + directoryPath);
        }
    
        const files = fs.readdirSync(directoryPath);
        const videoFiles = files.filter(file => file.endsWith('.mp4'));
  
        for (let i = 0; i < videoFiles.length; i++) {
          videoFiles[i] = {
            name: videoFiles[i],
            date: fs.statSync(path.join(directoryPath, videoFiles[i])).mtime,
            filepath: path.join(directoryPath, videoFiles[i])
          }
        }
    
        return {
          success: true,
          content: videoFiles
        }
    
      } catch (error) {
        console.error('Error scanning Zoom folder:', error);
        return {
          success: false,
          error: error.message,
          content: []
        }
      }
  
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

})

app.on('will-quit', async (event) => {
  try {
    // End the agent session before quitting
    console.log('Application closing, ending agent session...');
    await _end_agent_session();
  } catch (error) {
    console.error('Error ending agent session on quit:', error);
  }

  try {
    // Ensure paths are initialized
    if (!sessionTempDir) initializeAppPaths();
    if (sessionTempDir && fs.existsSync(sessionTempDir)) {
      const thumbnailFiles = fs.readdirSync(sessionTempDir);
      for (const thumbnailFile of thumbnailFiles) {
        if (thumbnailFile.endsWith('.png')) {
          fs.unlinkSync(path.join(sessionTempDir, thumbnailFile));
        }
      }
    } 
  } catch (error) {
    console.error('Error cleaning up session temp dir:', error);
  }
  
  // Close log file stream
  if (logFileStream) {
    logFileStream.end();
    logFileStream = null;
    if (LOG_FILE_PATH) {
      console.log('Log file closed:', LOG_FILE_PATH);
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

