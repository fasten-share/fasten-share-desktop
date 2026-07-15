export type DesktopLocale = 'en' | 'zh';

export interface DesktopMessages {
  tray: {
    show: string;
    checkForUpdates: string;
    checkingForUpdates: string;
    quit: string;
  };
  update: {
    openDownloadPage: string;
    cancel: string;
    automaticUpdateFailed: string;
    automaticUpdateFailedMessage: string;
    manualInstall: string;
    restartNow: string;
    later: string;
    ready: string;
    downloaded: (version: string) => string;
    restartToFinish: string;
    checkForUpdates: string;
    developmentUnavailable: string;
    installProductionBuild: string;
    newVersionAvailable: string;
    downloading: (version: string) => string;
    restartPrompt: string;
    latestVersion: string;
    currentVersion: (version: string) => string;
    checkFailed: string;
    temporarilyUnavailable: string;
    checkNetwork: string;
  };
}

const dictionaries: Record<DesktopLocale, DesktopMessages> = {
  en: {
    tray: {
      show: 'Show Fasten Share',
      checkForUpdates: 'Check for Updates…',
      checkingForUpdates: 'Checking for Updates…',
      quit: 'Quit',
    },
    update: {
      openDownloadPage: 'Open Download Page',
      cancel: 'Cancel',
      automaticUpdateFailed: 'Automatic Update Failed',
      automaticUpdateFailedMessage: 'Fasten Share could not restart automatically to finish the update.',
      manualInstall: 'Download the latest version from the official website and install it manually.',
      restartNow: 'Restart Now',
      later: 'Later',
      ready: 'Fasten Share Update Ready',
      downloaded: (version) => `Fasten Share ${version} has been downloaded.`,
      restartToFinish: 'Restart Fasten Share to finish the update.',
      checkForUpdates: 'Check for Updates',
      developmentUnavailable: 'Update checks are unavailable in development mode.',
      installProductionBuild: 'Install a production build and try again.',
      newVersionAvailable: 'New Version Available',
      downloading: (version) => `Fasten Share ${version} is downloading.`,
      restartPrompt: 'You will be prompted to restart and install when the download finishes.',
      latestVersion: 'You are using the latest version.',
      currentVersion: (version) => `Current version: ${version}`,
      checkFailed: 'Update Check Failed',
      temporarilyUnavailable: 'Unable to check for updates right now.',
      checkNetwork: 'Check your network connection and try again.',
    },
  },
  zh: {
    tray: {
      show: '显示 Fasten Share',
      checkForUpdates: '检查更新…',
      checkingForUpdates: '正在检查更新…',
      quit: '退出',
    },
    update: {
      openDownloadPage: '前往官网下载',
      cancel: '取消',
      automaticUpdateFailed: '自动更新失败',
      automaticUpdateFailedMessage: 'Fasten Share 未能自动重启并完成更新。',
      manualInstall: '请前往官网下载最新版本并手动安装。',
      restartNow: '立即重启',
      later: '稍后',
      ready: 'Fasten Share 更新已就绪',
      downloaded: (version) => `Fasten Share ${version} 已下载完成。`,
      restartToFinish: '重启 Fasten Share 即可完成更新。',
      checkForUpdates: '检查更新',
      developmentUnavailable: '开发环境不支持检查更新。',
      installProductionBuild: '请安装正式打包版本后再试。',
      newVersionAvailable: '发现新版本',
      downloading: (version) => `Fasten Share ${version} 正在下载。`,
      restartPrompt: '下载完成后会提示你重启并安装。',
      latestVersion: '当前已是最新版本。',
      currentVersion: (version) => `当前版本：${version}`,
      checkFailed: '检查更新失败',
      temporarilyUnavailable: '暂时无法检查更新。',
      checkNetwork: '请检查网络连接后重试。',
    },
  },
};

export function resolveDesktopLocale(systemLocale?: string): DesktopLocale {
  return systemLocale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getDesktopMessages(systemLocale?: string): DesktopMessages {
  return dictionaries[resolveDesktopLocale(systemLocale)];
}
