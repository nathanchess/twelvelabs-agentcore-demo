import { app, shell, BrowserWindow, ipcMain, protocol, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { TwelveLabs } from 'twelvelabs-js'

import icon from '../../resources/icon.png?asset'
import fs from 'fs';
import fsp from 'fs/promises'
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import http from 'http';

// Logging setup for production - GUARANTEED to write logs
let logFileStream = null;
let LOG_FILE_PATH = null;
let logsInitialized = false;

// Synchronous log write - use for critical messages that MUST be saved
function syncLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  
  const fallbackPath = path.join(os.homedir(), 'strands-agent.log');
  
  if (LOG_FILE_PATH) {
    try {
      fs.appendFileSync(LOG_FILE_PATH, logLine);
    } catch (e) {
      // Last resort - write to home directory
      try {
        fs.appendFileSync(fallbackPath, logLine);
      } catch (e2) {
        // Nothing we can do
      }
    }
  } else {
    // Logging not initialized yet - write to home directory
    try {
      fs.appendFileSync(fallbackPath, logLine);
    } catch (e) {
      // Nothing we can do
    }
  }
}

// Catch ALL unhandled errors and log them synchronously
process.on('uncaughtException', (error) => {
  syncLog(`[FATAL] Uncaught Exception: ${error.message}\n${error.stack}`);
  // Don't exit - let the app continue if possible
});

process.on('unhandledRejection', (reason, promise) => {
  syncLog(`[FATAL] Unhandled Promise Rejection: ${reason}`);
});

function setupLogging() {
  // Try multiple locations for logging - ensure we ALWAYS have a log file
  const possibleLogDirs = [];
  
  if (process.platform === 'win32') {
    // Windows: try Local AppData first, then home directory
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    possibleLogDirs.push(
      path.join(localAppData, 'strands-agent', 'logs'),
      path.join(os.homedir(), 'strands-agent-logs')
    );
  } else {
    // macOS/Linux - try multiple possible paths
    try {
      possibleLogDirs.push(path.join(app.getPath('userData'), 'logs'));
    } catch (e) {
      // app might not be ready yet
    }
    possibleLogDirs.push(
      path.join(os.homedir(), 'Library', 'Logs', 'strands-agent'),  // macOS standard logs location
      path.join(os.homedir(), '.strands-agent', 'logs'),  // Hidden folder in home
      path.join(os.homedir(), 'strands-agent-logs')  // Visible folder in home as last resort
    );
  }
  
  // Try each directory until one works
  let logsDir = null;
  for (const dir of possibleLogDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write access
      const testFile = path.join(dir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      logsDir = dir;
      break;
    } catch (e) {
      // Try next directory
      continue;
    }
  }
  
  // Absolute fallback - home directory
  if (!logsDir) {
    logsDir = os.homedir();
  }
  
  LOG_FILE_PATH = path.join(logsDir, 'strands-agent.log');
  
  // Write startup marker synchronously - GUARANTEED to be written
  const startupMessage = `\n========== APP STARTED: ${new Date().toISOString()} ==========\n` +
    `Platform: ${process.platform}\n` +
    `Arch: ${process.arch}\n` +
    `Log file: ${LOG_FILE_PATH}\n` +
    `Node version: ${process.version}\n` +
    `Electron version: ${process.versions.electron}\n` +
    `=========================================\n`;
  
  try {
    fs.appendFileSync(LOG_FILE_PATH, startupMessage);
  } catch (e) {
    // Try home directory directly
    LOG_FILE_PATH = path.join(os.homedir(), 'strands-agent.log');
    fs.appendFileSync(LOG_FILE_PATH, startupMessage);
  }
  
  try {
    // Create write stream for buffered logging (faster for normal operation)
    logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });
    
    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const writeToFile = (level, ...args) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      const logLine = `[${timestamp}] [${level}] ${message}\n`;
      
      // Write to stream (buffered, fast)
      if (logFileStream) {
        logFileStream.write(logLine);
      }
      
      // For ERROR level, also write synchronously to guarantee it's saved
      if (level === 'ERROR') {
        try {
          fs.appendFileSync(LOG_FILE_PATH, `[${timestamp}] [${level}-SYNC] ${message}\n`);
        } catch (e) {
          // Ignore sync write failures - we already have the buffered write
        }
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
    
    logsInitialized = true;
    console.log('Logging initialized successfully at:', LOG_FILE_PATH);
  } catch (error) {
    syncLog(`[ERROR] Failed to setup stream logging: ${error.message}\n${error.stack}`);
  }
}

// App Constants - Initialize on app ready
let sessionTempDir = null;
let videoMapPath = null;
let zoomVideoPath = null;

/**
 * Get the Zoom directory path for the current platform and ensure it exists
 * @returns {string} The path to the Zoom directory
 */
function getZoomDirectoryPath() {
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

  // Create the directory if it doesn't exist
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    console.log('Created Zoom directory:', directoryPath);
  }

  return directoryPath;
}

function initializeAppPaths() {

  if (!zoomVideoPath) {
    zoomVideoPath = getZoomDirectoryPath();
  }

  const platform = os.platform();

  if (!sessionTempDir) {
    try {
      // Initialize paths using platform-specific logic
      // Windows: C:\Users\<username>\AppData\Local\strands-agent\sessions
      // macOS: ~/Library/Application Support/strands-agent/sessions
      let baseDir;
      if (platform === 'win32') {
        // Use Local AppData on Windows (same as setupLogging)
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        baseDir = path.join(localAppData, 'strands-agent');
      } else {
        // Use userData for macOS/Linux (same as setupLogging)
        baseDir = app.getPath('userData');
      }
      
      sessionTempDir = path.join(baseDir, 'sessions');
      videoMapPath = path.join(baseDir, 'video-map.json');
      
      // Ensure base directory exists
      if (!fs.existsSync(baseDir)) {
        try {
          fs.mkdirSync(baseDir, { recursive: true });
          console.log('✓ Created base directory:', baseDir);
        } catch (mkdirError) {
          console.error('✗ Failed to create base directory:', mkdirError);
          console.error('Error details:', {
            code: mkdirError.code,
            errno: mkdirError.errno,
            path: mkdirError.path,
            syscall: mkdirError.syscall
          });
          throw mkdirError;
        }
      }
      
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

// Lambda Function URL for streaming agent responses
const LAMBDA_STREAMING_URL = process.env.LAMBDA_STREAMING_URL || 'https://qakcm2ekpcpuahjm7oazez76om0zssfs.lambda-url.us-east-1.on.aws/';

// FFmpeg setup - handle both dev and production paths
let ffmpegPath = null;
let ffmpeg = null;

function findFFmpegPath() {
  const defaultPath = require('@ffmpeg-installer/ffmpeg').path;
  console.log('FFmpeg default path from @ffmpeg-installer:', defaultPath);
  
  // Check if default path exists and is executable (not in ASAR)
  if (fs.existsSync(defaultPath) && !defaultPath.includes('app.asar')) {
    // On Unix systems, ensure execute permissions
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(defaultPath, 0o755);
        console.log('Set execute permissions on FFmpeg');
      } catch (e) {
        console.warn('Could not set execute permissions:', e.message);
      }
    }
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
    // macOS paths - detect architecture for universal builds
    const arch = process.arch; // 'arm64' for Apple Silicon, 'x64' for Intel
    const primaryArch = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    const fallbackArch = arch === 'arm64' ? 'darwin-x64' : 'darwin-arm64';
    
    console.log('macOS detected architecture:', arch);
    console.log('Primary FFmpeg arch:', primaryArch);
    
    if (process.resourcesPath) {
      // Try primary architecture first
      possiblePaths.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', primaryArch, 'ffmpeg'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', fallbackArch, 'ffmpeg')
      );
    }
    // Also try relative to current file location (like Windows)
    possiblePaths.push(
      path.join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', primaryArch, 'ffmpeg'),
      path.join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', fallbackArch, 'ffmpeg'),
      path.join(__dirname, '..', '..', 'node_modules', '@ffmpeg-installer', primaryArch, 'ffmpeg'),
      path.join(__dirname, '..', '..', 'node_modules', '@ffmpeg-installer', fallbackArch, 'ffmpeg')
    );
    // Try system FFmpeg as last resort
    possiblePaths.push('/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg');
  } else {
    // Linux paths
    if (process.resourcesPath) {
      possiblePaths.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg')
      );
    }
    possiblePaths.push(
      path.join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
      path.join(__dirname, '..', '..', 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
      '/usr/bin/ffmpeg'
    );
  }
  
  console.log('Searching for FFmpeg in paths:', possiblePaths);
  
  // Try each path
  for (const altPath of possiblePaths) {
    if (fs.existsSync(altPath)) {
      console.log('Found FFmpeg at:', altPath);
      // On Unix systems, ensure execute permissions
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(altPath, 0o755);
          console.log('Set execute permissions on FFmpeg');
        } catch (e) {
          console.warn('Could not set execute permissions:', e.message);
        }
      }
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
        console.log('Index found:', index);
        return index;
      }
    }
    
    console.log('Index not found, creating index');

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
    console.log('=== _index_video STARTED ===');
    console.log('Filepath:', filepath);
    console.log('Platform:', process.platform);
    console.log('Index ID:', index.id);
    
    // Verify file exists
    if (!fs.existsSync(filepath)) {
      throw new Error(`Video file does not exist: ${filepath}`);
    }
    
    // Get file stats
    const fileStats = fs.statSync(filepath);
    console.log('File size:', (fileStats.size / (1024 * 1024)).toFixed(2), 'MB');
    
    if (fileStats.size === 0) {
      throw new Error('Video file is empty');
    }
    
    // Check file is readable
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      console.log('✓ File is readable');
    } catch (accessError) {
      throw new Error(`Cannot read video file (permission denied?): ${accessError.message}`);
    }

    console.log('Creating TwelveLabs client...');
    const twelvelabsClient = new TwelveLabs({
      apiKey: apiKey
    });
    console.log('✓ TwelveLabs client created');

    // For macOS compatibility: read file into buffer first, then create stream from buffer
    // This avoids potential issues with macOS file stream handling in VMs
    let videoFileStream;
    if (process.platform === 'darwin') {
      console.log('macOS detected - reading file into buffer first for reliability...');
      const { Readable } = require('stream');
      const fileBuffer = await fsp.readFile(filepath);
      console.log('✓ File read into buffer:', fileBuffer.length, 'bytes');
      
      // Create a readable stream from the buffer
      videoFileStream = new Readable();
      videoFileStream.push(fileBuffer);
      videoFileStream.push(null);
      console.log('✓ Created stream from buffer');
    } else {
      // Windows/Linux - use regular file stream
      console.log('Creating video file stream...');
      videoFileStream = fs.createReadStream(filepath);
      console.log('✓ Video file stream created');
    }

    console.log('Calling twelvelabsClient.tasks.create...');
    console.log('This may take a while for large files...');

    const indexTask = await twelvelabsClient.tasks.create({
      indexId: index.id,
      videoFile: videoFileStream,
      enableVideoStream: true,
    })

    console.log('✓ Task created:', indexTask.id);
    console.log('Waiting for task to complete...');

    const task = await twelvelabsClient.tasks.waitForDone(indexTask.id, {
      timeout: 3,
      callback: (task) => {
        console.log('Status:', task.status);
      }
    })

    console.log('✓ Task completed:', task.status);

    const videoTaskContent = await twelvelabsClient.tasks.retrieve(indexTask.id);

    if (!videoTaskContent || !videoTaskContent.hls || !videoTaskContent.hls.videoUrl || !videoTaskContent.videoId || !videoTaskContent.indexId || !videoTaskContent.createdAt) {
      throw new Error('Failed to retrieve video task content');
    }

    console.log('=== _index_video COMPLETED ===');

    return {
      hlsUrl: videoTaskContent.hls.videoUrl,
      videoId: videoTaskContent.videoId,
      indexId: videoTaskContent.indexId,
      createdAt: videoTaskContent.createdAt,
    }

  } catch (error) {
    // Log full error details for debugging
    console.error('=== _index_video FAILED ===');
    console.error('Error in _index_video:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      error: error
    });
    // Re-throw the error so the caller can handle it properly
    throw error;
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
  // Generate random session ID - ensure it's at least 33 characters
  let sessionId = crypto.randomUUID();
  
  // crypto.randomUUID() always returns 36 characters, but ensure minimum 33 for robustness
  if (sessionId.length < 33) {
    // If somehow shorter, append random hex characters to reach 33+
    const additionalChars = crypto.randomBytes(Math.ceil((33 - sessionId.length) / 2)).toString('hex');
    sessionId = sessionId + additionalChars.substring(0, 33 - sessionId.length);
  }
  
  agentSessionId = sessionId;
  return sessionId;
}

function _get_agent_session() {
  // Return current session ID without creating a new one
  return agentSessionId;
}

async function _end_agent_session() {
  // Cannot end lol
  agentSessionId = null;
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

      console.log('Invoking agent via Lambda Function URL with session:', agentSessionId);
      console.log('Input text preview:', prompt_template.substring(0, 200) + '...');
      console.log('Lambda URL:', LAMBDA_STREAMING_URL);

      // Call Lambda Function URL instead of AWS SDK
      const lambdaUrl = new URL(LAMBDA_STREAMING_URL);
      const isHttps = lambdaUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      // Prepare request body
      const requestBody = JSON.stringify({
        runtimeSessionId: agentSessionId,
        prompt: prompt_template
      });

      // Make streaming HTTP request to Lambda
      await new Promise((resolve, reject) => {
        const options = {
          hostname: lambdaUrl.hostname,
          port: lambdaUrl.port || (isHttps ? 443 : 80),
          path: lambdaUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        };

        const req = httpModule.request(options, (res) => {
          // Check for HTTP errors
          if (res.statusCode >= 400) {
            let errorBody = '';
            res.on('data', (chunk) => { errorBody += chunk.toString(); });
            res.on('end', () => {
              try {
                const error = JSON.parse(errorBody);
                const errorMessage = error.error || `HTTP ${res.statusCode}: ${errorBody}`;
                console.error('Lambda HTTP error:', errorMessage);
                
                // If it's a ValidationException about tool results, reset the session
                if (errorMessage.includes('ValidationException') && errorMessage.includes('toolResult')) {
                  console.log('Tool result mismatch detected - resetting session');
                  agentSessionId = null;
                  runtimeClient = null;
                }
                
                if (streamBackToUser) {
                  event.sender.send('prompt-strands-agent-error', errorMessage);
                }
                reject(new Error(errorMessage));
              } catch (e) {
                reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
              }
            });
            return;
          }

          // Handle streaming SSE response
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          res.on('data', (chunk) => {
            buffer += decoder.decode(chunk, { stream: true });
            
            // Process complete lines (SSE format)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

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
                  
                  // Check for errors in SSE data
                  if (cleanedData && typeof cleanedData === 'object' && cleanedData.error) {
                    const errorMsg = cleanedData.error;
                    console.error('Error in SSE stream:', errorMsg);
                    
                    // If it's a ValidationException about tool results, reset the session
                    if (errorMsg.includes('ValidationException') && errorMsg.includes('toolResult')) {
                      console.log('Tool result mismatch detected - resetting session');
                      agentSessionId = null;
                      runtimeClient = null;
                    }
                    
                    if (streamBackToUser) {
                      event.sender.send('prompt-strands-agent-error', errorMsg);
                    }
                    reject(new Error(errorMsg));
                    return;
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
          });

          res.on('end', () => {
            // Process any remaining buffer
            if (buffer && buffer.trim()) {
              const trimmedBuffer = buffer.trim();
              if (trimmedBuffer.startsWith('data: ')) {
                const data = trimmedBuffer.substring(6);
                let cleanedData = data;
                if (data.startsWith('"') && data.endsWith('"')) {
                  try {
                    cleanedData = JSON.parse(data);
                  } catch (e) {
                    cleanedData = data.slice(1, -1);
                  }
                }
                if (cleanedData && cleanedData !== '[DONE]') {
                  if (streamBackToUser) {
                    event.sender.send('prompt-strands-agent-response', cleanedData);
                  }
                }
              } else if (!trimmedBuffer.startsWith(':')) {
                if (streamBackToUser) {
                  event.sender.send('prompt-strands-agent-response', trimmedBuffer);
                }
              }
            }
            
            if (streamBackToUser) {
              event.sender.send('prompt-strands-agent-complete');
            }
            resolve();
          });

          res.on('error', (error) => {
            console.error('Error reading Lambda response stream:', error);
            if (streamBackToUser) {
              event.sender.send('prompt-strands-agent-error', error.message);
            }
            reject(error);
          });
        });

        req.on('error', (error) => {
          console.error('Error making Lambda request:', error);
          if (streamBackToUser) {
            event.sender.send('prompt-strands-agent-error', error.message);
          }
          reject(error);
        });

        // Send request body
        req.write(requestBody);
        req.end();
      });

    } catch (error) {
      console.error('Error prompting strands agent:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Extract error message - check for nested error messages
      let errorMessage = error.message || 'Unknown error occurred';
      if (error.message && error.message.includes('EventLoopExecution')) {
        errorMessage = 'An error occurred in the agent backend. This may be due to an async event loop issue.';
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
      // Get Zoom directory path and ensure it exists
      const directoryPath = getZoomDirectoryPath();

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

      const index = await _check_index(apiKey);
      const videoContent = await _index_video(apiKey, index, filepath);

      // Check if videoContent is null or invalid
      if (!videoContent) {
        throw new Error('Video indexing returned null or invalid content');
      }

      videoMap[videoFileHash] = videoContent;
      await fsp.writeFile(videoMapPath, JSON.stringify(videoMap, null, 2));

      videoContent['hash'] = videoFileHash;

      return {
        success: true,
        content: videoContent
      }

    } catch (error) {
      // Extract error message more robustly
      let errorMessage = 'Unknown error occurred';
      if (error) {
        if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (error.toString && typeof error.toString === 'function') {
          errorMessage = error.toString();
        } else {
          // Try to stringify the error object
          try {
            errorMessage = JSON.stringify(error);
          } catch (e) {
            errorMessage = 'Error object could not be serialized';
          }
        }
      }
      
      console.error('Error indexing video:', {
        message: errorMessage,
        error: error,
        stack: error?.stack,
        name: error?.name
      });
      
      return {
        success: false,
        error: errorMessage,
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
        // Get Zoom directory path and ensure it exists
        const directoryPath = getZoomDirectoryPath();
    
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

