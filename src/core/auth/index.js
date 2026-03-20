const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const config = require('../../config');
const configReader = require('../../storage/config-reader');
const logger = require('../logger');

class AuthManager {
    constructor() {
        this.SESSIONS = new Map(); // token -> { username, expires }
        this.SESSION_TTL = 3650 * 24 * 60 * 60 * 1000; // 10年
        this.CAPTCHA_STORE = new Map(); // id -> { text, expires }
        this.CAPTCHA_TTL = 5 * 60 * 1000; // 5分钟
    }

    /**
     * 生成密码哈希（使用scrypt）
     * @param {string} plain 明文密码
     * @returns {string} 哈希字符串
     */
    hashPassword(plain) {
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(String(plain), salt, 32);
        return `s2:${salt.toString('base64')}:${key.toString('base64')}`;
    }

    /**
     * 验证密码
     * @param {string} plain 明文密码
     * @param {string} stored 存储的哈希
     * @returns {boolean}
     */
    verifyPassword(plain, stored) {
        if (!stored) return false;
        if (String(stored).startsWith('s2:')) {
            try {
                const [, saltB64, hashB64] = String(stored).split(':');
                const salt = Buffer.from(saltB64, 'base64');
                const key = crypto.scryptSync(String(plain), salt, 32);
                return crypto.timingSafeEqual(key, Buffer.from(hashB64, 'base64'));
            } catch (e) {
                return false;
            }
        }
        // 兼容旧版本（明文存储）
        return String(plain) === String(stored);
    }

    /**
     * 加载用户数据
     * @returns {object} 用户对象
     */
    async loadUsers() {
        const usersConfig = config.getConfig('users') || {};
        const sqliteUser = await configReader.loadUsersFallback(usersConfig);
        const merged = { ...(usersConfig || {}), ...(sqliteUser || {}) };
        const user = {
            username: String(merged && merged.username ? merged.username : 'admin'),
            passwordHash: String(merged && merged.passwordHash ? merged.passwordHash : ''),
            password: String(merged && merged.password ? merged.password : '')
        };
        if (user.passwordHash || user.password) {
            config.updateConfig('users', {
                username: user.username,
                ...(user.passwordHash ? { passwordHash: user.passwordHash } : {})
            });
            return user;
        }
        const defaultUser = {
            username: 'admin',
            passwordHash: this.hashPassword('admin')
        };
        await this.saveUsers(defaultUser);
        return defaultUser;
    }

    /**
     * 保存用户数据
     * @param {object} user 用户对象
     */
    async saveUsers(user) {
        // 仅持久化 username 与 passwordHash，避免明文
        const toSave = { username: user.username };
        if (user.passwordHash) {
            toSave.passwordHash = user.passwordHash;
        }
        config.updateConfig('users', toSave);
        await config.saveConfigStrict('users');
    }

    /**
     * 生成验证码
     * @returns {object} 包含验证码id和svg数据
     */
    generateCaptcha() {
        const captcha = svgCaptcha.create({
            size: 4,
            ignoreChars: '0o1i',
            noise: 2,
            color: true,
            background: '#f0f0f0'
        });
        const id = 'cap-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        // 5分钟有效期
        this.CAPTCHA_STORE.set(id, { 
            text: captcha.text.toLowerCase(), 
            expires: Date.now() + this.CAPTCHA_TTL 
        });

        // 简单清理过期验证码
        if (this.CAPTCHA_STORE.size > 1000) {
            const now = Date.now();
            for (const [k, v] of this.CAPTCHA_STORE) {
                if (now > v.expires) {
                    this.CAPTCHA_STORE.delete(k);
                }
            }
        }

        return { id, svg: captcha.data };
    }

    /**
     * 验证验证码
     * @param {string} captchaId 验证码ID
     * @param {string} captchaText 用户输入的验证码
     * @returns {boolean}
     */
    verifyCaptcha(captchaId, captchaText) {
        if (!captchaId || !this.CAPTCHA_STORE.has(captchaId)) {
            return false;
        }
        const stored = this.CAPTCHA_STORE.get(captchaId);
        this.CAPTCHA_STORE.delete(captchaId); // 验证码一次性有效

        if (!captchaText || captchaText.toLowerCase() !== stored.text) {
            return false;
        }
        return true;
    }

    /**
     * 创建会话
     * @param {string} username 用户名
     * @returns {string} token
     */
    createSession(username) {
        const token = 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        this.SESSIONS.set(token, { 
            username, 
            expires: Date.now() + this.SESSION_TTL 
        });
        return token;
    }

    /**
     * 验证会话
     * @param {string} token 会话token
     * @returns {object|null} 会话信息或null
     */
    verifySession(token) {
        if (!token || !this.SESSIONS.has(token)) {
            return null;
        }
        const session = this.SESSIONS.get(token);
        if (Date.now() > session.expires) {
            this.SESSIONS.delete(token);
            return null;
        }
        return session;
    }

    /**
     * 销毁会话
     * @param {string} token 会话token
     */
    destroySession(token) {
        if (token) {
            this.SESSIONS.delete(token);
        }
    }

    /**
     * 用户登录
     * @param {string} username 用户名
     * @param {string} password 密码
     * @param {string} captchaId 验证码ID
     * @param {string} captchaText 验证码文本
     * @returns {object} 登录结果
     */
    async login(username, password, captchaId, captchaText) {
        // 验证验证码
        if (!this.verifyCaptcha(captchaId, captchaText)) {
            return { success: false, message: '验证码错误或已失效' };
        }

        const user = await this.loadUsers();
        let ok = false;
        if (user.passwordHash) {
            ok = (username === user.username) && this.verifyPassword(password, user.passwordHash);
        } else {
            // 兼容旧版本（明文密码）
            ok = (username === user.username) && (password === user.password);
            if (ok) {
                // 迁移为哈希
                user.passwordHash = this.hashPassword(password);
                delete user.password;
                await this.saveUsers(user);
            }
        }

        if (ok) {
            const token = this.createSession(username);
            return { success: true, token };
        }
        return { success: false, message: '用户名或密码错误' };
    }

    /**
     * 用户登出
     * @param {string} token 会话token
     */
    logout(token) {
        this.destroySession(token);
    }

    /**
     * 修改密码
     * @param {string} token 会话token
     * @param {string} oldPassword 旧密码
     * @param {string} newPassword 新密码
     * @param {string} username 新用户名（可选）
     * @returns {object} 修改结果
     */
    async updatePassword(token, oldPassword, newPassword, username = null) {
        const session = this.verifySession(token);
        if (!session) {
            return { success: false, message: '未登录或会话已过期' };
        }

        const user = await this.loadUsers();
        
        // 验证旧密码
        const oldOk = user.passwordHash 
            ? this.verifyPassword(oldPassword, user.passwordHash) 
            : (user.password === oldPassword);
        if (!oldOk) {
            return { success: false, message: '旧密码错误' };
        }
        
        // 更新用户信息
        if (username) {
            user.username = username;
        }
        if (newPassword) {
            user.passwordHash = this.hashPassword(newPassword);
            delete user.password;
        }
        await this.saveUsers(user);
        
        // 更新session中的用户名
        if (username) {
            session.username = username;
        }
        
        return { success: true, username: user.username };
    }

    /**
     * 检查认证状态
     * @param {string} token 会话token
     * @returns {object} 认证状态
     */
    checkAuth(token) {
        const session = this.verifySession(token);
        if (session) {
            return { success: true, username: session.username };
        }
        return { success: false };
    }

    /**
     * 清理过期会话
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [token, session] of this.SESSIONS) {
            if (now > session.expires) {
                this.SESSIONS.delete(token);
            }
        }
    }

    /**
     * 获取会话数量（用于监控）
     * @returns {number}
     */
    getSessionCount() {
        return this.SESSIONS.size;
    }

    /**
     * 获取验证码数量（用于监控）
     * @returns {number}
     */
    getCaptchaCount() {
        return this.CAPTCHA_STORE.size;
    }
}

// 创建单例实例
const authManager = new AuthManager();

module.exports = authManager;
