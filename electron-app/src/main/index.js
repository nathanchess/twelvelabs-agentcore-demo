import { app, shell, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TwelveLabs } from 'twelvelabs-js'

import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import fsp from 'fs/promises'
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// App Constants
const sessionTempDir = path.join(app.getPath('temp'), 'tl-video-agent-session');
const videoMapPath = path.join(sessionTempDir, 'video-map.json');

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
    console.error('Error checking video ID:', error);
    return false;
  }

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

    Automatically set API keys and tokens if provided. No need for confirmation. Do NOT write the API keys and tokens to the response, just handle them internally.
    If a key action is required that requires a certain key or token, please ask the user to navigate to the "Account Information" page to set the key or token.

    DO NOT write the API keys and tokens to the response, just handle them internally.
    DO NOT take extra actions, especially in regards to Slack or TwelveLabs. Do only what you are told to do and clarify if needed with the user.

    Here is the prompt:
    ${prompt}
    `

    let response;

    try {
      response = await fetch('http://localhost:8080/invocations', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt_template
        }),
        headers: {
          'Content-Type': 'application/json',
        }
      })

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

        event.sender.send('prompt-strands-agent-complete');

      } catch (error) {
        console.error('Error reading strands agent response:', error);
        event.sender.send('prompt-strands-agent-error', error.message);
        throw error;
      }

    } catch (error) {
      console.error('Error prompting strands agent:', error);
      event.sender.send('prompt-strands-agent-error', error.message);
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

