# 音云 API v1

`/api/v1` 是音云当前 V1 产品线的统一 REST/JSON 接口命名空间。它与服务端版本独立，但本次 `v1.4.0` 对旧 Web/管理接口进行了破坏性迁移。

## 原生客户端接口

- `GET /api/v1/capabilities`
- `GET /api/v1/openapi.json`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET|PUT /api/v1/sync/snapshot`
- `GET /api/v1/library/tracks`
- `GET /api/v1/library/tracks/{id}/stream`
- `GET /api/v1/library/tracks/{id}/cover`
- `GET /api/v1/search`
- `GET /api/v1/leaderboards`
- `GET /api/v1/artists/{id}`
- `GET /api/v1/albums/{id}`
- `POST /api/v1/tracks/resolve`
- `POST /api/v1/lyrics`
- `GET|POST /api/v1/playlists`
- `GET|POST /api/v1/downloads`
- `GET|POST /api/v1/replacement`
- `GET /api/v1/sources`
- `GET|POST /api/v1/shares`
- `GET /api/v1/events`

除登录和能力发现外，原生接口使用：

```http
Authorization: Bearer <accessToken>
```

## Web 与管理接口

- 管理后台：`/api/v1/admin/<path>`，例如 `GET /api/v1/admin/status`。
- Web 播放器音乐接口：`/api/v1/player/music/<path>`。
- Web 播放器用户与设置接口：`/api/v1/player/user/<path>`。
- Web 播放器自定义音源接口：`/api/v1/player/custom-source/<path>`。
- 音源更新：`POST /api/v1/player/custom-source/check-update` 检查远程脚本，`POST /api/v1/player/custom-source/update` 校验后备份并原位更新。
- Subsonic：`/rest/<path>`。

检查音源更新请求使用 `{ sourceId, sourceUrl?, allowUnsafeVM? }`。未提供 `sourceUrl` 时，服务端自动使用已保存的远程地址、音源运行时的更新链接和脚本声明的 `@updateUrl` / `@downloadUrl`；支持直接脚本及含下载链接的 JSON 更新信息，相对链接按更新接口地址解析。明确返回“已是最新版本”时，响应为 `available: false`。

只有确实没有可识别的地址时，响应才包含 `needsSourceUrl: true`，不能据此认为音源已经是最新版本。客户端此时可通过 `sourceUrl` 提供 HTTP/HTTPS 脚本下载地址或更新接口地址；新地址通过脚本及身份校验后保存，检查本身不会替换脚本。共享只读音源只能由所有者配置地址和更新。

## 破坏性迁移

裸 `/api/*` 已移除并返回 HTTP `410 Gone`，旧 Web 页面、旧 Windows 客户端和直接调用旧接口的脚本不能继续使用。详细升级步骤见 [API v1 迁移说明](api-v1-migration.md)。

本次升级不改变持久化目录结构，也不创建 `/api/v2`。部署前仍建议备份 `/server/data`、`/server/cache`、`/server/music` 和 `/server/logs`。
