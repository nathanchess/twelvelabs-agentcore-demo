import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TwelveLabs } from 'twelvelabs-js'

import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import fsp from 'fs/promises'
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import crypto from 'crypto';

// App Constants
const sessionTempDir = path.join(app.getPath('temp'), 'tl-video-agent-session');
const videoMapPath = path.join(sessionTempDir, 'video-map.json');

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

app.whenReady().then(() => {

  if (!fs.existsSync(sessionTempDir)){
    fs.mkdirSync(sessionTempDir, { recursive: true });
  }

  if (!fs.existsSync(videoMapPath)) {
    fs.writeFileSync(videoMapPath, '{}');
  }

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  ipcMain.handle('get-video-content', async (event, hash) => {
    const videoMap = JSON.parse(await fsp.readFile(videoMapPath, 'utf8'));

    if (!videoMap[hash]) {
      throw new Error('Video not found in video map. Please index the video again.  ');
    }

    return videoMap[hash];
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
  
      if (fs.existsSync(thumbnailPath)) {
        return {
          success: true,
          content: thumbnailPath
        }
      }
  
      await new Promise((resolve, reject) => {
        ffmpeg(filepath).screenshots({
          timestamps: ['1'],
          filename: `${videoFileName}.png`,
          folder: output_dir,
        }).on('error', (err) => reject(err)).on('end', resolve);
      })
  
      return { success: true, content: thumbnailPath }
  
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

