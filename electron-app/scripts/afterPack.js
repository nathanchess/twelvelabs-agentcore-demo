const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  // Only run for macOS builds
  if (context.electronPlatformName !== 'darwin') {
    console.log('Skipping afterPack permissions (not macOS)');
    return;
  }
  
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  
  console.log('=== afterPack: Setting execute permissions ===');
  console.log('App path:', appPath);
  
  try {
    // Set execute permissions on main binary
    const macosPath = path.join(appPath, 'Contents', 'MacOS');
    if (fs.existsSync(macosPath)) {
      console.log('Setting +x on MacOS binaries...');
      execSync(`chmod -R +x "${macosPath}"`, { stdio: 'inherit' });
    }
    
    // Set execute permissions on Frameworks
    const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
    if (fs.existsSync(frameworksPath)) {
      console.log('Setting +x on Frameworks...');
      execSync(`chmod -R +x "${frameworksPath}"`, { stdio: 'inherit' });
    }
    
    // Set execute permissions on unpacked resources (FFmpeg, etc.)
    const unpackedPath = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked');
    if (fs.existsSync(unpackedPath)) {
      console.log('Setting +x on app.asar.unpacked...');
      execSync(`chmod -R +x "${unpackedPath}"`, { stdio: 'inherit' });
    }
    
    // Specifically ensure FFmpeg binaries are executable
    const ffmpegPaths = [
      path.join(unpackedPath, 'node_modules', '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'),
      path.join(unpackedPath, 'node_modules', '@ffmpeg-installer', 'darwin-x64', 'ffmpeg'),
    ];
    
    for (const ffmpegPath of ffmpegPaths) {
      if (fs.existsSync(ffmpegPath)) {
        console.log('Setting +x on FFmpeg:', ffmpegPath);
        execSync(`chmod +x "${ffmpegPath}"`, { stdio: 'inherit' });
      }
    }
    
    console.log('✓ Execute permissions set successfully');
  } catch (error) {
    console.error('Warning: Failed to set some permissions:', error.message);
    // Don't fail the build, just warn
  }
};

