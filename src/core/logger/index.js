const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'];
        this.LOG_DIR = path.join(__dirname, '../../../data/logs');
        this.LOG_LEVEL = 'info';
        this.LOG_KEEP_DAYS = 7;
        this.LOG_BUFFER_MAX = 2000;
        this.LOG_DAY = '';
        this.LOG_BUFFER = [];
        this.SSE_CLIENTS = [];
        
        this.ensureLogDir();
        this.pruneLogs();
    }

    setLevel(level) {
        if (this.LEVELS.includes(String(level).toLowerCase())) {
            this.LOG_LEVEL = String(level).toLowerCase();
        }
    }

    setKeepDays(days) {
        if (typeof days === 'number' && days >= 1 && days <= 90) {
            this.LOG_KEEP_DAYS = days;
        }
    }

    ensureLogDir() {
        try {
            if (!fs.existsSync(this.LOG_DIR)) {
                fs.mkdirSync(this.LOG_DIR, { recursive: true });
            }
        } catch (e) {
            // 忽略错误
        }
    }

    pad2(n) {
        return String(n).padStart(2, '0');
    }

    ts() {
        const d = new Date();
        const tz = -d.getTimezoneOffset();
        const sign = tz >= 0 ? '+' : '-';
        const ah = Math.floor(Math.abs(tz) / 60);
        const am = Math.abs(tz) % 60;
        return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}T${this.pad2(d.getHours())}:${this.pad2(d.getMinutes())}:${this.pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}${sign}${this.pad2(ah)}:${this.pad2(am)}`;
    }

    today() {
        const d = new Date();
        return `${d.getFullYear()}${this.pad2(d.getMonth() + 1)}${this.pad2(d.getDate())}`;
    }

    levelIdx(l) {
        const i = this.LEVELS.indexOf(String(l || 'info').toLowerCase());
        return i === -1 ? 3 : i;
    }

    withinLevel(l) {
        return this.levelIdx(l) <= this.levelIdx(this.LOG_LEVEL);
    }

    pruneLogs() {
        try {
            const files = fs.readdirSync(this.LOG_DIR).filter(f => /^app-\d{8}\.log$/.test(f));
            const map = files.map(f => ({
                f,
                t: +f.slice(4, 12)
            })).sort((a, b) => b.t - a.t);
            for (let i = this.LOG_KEEP_DAYS; i < map.length; i++) {
                try {
                    fs.unlinkSync(path.join(this.LOG_DIR, map[i].f));
                } catch (e) {
                    // 忽略错误
                }
            }
        } catch (e) {
            // 忽略错误
        }
    }

    appendFile(line) {
        this.ensureLogDir();
        const day = this.today();
        if (this.LOG_DAY !== day) {
            this.LOG_DAY = day;
            this.pruneLogs();
        }
        const file = path.join(this.LOG_DIR, `app-${day}.log`);
        try {
            fs.appendFileSync(file, line + '\n', 'utf-8');
        } catch (e) {
            // 忽略错误
        }
    }

    pushBuffer(obj) {
        this.LOG_BUFFER.push(obj);
        if (this.LOG_BUFFER.length > this.LOG_BUFFER_MAX) {
            this.LOG_BUFFER.shift();
        }
    }

    broadcast(obj) {
        const data = JSON.stringify(obj);
        const line = `data: ${data}\n\n`;
        this.SSE_CLIENTS.forEach(c => {
            try {
                const passes = this.levelIdx(obj.level) <= this.levelIdx(c.level) &&
                    (!c.module || c.module === 'all' || String(obj.module || '').toLowerCase() === c.module) &&
                    (!c.keyword || JSON.stringify(obj).toLowerCase().includes(c.keyword));
                if (passes) c.res.write(line);
            } catch (e) {
                // 忽略错误
            }
        });
    }

    logWrite(level, module, msg, data, reqId) {
        const lv = String(level).toLowerCase();
        const md = String(module || 'App');
        const t = this.ts();
        const obj = {
            time: t,
            level: lv.toUpperCase(),
            module: md,
            message: String(msg || ''),
            reqId: reqId || '',
            data: data === undefined ? null : data
        };
        this.pushBuffer(obj);
        const line = `${t} ${lv.toUpperCase()} ${md} ${reqId ? `reqId=${reqId} ` : ''}${obj.message}${obj.data ? ` data=${JSON.stringify(obj.data)}` : ''}`;
        if (this.withinLevel(lv)) {
            if (lv === 'error' || lv === 'fatal') {
                console.error(line);
            } else if (lv === 'warn') {
                console.warn(line);
            } else {
                console.log(line);
            }
        }
        this.appendFile(line);
        this.broadcast(obj);
    }

    fatal(m, module = 'App', data = null, reqId = '') {
        this.logWrite('fatal', module, m, data, reqId);
    }

    error(m, module = 'App', data = null, reqId = '') {
        this.logWrite('error', module, m, data, reqId);
    }

    warn(m, module = 'App', data = null, reqId = '') {
        this.logWrite('warn', module, m, data, reqId);
    }

    info(m, module = 'App', data = null, reqId = '') {
        this.logWrite('info', module, m, data, reqId);
    }

    debug(m, module = 'App', data = null, reqId = '') {
        this.logWrite('debug', module, m, data, reqId);
    }

    getSSEClients() {
        return this.SSE_CLIENTS;
    }

    getLogBuffer() {
        return this.LOG_BUFFER;
    }

    getLogLevel() {
        return this.LOG_LEVEL;
    }

    getKeepDays() {
        return this.LOG_KEEP_DAYS;
    }
}

// 创建单例实例
const loggerInstance = new Logger();

module.exports = loggerInstance;
