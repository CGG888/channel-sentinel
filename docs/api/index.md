# API 文档

## 认证接口

### 获取 GitHub 关联状态

```
GET /api/auth/github/status
```

**响应：**

```json
{
  "connected": true,
  "username": "github_user",
  "connectedAt": "2026-03-22T10:00:00Z"
}
```

### 发起 GitHub OAuth

```
GET /api/auth/github/begin
```

**响应：**

```json
{
  "success": true,
  "redirectUrl": "https://github.com/login/oauth/authorize?..."
}
```

### 处理 OAuth 回调

```
GET /api/auth/github/callback?code=xxx&state=xxx
```

### 断开 GitHub 关联

```
DELETE /api/auth/github/disconnect
```

---

## 回放规则接口

### 检查规则更新

```
GET /api/replay-rules/check-update
```

**响应：**

```json
{
  "hasUpdate": true,
  "latestVersion": "1.0.1",
  "currentVersion": "1.0.0",
  "changelog": ["新增广东电信规则"]
}
```

### 获取规则库

```
GET /api/replay-rules/library
```

**响应：**

```json
{
  "success": true,
  "latest": "1.0.0",
  "versions": [
    {
      "version": "1.0.0",
      "published_at": "2026-03-17",
      "changelog": ["Initial release"],
      "total_rules": 2
    }
  ]
}
```

### 应用远程规则

```
POST /api/replay-rules/apply-remote
Content-Type: application/json

{
  "version": "1.0.0"
}
```

**响应：**

```json
{
  "success": true,
  "version": "1.0.0",
  "snapshotId": "snapshot_xxx",
  "baseRulesCount": 2,
  "timeRulesCount": 15
}
```

---

## 贡献接口

### 提交规则

```
POST /api/replay-rules/contributions
Content-Type: application/json
Authorization: Bearer <github_token>

{
  "province": "广东",
  "operator": "电信",
  "city": "广州",
  "m3uLine": "#EXTINF:-1 tvg-name=\"频道\" ... http://...",
  "description": "可选说明"
}
```

**响应：**

```json
{
  "success": true,
  "issueUrl": "https://github.com/CGG888/channel-sentinel/issues/10#issuecomment-xxx",
  "commentId": "123456789"
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| `AUTH_REQUIRED` | 需要登录 GitHub |
| `INVALID_TOKEN` | GitHub Token 无效 |
| `NETWORK_ERROR` | 网络请求失败 |
| `RULE_NOT_FOUND` | 规则文件不存在 |
| `VERSION_NOT_FOUND` | 指定版本不存在 |
