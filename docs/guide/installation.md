# 安装

## Docker 部署（推荐）

### 快速启动

```bash
# 拉取镜像
docker pull cgg888/channel-sentinel:latest

# 运行容器
docker run -d \
  --name channel-sentinel \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  cgg888/channel-sentinel:latest
```

### 使用 Docker Compose

```yaml
version: '3.8'

services:
  channel-sentinel:
    image: cgg888/channel-sentinel:latest
    container_name: channel-sentinel
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./rules:/app/rules
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped
```

```bash
docker-compose up -d
```

## 源码运行

### 环境要求

| 要求 | 版本 |
|------|------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| SQLite | 3.x |

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/CGG888/channel-sentinel.git
cd channel-sentinel

# 安装依赖
npm install

# 复制配置
cp config.example.json config.json

# 启动服务
npm start
```

### 开发模式

```bash
npm run dev
```

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境 | `development` |
| `DATA_DIR` | 数据目录 | `./data` |
| `RULES_DIR` | 规则目录 | `./rules` |

### 配置文件

编辑 `config.json`：

```json
{
  "appSettings": {
    "github": {
      "oauth": {
        "clientId": "your_github_oauth_client_id",
        "callbackUrl": "http://localhost:3000/api/auth/github/callback"
      }
    }
  }
}
```

::: tip 提示
GitHub OAuth 配置请参考 [GitHub OAuth 应用设置](https://docs.github.com/en/developers/apps/creating-an-oauth-app)
:::
