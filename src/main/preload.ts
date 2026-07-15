import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_LANGUAGE_CHANNELS } from './language-bridge';

contextBridge.exposeInMainWorld('fastenShareDesktop', {
  getLanguage: () => ipcRenderer.invoke(DESKTOP_LANGUAGE_CHANNELS.get),
  setLanguage: (language: unknown) => ipcRenderer.invoke(DESKTOP_LANGUAGE_CHANNELS.set, language),
  onLanguageChanged: (listener: (language: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, language: unknown) => listener(language);
    ipcRenderer.on(DESKTOP_LANGUAGE_CHANNELS.changed, handler);
    return () => ipcRenderer.removeListener(DESKTOP_LANGUAGE_CHANNELS.changed, handler);
  },
});
