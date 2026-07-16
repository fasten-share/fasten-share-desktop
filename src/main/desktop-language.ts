import { app, ipcMain } from 'electron';
import { getDesktopMessages, resolveDesktopLocale, type DesktopLocale } from './i18n';
import { DESKTOP_LANGUAGE_CHANNELS } from './language-bridge';

type LanguageChangeListener = (language: DesktopLocale) => void;

let selectedDesktopLocale: DesktopLocale | undefined;
const languageChangeListeners = new Set<LanguageChangeListener>();

export function getDesktopLanguage(): DesktopLocale {
  return selectedDesktopLocale ?? resolveDesktopLocale(app.getLocale());
}

export function getMessages() {
  return getDesktopMessages(getDesktopLanguage());
}

export function onDesktopLanguageChanged(listener: LanguageChangeListener): () => void {
  languageChangeListeners.add(listener);
  return () => languageChangeListeners.delete(listener);
}

export function setDesktopLanguage(language: unknown): DesktopLocale {
  if (language !== 'en' && language !== 'zh') return getDesktopLanguage();
  selectedDesktopLocale = language;
  for (const listener of languageChangeListeners) listener(language);
  return language;
}

export function configureLanguageBridge(): void {
  ipcMain.handle(DESKTOP_LANGUAGE_CHANNELS.get, () => getDesktopLanguage());
  ipcMain.handle(DESKTOP_LANGUAGE_CHANNELS.set, (_event, language: unknown) => (
    setDesktopLanguage(language)
  ));
}
