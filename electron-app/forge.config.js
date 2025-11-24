const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'Strands Agent',
    executableName: 'strands-agent',
    icon: './build/icon', // Will use .ico on Windows, .icns on macOS
    asar: true,
    extraResource: [
      './resources/**'
    ],
    ignore: [
      /^\/src/,
      /^\/electron\.vite\.config/,
      /^\/\.eslintcache/,
      /^\/\.prettierrc/,
      /^\/README\.md/,
      /^\/CHANGELOG\.md/,
      /^\/dev-app-update\.yml/,
      /^\/\.env/,
      /^\/\.env\.\*/,
      /^\/\.npmrc/,
      /^\/pnpm-lock\.yaml/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'strands-agent',
        authors: 'TwelveLabs',
        description: 'TwelveLabs Strands Agent - Video Analysis Desktop Application'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'] // macOS
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'TwelveLabs',
          homepage: 'https://twelvelabs.io'
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'TwelveLabs',
          homepage: 'https://twelvelabs.io'
        }
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    },
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main/index.js',
            config: 'electron.vite.config.mjs'
          },
          {
            entry: 'src/preload/index.js',
            config: 'electron.vite.config.mjs'
          }
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'electron.vite.config.mjs'
          }
        ]
      }
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};