import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Channel Sentinel',
  description: '智能 IPTV 频道检测与回放规则管理工具',
  srcDir: 'docs',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#667eea' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Channel Sentinel' }],
    ['meta', { name: 'og:description', content: '智能 IPTV 频道检测与回放规则管理工具' }]
  ],
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/logo.svg',
    repo: 'CGG888/channel-sentinel',
    repoLabel: 'GitHub',
    docsDir: 'docs',
    editLink: {
      pattern: 'https://github.com/CGG888/channel-sentinel/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: { dateOptions: { year: 'numeric', month: 'long', day: 'numeric' } }
    },
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/intro' },
      { text: 'WIKI', link: '/WIKI' },
      { text: '回放规则', link: '/replay-rules/' },
      { text: 'API', link: '/api/' },
      { text: '项目结构', link: '/project-structure' },
      { text: '更新日志', link: '/CHANGELOG' }
    ],
    sidebar: {
      '/': [
        {
          text: '指南',
          items: [
            { text: '介绍', link: '/guide/intro' },
            { text: '安装', link: '/guide/installation' },
            { text: '快速开始', link: '/guide/quickstart' },
            { text: '使用教程', link: '/guide/usage' }
          ]
        },
        {
          text: '完整文档',
          items: [
            { text: 'WIKI 使用指南', link: '/WIKI' },
            { text: '用户指南', link: '/USER_GUIDE' }
          ]
        },
        {
          text: '回放规则',
          items: [
            { text: '概述', link: '/replay-rules/' },
            { text: '规则格式', link: '/replay-rules/format' },
            { text: '社区贡献', link: '/replay-rules/community' },
            { text: '规则详情', link: '/replay-rules/rules' }
          ]
        },
        {
          text: 'API',
          items: [
            { text: 'API 文档', link: '/api/' }
          ]
        },
        {
          text: '其他',
          items: [
            { text: '项目结构', link: '/project-structure' },
            { text: 'CHANGELOG', link: '/CHANGELOG' }
          ]
        }
      ],
      '/replay-rules/': [
        {
          text: '回放规则',
          items: [
            { text: '概述', link: '/replay-rules/' },
            { text: '规则格式', link: '/replay-rules/format' },
            { text: '社区贡献', link: '/replay-rules/community' },
            { text: '规则详情', link: '/replay-rules/rules' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/CGG888/channel-sentinel' }
    ],
    footer: {
      message: '基于 MIT 许可证开源',
      copyright: 'Copyright © 2024-present Channel Sentinel'
    },
    search: {
      provider: 'local'
    }
  },
  markdown: {
    lineNumbers: false,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },
  vite: {
    server: {
      port: 3000
    }
  }
})
