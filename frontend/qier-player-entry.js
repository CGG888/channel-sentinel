import Player from 'qier-player'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'

const defaultSources = [
  {
    url: 'http://12.12.12.254:5140/rtp/239.76.251.87:9000?fcc=124.232.149.47:15970',
    label: '组播-HD-50fps',
  },
  {
    url: 'http://12.12.12.254:5140/rtp/239.76.253.151:9000?fcc=124.232.149.47:15970',
    label: '组播-HD-50fps',
  },
  {
    url: 'http://12.12.12.254:5140/rtp/239.76.251.22:9000?fcc=124.232.149.47:15970',
    label: '组播-SD-25fps',
  },
  {
    url: 'http://12.12.12.254:5140/rtp/239.76.252.51:9000?fcc=124.232.149.47:15970',
    label: '组播-SD-25fps',
  },
  {
    url: 'http://124.232.231.172:8089/000000002000/201500000063/index.m3u8?zte_offset=30&ispcode=2&starttime=$单播',
    label: '单播-HD-50fps',
  },
]

function resolveUrl(rawUrl) {
  if (!rawUrl) return ''
  const isM3u8 = /\.m3u8(\?|$)/i.test(rawUrl) || rawUrl.indexOf('m3u8') > -1
  if (isM3u8) {
    return '/api/proxy/hls?url=' + encodeURIComponent(rawUrl)
  }
  return '/api/proxy/stream?url=' + encodeURIComponent(rawUrl)
}

export function createIptvPlayer(options = {}) {
  const mount = options.mount || '#app'
  const sources = options.sources || defaultSources.slice()

  const player = new Player({
    src: '',
    shortcutOptions: { disabled: false },
    ...options.playerOptions,
  })

  player.mount(mount)

  const video = player.video

  let currentKernel = null
  let rawUrl = ''
  const reco = { n: 0, t: null, stall: null }
  let currentSourceIndex = -1

  function resetReco() {
    reco.n = 0
    if (reco.t) {
      clearTimeout(reco.t)
      reco.t = null
    }
    if (reco.stall) {
      clearTimeout(reco.stall)
      reco.stall = null
    }
  }

  function scheduleReco(playUrl) {
    if (reco.n >= 5) return
    const d = Math.min(15000, Math.round(1000 * Math.pow(1.8, reco.n)))
    reco.n += 1
    if (reco.t) clearTimeout(reco.t)
    reco.t = setTimeout(() => {
      if (playUrl) {
        start(playUrl)
      }
    }, d)
  }

  function destroyKernel() {
    if (currentKernel) {
      try {
        currentKernel.unload && currentKernel.unload()
      } catch (_) {}
      try {
        currentKernel.detachMediaElement && currentKernel.detachMediaElement()
      } catch (_) {}
      try {
        currentKernel.destroy && currentKernel.destroy()
      } catch (_) {}
      currentKernel = null
    }
    if (video && video._hls) {
      try {
        video._hls.destroy()
      } catch (_) {}
      video._hls = null
    }
    if (video) {
      video.removeAttribute('src')
      video.load()
    }
  }

  function start(playUrl) {
    if (!playUrl || !video) return
    destroyKernel()
    resetReco()

    const isM3u8 = /\.m3u8(\?|$)/i.test(rawUrl) || rawUrl.indexOf('m3u8') > -1

    if (isM3u8) {
      if (Hls.isSupported()) {
        const h = new Hls({
          lowLatencyMode: false,
          capLevelToPlayerSize: true,
          backBufferLength: 30,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 8,
          maxBufferLength: 20,
          maxBufferHole: 1,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 5,
          fragLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
          manifestLoadingMaxRetry: 3,
          fragLoadingRetryDelay: 1000,
          levelLoadingRetryDelay: 1000,
          manifestLoadingRetryDelay: 1000,
        })
        currentKernel = h
        video._hls = h
        h.on(Hls.Events.MEDIA_ATTACHED, () => {
          resetReco()
        })
        h.on(Hls.Events.LEVEL_UPDATED, () => {
          resetReco()
        })
        h.on(Hls.Events.ERROR, (_, data) => {
          if (!data || !data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            scheduleReco(playUrl)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              h.recoverMediaError()
            } catch (_) {
              scheduleReco(playUrl)
            }
          } else {
            scheduleReco(playUrl)
          }
        })
        video.addEventListener(
          'playing',
          () => {
            resetReco()
          },
          { once: true, passive: true }
        )
        h.loadSource(playUrl)
        h.attachMedia(video)
        video.play && video.play().catch(() => {})
        return
      }
      video.src = playUrl
      video.onstalled = () => {
        if (reco.stall) clearTimeout(reco.stall)
        reco.stall = setTimeout(() => {
          video.load()
          video.play && video.play().catch(() => {})
        }, 15000)
      }
      video.onwaiting = video.onstalled
      video.play && video.play().catch(() => {})
      return
    }

    if (!mpegts.isSupported() || !mpegts.getFeatureList().mseLivePlayback) {
      video.src = playUrl
      video.play && video.play().catch(() => {})
      return
    }

    const mediaDataSource = {
      type: 'mse',
      isLive: true,
      url: playUrl,
      liveBufferLatencyChasing: true,
    }

    const config = {
      isLive: true,
      enableStashBuffer: true,
      stashInitialSize: 512 * 1024,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.2,
      liveBufferLatencyMinRemain: 0.5,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 120,
      autoCleanupMinBackwardDuration: 60,
      fixAudioTimestampGap: true,
      lazyLoad: false,
    }

    try {
      const kernel = mpegts.createPlayer(mediaDataSource, config)
      currentKernel = kernel
      kernel.attachMediaElement(video)
      kernel.load()
      kernel.play()
    } catch (_) {}
  }

  function selectSource(index, play) {
    if (!sources.length) return
    if (index < 0 || index >= sources.length) return
    currentSourceIndex = index
    const s = sources[index]
    rawUrl = s.url
    const playUrl = resolveUrl(rawUrl)
    updateSourceButtonLabel(s.label)
    if (play) {
      start(playUrl)
    }
  }

  let sourceBtn = null
  let sourcePanel = null

  function updateSourceButtonLabel(text) {
    if (sourceBtn) {
      sourceBtn.textContent = text
    }
  }

  function renderSourceUi() {
    const root = player.el
    if (!root) return
    const bars = root.querySelectorAll('div')
    let controller = null
    bars.forEach((el) => {
      if (controller) return
      if (el.className && el.className.indexOf('controller') !== -1) {
        controller = el
      }
    })
    if (!controller) {
      controller = root
    }
    sourceBtn = document.createElement('button')
    sourceBtn.className = 'iptv-source-btn'
    sourceBtn.type = 'button'
    sourceBtn.textContent = '选择线路'
    sourcePanel = document.createElement('div')
    sourcePanel.className = 'iptv-source-panel'
    sources.forEach((s, idx) => {
      const row = document.createElement('div')
      row.className = 'iptv-source-row'
      row.textContent = s.label
      row.addEventListener('click', (e) => {
        e.stopPropagation()
        hidePanel()
        selectSource(idx, true)
      })
      sourcePanel.appendChild(row)
    })
    sourceBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      togglePanel()
    })
    controller.appendChild(sourceBtn)
    controller.appendChild(sourcePanel)
    document.addEventListener('click', () => {
      hidePanel()
    })
  }

  function togglePanel() {
    if (!sourcePanel) return
    if (sourcePanel.style.display === 'block') {
      sourcePanel.style.display = 'none'
    } else {
      sourcePanel.style.display = 'block'
    }
  }

  function hidePanel() {
    if (!sourcePanel) return
    sourcePanel.style.display = 'none'
  }

  renderSourceUi()

  if (sources.length) {
    selectSource(0, true)
  }

  player.switchSourceByIndex = (idx) => {
    selectSource(idx, true)
  }

  player.switchSource = (url) => {
    rawUrl = url
    const playUrl = resolveUrl(rawUrl)
    start(playUrl)
  }

  return player
}

