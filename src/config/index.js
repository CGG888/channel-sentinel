const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('../storage');
const storageMode = require('../storage/mode');

class ConfigManager {
    constructor() {
        this.DATA_DIR = path.join(__dirname, '../../data');
        this.configs = {};
        this.secretKey = null;
        this.initSecretKey();
        this.loadAllConfigs();
    }

    initSecretKey() {
        const SECRET_FILE_ABS = path.join(this.DATA_DIR, '.secret_key');
        try {
            const dataDir = this.DATA_DIR;
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            if (fs.existsSync(SECRET_FILE_ABS)) {
                const raw = fs.readFileSync(SECRET_FILE_ABS, 'utf-8').trim();
                if (raw) {
                    this.secretKey = Buffer.from(raw, 'base64');
                    return;
                }
            }
        } catch (e) {
            // ignore
        }
        // 生成新的密钥
        this.secretKey = crypto.randomBytes(32);
        try {
            fs.writeFileSync(SECRET_FILE_ABS, this.secretKey.toString('base64'));
        } catch (e) {
            // ignore
        }
    }

    encryptSecret(plain) {
        if (!plain || !this.secretKey) return '';
        try {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey, iv);
            const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            return `enc:v1:${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`;
        } catch (e) {
            return String(plain);
        }
    }

    decryptSecret(v) {
        if (!v || !this.secretKey) return '';
        if (!String(v).startsWith('enc:v1:')) return String(v);
        try {
            const [, , ivB64, cB64, tagB64] = String(v).split(':');
            const iv = Buffer.from(ivB64, 'base64');
            const data = Buffer.from(cB64, 'base64');
            const tag = Buffer.from(tagB64, 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.secretKey, iv);
            decipher.setAuthTag(tag);
            const out = Buffer.concat([decipher.update(data), decipher.final()]);
            return out.toString('utf8');
        } catch (e) {
            return '';
        }
    }

    readJsonFile(filename, defaultValue = {}) {
        const filePath = path.join(this.DATA_DIR, filename);
        try {
            if (fs.existsSync(filePath)) {
                const txt = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(txt);
            }
        } catch (e) {
            console.error(`读取配置文件失败 ${filename}:`, e.message);
        }
        return defaultValue;
    }

    writeJsonFile(filename, data) {
        const filePath = path.join(this.DATA_DIR, filename);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error(`写入配置文件失败 ${filename}:`, e.message);
            return false;
        }
    }

    loadAllConfigs() {
        this.configs = {
            appSettings: this.readJsonFile('app_settings.json', {
                useInternal: true,
                useExternal: false,
                internalUrl: '',
                externalUrl: '',
                securityToken: '',
                enableToken: false,
                webdavUrl: '',
                webdavUser: '',
                webdavPass: '',
                webdavRoot: '/webdav/IPTV',
                webdavInsecure: false,
                storageMode: 'sqlite',
                logLevel: 'info',
                logKeepDays: 7
            }),
            logoTemplates: this.readJsonFile('logo_templates.json', {
                templates: [],
                currentId: ''
            }),
            fccServers: this.readJsonFile('fcc_servers.json', {
                servers: [],
                currentId: ''
            }),
            udpxyServers: this.readJsonFile('udpxy_servers.json', {
                servers: [],
                currentId: ''
            }),
            groupTitles: this.readJsonFile('group_titles.json', {
                titles: []
            }),
            groupRules: this.readJsonFile('group_rules.json', {
                rules: []
            }),
            epgSources: this.readJsonFile('epg_sources.json', {
                sources: []
            }),
            proxyServers: this.readJsonFile('proxy_servers.json', {
                list: []
            }),
            streams: this.readJsonFile('streams.json', {
                streams: [],
                settings: {}
            }),
            users: this.readJsonFile('users.json', {
                username: 'admin',
                passwordHash: ''
            })
        };

        // 解密加密字段
        this.decryptSensitiveFields();
        storageMode.setStorageMode(this.configs.appSettings && this.configs.appSettings.storageMode);
    }

    decryptSensitiveFields() {
        const { appSettings } = this.configs;
        if (appSettings.securityToken) {
            appSettings.securityToken = this.decryptSecret(appSettings.securityToken);
        }
        if (appSettings.webdavPass) {
            appSettings.webdavPass = this.decryptSecret(appSettings.webdavPass);
        }
    }

    encryptSensitiveFields() {
        const { appSettings } = this.configs;
        if (appSettings.securityToken && !appSettings.securityToken.startsWith('enc:v1:')) {
            appSettings.securityToken = this.encryptSecret(appSettings.securityToken);
        }
        if (appSettings.webdavPass && !appSettings.webdavPass.startsWith('enc:v1:')) {
            appSettings.webdavPass = this.encryptSecret(appSettings.webdavPass);
        }
    }

    getConfig(configName) {
        return this.configs[configName];
    }

    updateConfig(configName, data) {
        if (!this.configs[configName]) {
            return false;
        }
        this.configs[configName] = { ...this.configs[configName], ...data };
        return true;
    }

    saveConfig(configName) {
        let filename;
        let data = this.configs[configName];
        
        switch (configName) {
            case 'appSettings':
                filename = 'app_settings.json';
                // 保存前加密敏感字段
                const encryptedData = { ...data };
                if (encryptedData.securityToken && !encryptedData.securityToken.startsWith('enc:v1:')) {
                    encryptedData.securityToken = this.encryptSecret(encryptedData.securityToken);
                }
                if (encryptedData.webdavPass && !encryptedData.webdavPass.startsWith('enc:v1:')) {
                    encryptedData.webdavPass = this.encryptSecret(encryptedData.webdavPass);
                }
                data = encryptedData;
                break;
            case 'logoTemplates':
                filename = 'logo_templates.json';
                break;
            case 'fccServers':
                filename = 'fcc_servers.json';
                break;
            case 'udpxyServers':
                filename = 'udpxy_servers.json';
                break;
            case 'groupTitles':
                filename = 'group_titles.json';
                break;
            case 'groupRules':
                filename = 'group_rules.json';
                break;
            case 'epgSources':
                filename = 'epg_sources.json';
                break;
            case 'proxyServers':
                filename = 'proxy_servers.json';
                break;
            case 'streams':
                filename = 'streams.json';
                break;
            case 'users':
                filename = 'users.json';
                break;
            default:
                return false;
        }
        let ok = true;
        if (storageMode.shouldWriteJson()) {
            ok = this.writeJsonFile(filename, data);
        }
        if (ok && storageMode.shouldWriteSqlite()) {
            storage.syncConfig(configName, data);
        }
        return ok;
    }

    async saveConfigStrict(configName) {
        let filename;
        let data = this.configs[configName];

        switch (configName) {
            case 'appSettings':
                filename = 'app_settings.json';
                {
                    const encryptedData = { ...data };
                    if (encryptedData.securityToken && !encryptedData.securityToken.startsWith('enc:v1:')) {
                        encryptedData.securityToken = this.encryptSecret(encryptedData.securityToken);
                    }
                    if (encryptedData.webdavPass && !encryptedData.webdavPass.startsWith('enc:v1:')) {
                        encryptedData.webdavPass = this.encryptSecret(encryptedData.webdavPass);
                    }
                    data = encryptedData;
                }
                break;
            case 'logoTemplates':
                filename = 'logo_templates.json';
                break;
            case 'fccServers':
                filename = 'fcc_servers.json';
                break;
            case 'udpxyServers':
                filename = 'udpxy_servers.json';
                break;
            case 'groupTitles':
                filename = 'group_titles.json';
                break;
            case 'groupRules':
                filename = 'group_rules.json';
                break;
            case 'epgSources':
                filename = 'epg_sources.json';
                break;
            case 'proxyServers':
                filename = 'proxy_servers.json';
                break;
            case 'streams':
                filename = 'streams.json';
                break;
            case 'users':
                filename = 'users.json';
                break;
            default:
                return false;
        }

        let ok = true;
        if (storageMode.shouldWriteJson()) {
            ok = this.writeJsonFile(filename, data);
        }
        if (ok && storageMode.shouldWriteSqlite()) {
            await storage.syncConfig(configName, data);
        }
        return ok;
    }

    saveAllConfigs() {
        const results = {};
        Object.keys(this.configs).forEach(key => {
            results[key] = this.saveConfig(key);
        });
        return results;
    }

    // 获取所有配置（用于调试或管理界面）
    getAllConfigs() {
        return this.configs;
    }

    // 重新加载所有配置（例如，当配置文件被外部修改时）
    reloadAllConfigs() {
        this.loadAllConfigs();
    }
}

// 创建单例实例
const configManager = new ConfigManager();

module.exports = configManager;
