const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fogMirror', {
    getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
    quit: () => ipcRenderer.send('quit-app')
});
