# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /build

# 设置环境变量
ENV NODE_ENV=production

# 复制 package 文件
COPY package*.json ./

# 安装生产环境依赖
# 使用 npm ci 确保依赖版本一致性，速度更快
RUN npm ci --omit=dev --no-optional || npm install --omit=dev --no-optional

# 复制源代码
COPY . .

# 最终阶段
FROM node:18-alpine

# 安装 ffmpeg, tini, git 和 CA 证书（用于 HTTPS 外网访问）
# --no-cache 避免缓存占用空间
RUN apk add --no-cache ffmpeg tini git ca-certificates && update-ca-certificates

WORKDIR /app

# 只从构建阶段复制必要的文件
COPY --from=builder /build/package.json .
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/src ./src
COPY --from=builder /build/public ./public

# 创建数据目录并设置权限
RUN mkdir -p /app/data && chown -R node:node /app

# 切换到非 root 用户（使用基础镜像内置的 node 用户，通常为 1000:1000）
USER node

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production

# 使用 tini 作为入口点，处理信号转发（如 Ctrl+C）
ENTRYPOINT ["/sbin/tini", "--"]

# 启动应用
CMD ["npm", "start"]
