import { join } from 'node:path';
import { app, Menu, Tray } from 'electron';
import type { MenuItem } from 'electron';
import { getMessages, onDesktopLanguageChanged } from './desktop-language';

interface TrayActions {
  showWindow: () => void;
  checkForUpdates: () => void;
  quit: () => void;
}

const trayActions: TrayActions = {
  showWindow: () => undefined,
  checkForUpdates: () => undefined,
  quit: () => undefined,
};

let tray: Tray | undefined;
let checkForUpdatesMenuItem: MenuItem | undefined;
let updateCheckInFlight = false;

onDesktopLanguageChanged(() => refreshTrayMenu());

export function configureTrayActions(actions: TrayActions): void {
  Object.assign(trayActions, actions);
}

export function createTray(): void {
  const iconPath = join(app.getAppPath(), 'build', 'icons', 'icon-32.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Fasten Share');
  refreshTrayMenu();
  tray.on('click', trayActions.showWindow);
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  const messages = getMessages();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: messages.tray.show,
      click: trayActions.showWindow,
    },
    {
      id: 'check-for-updates',
      label: updateCheckInFlight
        ? messages.tray.checkingForUpdates
        : messages.tray.checkForUpdates,
      enabled: !updateCheckInFlight,
      click: trayActions.checkForUpdates,
    },
    { type: 'separator' },
    {
      label: messages.tray.quit,
      click: trayActions.quit,
    },
  ]);
  checkForUpdatesMenuItem = contextMenu.getMenuItemById('check-for-updates') ?? undefined;
  tray.setContextMenu(contextMenu);
}

export function setUpdateCheckInFlight(checking: boolean): void {
  updateCheckInFlight = checking;
  if (!checkForUpdatesMenuItem) return;
  const messages = getMessages();
  checkForUpdatesMenuItem.enabled = !checking;
  checkForUpdatesMenuItem.label = checking
    ? messages.tray.checkingForUpdates
    : messages.tray.checkForUpdates;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = undefined;
  checkForUpdatesMenuItem = undefined;
}
