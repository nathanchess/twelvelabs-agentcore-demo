import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const sessionTempDir = path.join(app.getPath('temp'), 'zoom-thumbnailer-sessions');

function createWindow() {
  // Create the browser window.
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

app.whenReady().then(() => {

  if (!fs.existsSync(sessionTempDir)){
    fs.mkdirSync(sessionTempDir, { recursive: true });
  }

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  ipcMain.handle('fetch-thumbnail', async (event, filepath, output_dir = sessionTempDir) => {

    console.log("fetch-thumbnail handler called...")
  
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
          //size: '320x240'
        }).on('end', () => {
          console.log('Thumbnail created at ' + thumbnailPath);
        }).on('error', (err) => {
          console.error('Error creating thumbnail:', err);
          reject(err);
        }).on('end', resolve);
      })
  
      return {
        success: true,
        content: thumbnailPath
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

app.on('will-quit', () => {
  try {
    if (fs.existsSync(sessionTempDir)) {
      const thumbnailFiles = fs.readdirSync(sessionTempDir);
      for (const thumbnailFile of thumbnailFiles) {
        fs.unlinkSync(path.join(sessionTempDir, thumbnailFile));
      }
      fs.rmSync(sessionTempDir, { recursive: true });
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

