const DOMAIN_KEYS = ['detect', 'export', 'replay', 'player', 'config', 'persist', 'logs', 'auth', 'proxy', 'storage', 'app'];
const DEFAULT_SOPS = {
    detect: {
        owner: 'detect-owner',
        slaMinutes: 30,
        steps: ['检查探测入口可达性', '检查 ffprobe/网络时延', '重放失败样本并确认恢复']
    },
    export: {
        owner: 'export-owner',
        slaMinutes: 30,
        steps: ['检查导出参数与路由', '检查响应格式与编码', '回放导出请求样本']
    },
    replay: {
        owner: 'replay-owner',
        slaMinutes: 30,
        steps: ['检查规则命中与快照状态', '检查回看链路与代理', '回放命中样本并确认恢复']
    },
    player: {
        owner: 'player-owner',
        slaMinutes: 20,
        steps: ['检查播放内核状态', '检查代理与流地址有效性', '验证首帧与切台恢复']
    },
    config: {
        owner: 'config-owner',
        slaMinutes: 30,
        steps: ['检查配置读写接口', '检查持久化状态一致性', '验证前端设置回读']
    },
    persist: {
        owner: 'persist-owner',
        slaMinutes: 45,
        steps: ['检查备份与恢复任务', '检查存储模式与同步状态', '执行受控修复并复验']
    },
    logs: {
        owner: 'ops-owner',
        slaMinutes: 20,
        steps: ['检查日志流与文件写入', '检查采集筛选参数', '恢复后确认实时流稳定']
    },
    auth: {
        owner: 'auth-owner',
        slaMinutes: 20,
        steps: ['检查登录与鉴权接口', '检查会话状态与cookie', '回放登录契约并复验']
    },
    proxy: {
        owner: 'proxy-owner',
        slaMinutes: 30,
        steps: ['检查代理健康状态', '检查超时与重试策略', '回放代理链路样本']
    },
    storage: {
        owner: 'storage-owner',
        slaMinutes: 45,
        steps: ['检查读写模式与队列', '检查同步与修复任务', '核对数据一致性']
    },
    app: {
        owner: 'platform-owner',
        slaMinutes: 60,
        steps: ['检查全局依赖与服务状态', '检查异常分布与热点', '执行分域恢复与回归']
    }
};

function asDomainKey(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return 'app';
    if (raw.includes('detect') || raw.includes('stream')) return 'detect';
    if (raw.includes('export')) return 'export';
    if (raw.includes('replay') || raw.includes('catchup') || raw.includes('epg')) return 'replay';
    if (raw.includes('player')) return 'player';
    if (raw.includes('config') || raw.includes('setting')) return 'config';
    if (raw.includes('persist') || raw.includes('webdav')) return 'persist';
    if (raw.includes('log')) return 'logs';
    if (raw.includes('auth') || raw.includes('login') || raw.includes('captcha')) return 'auth';
    if (raw.includes('proxy')) return 'proxy';
    if (raw.includes('storage') || raw.includes('sqlite') || raw.includes('json')) return 'storage';
    if (DOMAIN_KEYS.includes(raw)) return raw;
    return 'app';
}

function createDomainStats() {
    return {
        requests: 0,
        success2xx: 0,
        warn4xx: 0,
        error5xx: 0,
        totalLatencyMs: 0,
        p95Seed: [],
        lastRequestAt: '',
        lastPath: ''
    };
}

function percentile(values, p) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
    return sorted[idx];
}

function parseWhitelist(input) {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : String(input).split(',');
    return arr
        .map((x) => asDomainKey(x))
        .filter((x, i, all) => x && all.indexOf(x) === i);
}

class OpsObservability {
    constructor() {
        this.startedAt = new Date().toISOString();
        this.domains = {};
        this.incidents = [];
        this.maxLatencySamples = 300;
        for (const key of DOMAIN_KEYS) {
            this.domains[key] = createDomainStats();
        }
    }

    recordRequest(domain, statusCode, durationMs, requestPath = '') {
        const key = asDomainKey(domain);
        const stats = this.domains[key] || (this.domains[key] = createDomainStats());
        stats.requests += 1;
        const status = Number(statusCode || 0);
        if (status >= 500) stats.error5xx += 1;
        else if (status >= 400) stats.warn4xx += 1;
        else stats.success2xx += 1;
        const d = Number(durationMs || 0);
        if (Number.isFinite(d) && d >= 0) {
            stats.totalLatencyMs += d;
            stats.p95Seed.push(d);
            if (stats.p95Seed.length > this.maxLatencySamples) stats.p95Seed.shift();
        }
        stats.lastRequestAt = new Date().toISOString();
        stats.lastPath = String(requestPath || '');
        if (status >= 500) {
            this.openIncident({
                domain: key,
                severity: 'high',
                summary: `请求失败率告警：${status} ${stats.lastPath}`,
                source: 'http-status'
            });
        }
    }

    getDomainMetrics() {
        const output = {};
        for (const key of Object.keys(this.domains)) {
            const s = this.domains[key];
            const requests = Number(s.requests || 0);
            output[key] = {
                requests,
                success2xx: Number(s.success2xx || 0),
                warn4xx: Number(s.warn4xx || 0),
                error5xx: Number(s.error5xx || 0),
                errorRate: requests > 0 ? Number((Number(s.error5xx || 0) / requests).toFixed(4)) : 0,
                avgLatencyMs: requests > 0 ? Number((Number(s.totalLatencyMs || 0) / requests).toFixed(2)) : 0,
                p95LatencyMs: percentile(s.p95Seed || [], 0.95),
                lastRequestAt: s.lastRequestAt || '',
                lastPath: s.lastPath || ''
            };
        }
        return output;
    }

    getSopByDomain(domain) {
        const key = asDomainKey(domain);
        return {
            domain: key,
            ...(DEFAULT_SOPS[key] || DEFAULT_SOPS.app)
        };
    }

    getAllSops() {
        const all = {};
        for (const key of DOMAIN_KEYS) {
            all[key] = this.getSopByDomain(key);
        }
        return all;
    }

    openIncident(input = {}) {
        const domain = asDomainKey(input.domain);
        const severity = String(input.severity || 'medium').toLowerCase();
        const summary = String(input.summary || '').trim() || `incident-${domain}`;
        const source = String(input.source || 'manual');
        const active = this.incidents.find((x) => x.status === 'open' && x.domain === domain && x.summary === summary);
        if (active) return active;
        const sop = this.getSopByDomain(domain);
        const incident = {
            id: `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            domain,
            severity,
            summary,
            source,
            status: 'open',
            owner: sop.owner,
            slaMinutes: sop.slaMinutes,
            actions: sop.steps,
            openedAt: new Date().toISOString(),
            closedAt: '',
            closeNote: ''
        };
        this.incidents.unshift(incident);
        if (this.incidents.length > 200) this.incidents = this.incidents.slice(0, 200);
        return incident;
    }

    resolveIncident(incidentId, note = '') {
        const id = String(incidentId || '').trim();
        const incident = this.incidents.find((x) => x.id === id);
        if (!incident) return null;
        incident.status = 'closed';
        incident.closedAt = new Date().toISOString();
        incident.closeNote = String(note || '').trim();
        return incident;
    }

    getIncidentSummary(limit = 50) {
        const arr = this.incidents.slice(0, Math.max(1, Math.min(Number(limit || 50), 200)));
        return {
            total: this.incidents.length,
            open: this.incidents.filter((x) => x.status === 'open').length,
            closed: this.incidents.filter((x) => x.status === 'closed').length,
            list: arr
        };
    }

    snapshot() {
        return {
            generatedAt: new Date().toISOString(),
            startedAt: this.startedAt,
            metrics: this.getDomainMetrics(),
            incidents: this.getIncidentSummary(100)
        };
    }

    getLowFrequencyGovernance(options = {}) {
        const lowRequestThreshold = Math.max(1, Number(options.lowRequestThreshold || 30));
        const latencyThresholdMs = Math.max(1, Number(options.latencyThresholdMs || 3000));
        const whitelist = parseWhitelist(options.whitelist);
        const metrics = this.getDomainMetrics();
        const openIncidents = this.incidents.filter((x) => x.status === 'open');
        const byDomainOpen = {};
        for (const item of openIncidents) {
            byDomainOpen[item.domain] = Number(byDomainOpen[item.domain] || 0) + 1;
        }
        const domains = [];
        for (const [domain, metric] of Object.entries(metrics || {})) {
            const requests = Number(metric.requests || 0);
            const errorRate = Number(metric.errorRate || 0);
            const p95LatencyMs = Number(metric.p95LatencyMs || 0);
            const openIncidentCount = Number(byDomainOpen[domain] || 0);
            const lowFrequency = requests > 0 && requests <= lowRequestThreshold;
            const hasRiskSignal = errorRate > 0 || p95LatencyMs >= latencyThresholdMs || openIncidentCount > 0;
            if (!lowFrequency || !hasRiskSignal) continue;
            let score = 0;
            if (errorRate >= 0.2) score += 3;
            else if (errorRate > 0) score += 2;
            if (openIncidentCount > 0) score += 2;
            if (p95LatencyMs >= latencyThresholdMs) score += 1;
            let riskLevel = 'P3';
            let action = '观察';
            if (score >= 5) {
                riskLevel = 'P1';
                action = '冻结发布';
            } else if (score >= 3) {
                riskLevel = 'P2';
                action = '创建工单';
            }
            const isWhitelisted = whitelist.includes(domain);
            if (isWhitelisted && riskLevel === 'P1') {
                riskLevel = 'P2';
                action = '创建工单';
            } else if (isWhitelisted && riskLevel === 'P2') {
                riskLevel = 'P3';
                action = '观察';
            }
            const reasonParts = [];
            if (errorRate > 0) reasonParts.push(`errorRate=${errorRate}`);
            if (p95LatencyMs >= latencyThresholdMs) reasonParts.push(`p95LatencyMs=${p95LatencyMs}`);
            if (openIncidentCount > 0) reasonParts.push(`openIncidents=${openIncidentCount}`);
            domains.push({
                domain,
                requests,
                errorRate,
                p95LatencyMs,
                openIncidents: openIncidentCount,
                score,
                riskLevel,
                action,
                isWhitelisted,
                reason: reasonParts.join(', ')
            });
        }
        const sorted = domains.sort((a, b) => b.score - a.score || b.errorRate - a.errorRate || b.p95LatencyMs - a.p95LatencyMs);
        return {
            generatedAt: new Date().toISOString(),
            thresholds: {
                lowRequestThreshold,
                latencyThresholdMs
            },
            whitelist,
            summary: {
                totalRiskDomains: sorted.length,
                p1: sorted.filter((x) => x.riskLevel === 'P1').length,
                p2: sorted.filter((x) => x.riskLevel === 'P2').length,
                p3: sorted.filter((x) => x.riskLevel === 'P3').length
            },
            domains: sorted
        };
    }
}

module.exports = new OpsObservability();
