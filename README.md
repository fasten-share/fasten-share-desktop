# Fasten Share Desktop

Electron 封装会启动打包后的 `fasten-share-client` Next.js Node 服务。Node 进程负责：

- 保存生产者后端配置和稳定 producerId；
- 与公开服务端建立生产者 WebSocket；
- 健康检查并转发模型请求；
- 为本机消费者工具写入公开 inference HTTP 地址。

构建前先在 `fasten-share-client` 执行 `npm run export:desktop`，再运行本目录的对应平台打包脚本。
