# Fasten Share Desktop

Electron 封装会启动打包后的 `fasten-share-client` Next.js Node 服务。Node 进程负责：

- 保存生产者后端配置和稳定 producerId；
- 与公开服务端建立生产者 WebSocket；
- 健康检查并转发模型请求；
- 为本机消费者工具写入公开 inference HTTP 地址。

构建前先在 `fasten-share-client` 执行 `npm run export:desktop`，再运行本目录的对应平台打包脚本。

## Auto Update

打包后的应用使用 `electron-updater`，会在启动后约 15 秒自动检查更新，之后每 6 小时检查一次。更新元数据默认从官网静态下载目录读取：

- Windows: `https://www.fastenshare.com/download/windows/latest.yml`
- macOS: `https://www.fastenshare.com/download/macos/latest-mac.yml`
- Linux: `https://www.fastenshare.com/download/linux/latest-linux.yml`

如果官网域名或目录变更，可以在打包/运行时通过 `FASTEN_SHARE_UPDATE_BASE_URL` 覆盖基础地址，例如 `https://example.com/download`。
macOS 自动更新需要发布 `zip` 产物及 `latest-mac.yml`，因此 macOS 打包脚本会同时生成 `dmg` 和 `zip`。
