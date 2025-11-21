import { app, shell, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TwelveLabs } from 'twelvelabs-js'
import { BedrockAgentRuntimeClient, CreateSessionCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore'

import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import fsp from 'fs/promises'
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// App Constants
const sessionTempDir = path.join(app.getPath('temp'), 'tl-video-agent-session');
const videoMapPath = path.join(sessionTempDir, 'video-map.json');

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

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg')
ffmpeg.setFfmpegPath(ffmpegPath);

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

app.whenReady().then(() => {

  if (!fs.existsSync(sessionTempDir)){
    fs.mkdirSync(sessionTempDir, { recursive: true });
  }

  if (!fs.existsSync(videoMapPath)) {
    fs.writeFileSync(videoMapPath, '{}');
  }

  // Register custom protocol for serving thumbnails
  protocol.registerFileProtocol('thumb', (request, callback) => {
    try {
      const filePath = request.url.replace('thumb://', '');
      const decodedPath = decodeURIComponent(filePath);
      
      if (fs.existsSync(decodedPath)) {
        callback({ path: decodedPath });
      } else {
        callback({ error: -6 });
      }
    } catch (error) {
      console.error('Error serving thumbnail:', error);
      callback({ error: -2 });
    }
  });

  // Register custom protocol for video preview
  protocol.registerFileProtocol('video', (request, callback) => {
    try {
      const filePath = request.url.replace('video://', '');
      const decodedPath = decodeURIComponent(filePath);
      
      if (fs.existsSync(decodedPath)) {
        callback({ path: decodedPath });
      } else {
        callback({ error: -6 });
      }
    } catch (error) {
      console.error('Error serving video:', error);
      callback({ error: -2 });
    }
  });

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  ipcMain.handle('delete-video', async (event, apiKey, filePath) => {
    try {

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

  ipcMain.handle('prompt-strands-agent', async (event, prompt, twelveLabsApiKey, slack_bot_token, slack_app_token, chat_history, videoId) => {

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
        agentRuntimeArn: "arn:aws:bedrock-agentcore:us-east-1:551588892732:runtime/agent-8RFQdxGEut",
        qualifier: "DEFAULT", // Optional
        payload: encoder.encode(payloadJson) // Required: Uint8Array of JSON string
      })
      
      console.log('Invoking agent with session:', agentSessionId);
      console.log('Input text preview:', prompt_template.substring(0, 200) + '...');

      const response = await agentCoreClient.send(command)

      // Transform response to string
      if (response.response && typeof response.response.transformToString === 'function') {
        const textResponse = await response.response.transformToString();
        
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
              
              // Parse JSON-encoded string
              try {
                const parsed = JSON.parse(data.trim()); // Only trim for JSON parsing
                if (typeof parsed === 'string') {
                  // Send the decoded text (preserve original spacing)
                  event.sender.send('prompt-strands-agent-response', parsed);
                } else {
                  // If it's an object, try to extract text
                  event.sender.send('prompt-strands-agent-response', parsed.text || parsed.content || JSON.stringify(parsed));
                }
              } catch (e) {
                // If not valid JSON, remove quotes if present and send cleaned text
                let cleaned = data.trim(); // Trim only for quote removal
                if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                  cleaned = cleaned.slice(1, -1);
                }
                // Unescape any escaped characters
                cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                event.sender.send('prompt-strands-agent-response', cleaned);
              }
            }
          } else if (!line.trim().startsWith(':')) {
            // Non-SSE format line, send as-is (preserve spacing)
            event.sender.send('prompt-strands-agent-response', line);
          }
        }
        
        event.sender.send('prompt-strands-agent-complete');
      } else {
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
                
                // Check for SSE format without trimming (to preserve leading spaces)
                if (line.trim().startsWith('data: ')) {
                  const dataIndex = line.indexOf('data: ');
                  if (dataIndex !== -1) {
                    const data = line.substring(dataIndex + 6);
                    try {
                      const parsed = JSON.parse(data.trim()); // Only trim for JSON parsing
                      event.sender.send('prompt-strands-agent-response', typeof parsed === 'string' ? parsed : (parsed.text || parsed.content || JSON.stringify(parsed)));
                    } catch (e) {
                      let cleaned = data.trim();
                      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                        cleaned = cleaned.slice(1, -1);
                      }
                      cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                      event.sender.send('prompt-strands-agent-response', cleaned);
                    }
                  }
                } else if (!line.trim().startsWith(':')) {
                  // Non-SSE format line, send as-is (preserve spacing)
                  event.sender.send('prompt-strands-agent-response', line);
                }
              }
            }
          }

          // Process any remaining buffer (preserve spacing)
          if (buffer && buffer.length > 0) {
            if (buffer.trim().startsWith('data: ')) {
              const dataIndex = buffer.indexOf('data: ');
              if (dataIndex !== -1) {
                const data = buffer.substring(dataIndex + 6);
                try {
                  const parsed = JSON.parse(data.trim()); // Only trim for JSON parsing
                  event.sender.send('prompt-strands-agent-response', typeof parsed === 'string' ? parsed : (parsed.text || parsed.content || JSON.stringify(parsed)));
                } catch (e) {
                  let cleaned = data.trim();
                  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                    cleaned = cleaned.slice(1, -1);
                  }
                  cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                  event.sender.send('prompt-strands-agent-response', cleaned);
                }
              }
            } else if (!buffer.trim().startsWith(':')) {
              // Non-SSE format, send as-is (preserve spacing)
              event.sender.send('prompt-strands-agent-response', buffer);
            }
          }
          
          event.sender.send('prompt-strands-agent-complete');
        } catch (streamError) {
          console.error('Error reading response stream:', streamError);
          throw streamError;
        }
      }

      /*

      if (!response.ok) {
        throw new Error('Failed to prompt strands agent');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          // Decode new chunk and add to buffer
          const newChunk = decoder.decode(value, { stream: true });
          buffer += newChunk;
          
          // Process complete lines (SSE format: lines end with \n)
          // Find the last complete line (ending with \n)
          let lastNewlineIndex = buffer.lastIndexOf('\n');
          
          if (lastNewlineIndex !== -1) {
            // Extract all complete lines (everything up to and including the last \n)
            const completeLines = buffer.substring(0, lastNewlineIndex + 1);
            // Keep only the incomplete part in buffer
            buffer = buffer.substring(lastNewlineIndex + 1);
            
            // Process each complete line
            const lines = completeLines.split('\n');
            for (const line of lines) {
              const trimmedLine = line.trim();
              
              // Skip empty lines
              if (!trimmedLine) continue;
              
              if (trimmedLine.startsWith('data: ')) {
                const data = trimmedLine.substring(6); // Remove 'data: ' prefix
                
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
                  console.log('Sending chunk:', cleanedData);
                  event.sender.send('prompt-strands-agent-response', cleanedData);
                }
              } else if (!trimmedLine.startsWith(':')) {
                // Handle non-SSE format lines (plain text) - skip comment lines
                console.log('Sending non-SSE chunk:', trimmedLine);
                event.sender.send('prompt-strands-agent-response', trimmedLine);
              }
            }
          }
          // If no newline found, keep accumulating in buffer
        }

        // Process any remaining buffer after stream ends
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.substring(6);
            let cleanedData = data;
            if (data.startsWith('"') && data.endsWith('"')) {
              try {
                cleanedData = JSON.parse(data);
              } catch (e) {
                cleanedData = data.slice(1, -1);
              }
            }
            if (cleanedData && cleanedData !== '[DONE]') {
              console.log('Sending final chunk:', cleanedData);
              event.sender.send('prompt-strands-agent-response', cleanedData);
            }
          } else if (trimmedLine && !trimmedLine.startsWith(':')) {
            console.log('Sending final non-SSE chunk:', trimmedLine);
            event.sender.send('prompt-strands-agent-response', trimmedLine);
          }
        }
          */

        event.sender.send('prompt-strands-agent-complete');


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
      event.sender.send('prompt-strands-agent-error', error.message || 'Unknown error occurred');
      return {
        success: false,
        error: error.message
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

  ipcMain.handle('fetch-thumbnail', async (event, filepath, output_dir = sessionTempDir) => {
  
    try {
  
      if (!fs.existsSync(filepath)) {
        throw new Error('File does not exist. ' + filepath);
      }
  
      const videoFileName = path.basename(filepath, path.extname(filepath));
      const thumbnailPath = path.join(output_dir, `${videoFileName}.png`);
  
      if (!fs.existsSync(thumbnailPath)) {
        await new Promise((resolve, reject) => {
          ffmpeg(filepath).screenshots({
            timestamps: ['1'],
            filename: `${videoFileName}.png`,
            folder: output_dir,
          }).on('error', (err) => reject(err)).on('end', resolve);
        })
      }
  
      // Convert file path to custom protocol URL
      // Encode the path to handle special characters
      const protocolUrl = `thumb://${encodeURIComponent(thumbnailPath)}`;
  
      return { success: true, content: protocolUrl }
  
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

app.on('will-quit', () => {
  try {
    if (fs.existsSync(sessionTempDir)) {
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

