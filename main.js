/**
 @license
 Copyright (c) 2022 Jeongkyu Shin, All rights reserved.
 Copyright (c) 2015-2022 Lablup Inc. All rights reserved.
 */
const {app, Menu, shell, BrowserWindow, protocol, clipboard, dialog, ipcMain} = require('electron');
const static = require('node-static');

process.env.electronPath = app.getAppPath();
function isDev() {
  return process.argv[2] == '--dev';
}
let debugMode = true;
if (isDev()) { // Dev mode from Makefile
  process.env.serveMode = 'dev'; // Prod OR debug
} else {
  process.env.serveMode = 'prod'; // Prod OR debug
  debugMode = false;
}
process.env.liveDebugMode = false; // Special flag for live server debug.
const url = require('url');
const path = require('path');
const nfs = require('fs');
const npjoin = require('path').join;
const BASE_DIR = __dirname;
let versions; let es6Path; let electronPath; let mainIndex;
let localServer;
if (process.env.serveMode == 'dev') {
  versions = require('./version');
  es6Path = npjoin(__dirname, 'build/electron-app/app'); // ES6 module loader with custom protocol
  electronPath = npjoin(__dirname, 'build/electron-app');
  mainIndex = 'build/electron-app/app/index.html';
  console.log("test mode");
} else {
  versions = require('./app/version');
  es6Path = npjoin(__dirname, 'app'); // ES6 module loader with custom protocol
  electronPath = npjoin(__dirname);
  mainIndex = 'app/index.html';
}

const windowWidth = 1280;
const windowHeight = 1080;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let mainContent;
let devtools;
let mainURL;

app.once('ready', function() {
  let template;
  if (process.platform === 'darwin') {
    template = [
      {
        label: 'SnakeBarrel',
        submenu: [
          {
            label: 'App version ' + versions.package +' (rev.' + versions.revision + ')',
            click: function() {
              clipboard.writeText(versions.package +' (rev.' + versions.revision + ')');
              const response = dialog.showMessageBox({type: 'info', message: 'Version information is copied to clipboard.'});
            }
          },
          {
            type: 'separator'
          },
          {
            label: 'Services',
            submenu: []
          },
          {
            type: 'separator'
          },
          {
            label: 'Hide Backend.AI Console',
            accelerator: 'Command+H',
            selector: 'hide:'
          },
          {
            label: 'Hide Others',
            accelerator: 'Command+Shift+H',
            selector: 'hideOtherApplications:'
          },
          {
            label: 'Show All',
            selector: 'unhideAllApplications:'
          },
          {
            type: 'separator'
          },
          {
            label: 'Quit',
            accelerator: 'Command+Q',
            click: function() {
              app.quit();
            }
          },
        ]
      },
      {
        label: 'Edit',
        submenu: [
          {
            label: 'Cut',
            accelerator: 'Command+X',
            selector: 'cut:'
          },
          {
            label: 'Copy',
            accelerator: 'Command+C',
            selector: 'copy:'
          },
          {
            label: 'Paste',
            accelerator: 'Command+V',
            selector: 'paste:'
          },
          {
            label: 'Select All',
            accelerator: 'Command+A',
            selector: 'selectAll:'
          },
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Zoom In',
            accelerator: 'Command+=',
            role: 'zoomin'
          },
          {
            label: 'Zoom Out',
            accelerator: 'Command+-',
            role: 'zoomout'
          },
          {
            label: 'Actual Size',
            accelerator: 'Command+0',
            role: 'resetzoom'
          },
          {
            label: 'Toggle Full Screen',
            accelerator: 'Ctrl+Command+F',
            click: function() {
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
              }
            }
          },
        ]
      },
      {
        label: 'Window',
        submenu: [
          {
            label: 'Minimize',
            accelerator: 'Command+M',
            selector: 'performMiniaturize:'
          },
          {
            label: 'Close',
            accelerator: 'Command+W',
            selector: 'performClose:'
          },
          {
            type: 'separator'
          },
          {
            label: 'Bring All to Front',
            selector: 'arrangeInFront:'
          },
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Online Manual',
            click: function() {
              shell.openExternal('https://webui.docs.backend.ai/');
            }
          },
          {
            label: 'Backend.AI Project Site',
            click: function() {
              shell.openExternal('https://www.backend.ai/');
            }
          }
        ]
      }
    ];
  } else {
    template = [
      {
        label: '&File',
        submenu: [
          {
            label: '&Close',
            accelerator: 'Ctrl+W',
            click: function() {
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.close();
              }
            }
          },
        ]
      },
      {
        label: '&View',
        submenu: [
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+=',
            role: 'zoomin'
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            role: 'zoomout'
          },
          {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            role: 'resetzoom'
          },
          {
            label: 'Toggle &Full Screen',
            accelerator: 'F11',
            role: 'togglefullscreen'
          },
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Online Manual',
            click: function() {
              shell.openExternal('https://webui.docs.backend.ai/');
            }
          },
          {
            label: 'Backend.AI Project Site',
            click: function() {
              shell.openExternal('https://www.backend.ai/');
            }
          }
        ]
      }
    ];
  }

  const appmenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appmenu);
});

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

function createWindow() {
  // Create the browser window.
  devtools = null;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    title: 'SnakeBarrel',
    frame: true,
    webPreferences: {
      nativeWindowOpen: true,
      nodeIntegration: false,
      devTools: (debugMode === true),
      worldSafeExecuteJavaScript: false,
      contextIsolation: false
    }
  });
  localServer = new static.Server(es6Path, { indexFile: "index.html" });
  const serverInstance = require('http').createServer(function (request, response) {
    request.addListener('end', function () {
      localServer.serve(request, response)
    }).resume()
  });
  // Set port number to 0 for autocast port. However, since the port number changes, indexedDB will not be shared between sessions.
  // Therefore I pin the port as specific number (9991).
  serverInstance.listen(9990, ()=> {
    console.log("server ready");
    let portNum = serverInstance.address().port;
    console.log(portNum);
    mainWindow.loadURL(url.format({
      pathname: '127.0.0.1:' + portNum,
      protocol: 'http',
      slashes: true
    }));
    mainContent = mainWindow.webContents;
  });
  if (debugMode === true) {
    devtools = new BrowserWindow();
    mainWindow.webContents.setDevToolsWebContents(devtools.webContents);
    mainWindow.webContents.openDevTools({mode: 'detach'});
  }
  // Emitted when the window is closed.
  mainWindow.on('close', (e) => {
      app.quit();
    }
  );

  mainWindow.on('closed', function() {
    console.log('closed');
    mainWindow = null;
    mainContent = null;
    devtools = null;
    app.quit();
  });
}

app.on('ready', () => {
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  console.log('all closed');
  app.quit();
});


app.on('activate', function() {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('certificate-error', function(event, webContents, url, error,
    certificate, callback) {
  event.preventDefault();
  callback(true);
});

// Let windows without node integration
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // Strip away preload scripts if unused or verify their location is legitimate
    delete webPreferences.preload;
    delete webPreferences.preloadURL;

    // Disable Node.js integration
    webPreferences.nodeIntegration = false;
  });
});
