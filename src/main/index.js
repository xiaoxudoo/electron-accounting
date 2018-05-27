'use strict'

import { app, BrowserWindow } from 'electron'

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
  global.__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
}

let mainWindow
const winURL = process.env.NODE_ENV === 'development'
  ? `http://localhost:9080`
  : `file://${__dirname}/index.html`

function createWindow() {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    height: 563,
    useContentSize: true,
    width: 1000
  })
  mainWindow.webContents.openDevTools()

  mainWindow.loadURL(winURL)

  mainWindow.webContents.session.on('will-download', function (event, item, webContents) {
    // Set the save path, making Electron not to prompt a save dialog.
    const filename = item.getFilename();
    item.setSavePath(`/tmp/${filename}`);
    console.log(item.getMimeType());
    console.log(item.getFilename());
    console.log(item.getTotalBytes());
    item.on('updated', function () {
      console.log('Received bytes: ' + item.getReceivedBytes());
    });
    item.on('done', function (e, state) {
      if (state == "completed") {
        console.log("Download successfully");
      } else {
        console.log("Download is cancelled or interrupted that can't be resumed");
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null
  })

}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

/**
 * Auto Updater
 *
 * Uncomment the following code below and install `electron-updater` to
 * support auto updating. Code Signing with a valid certificate is required.
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-electron-builder.html#auto-updating
 */

/*
import { autoUpdater } from 'electron-updater'

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') autoUpdater.checkForUpdates()
})
 */
