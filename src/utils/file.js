const fs = require('fs');
const path = require('path');

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath 目录路径
 */
function ensureDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    } catch (e) {
        console.error(`创建目录失败 ${dirPath}:`, e.message);
    }
}

/**
 * 读取JSON文件，如果文件不存在则返回默认值
 * @param {string} filePath 文件路径
 * @param {*} defaultValue 默认值
 * @returns {*} 解析后的JSON对象或默认值
 */
function readJson(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const txt = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(txt);
        }
    } catch (e) {
        console.error(`读取JSON文件失败 ${filePath}:`, e.message);
    }
    return defaultValue;
}

/**
 * 写入JSON文件
 * @param {string} filePath 文件路径
 * @param {*} data 要写入的数据
 * @param {boolean} pretty 是否美化输出（格式化）
 * @returns {boolean} 是否成功
 */
function writeJson(filePath, data, pretty = true) {
    try {
        const dir = path.dirname(filePath);
        ensureDir(dir);
        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        console.error(`写入JSON文件失败 ${filePath}:`, e.message);
        return false;
    }
}

/**
 * 列出目录下的所有文件（可递归）
 * @param {string} dirPath 目录路径
 * @param {boolean} recursive 是否递归
 * @returns {Array} 文件列表
 */
function listFiles(dirPath, recursive = false) {
    try {
        if (!fs.existsSync(dirPath)) {
            return [];
        }
        if (!recursive) {
            return fs.readdirSync(dirPath);
        }
        const files = [];
        const walk = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walk(fullPath);
                } else {
                    files.push(fullPath);
                }
            }
        };
        walk(dirPath);
        return files;
    } catch (e) {
        console.error(`列出目录文件失败 ${dirPath}:`, e.message);
        return [];
    }
}

/**
 * 检查文件是否存在
 * @param {string} filePath 文件路径
 * @returns {boolean}
 */
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (e) {
        return false;
    }
}

/**
 * 删除文件
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否成功
 */
function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`删除文件失败 ${filePath}:`, e.message);
        return false;
    }
}

module.exports = {
    ensureDir,
    readJson,
    writeJson,
    listFiles,
    fileExists,
    deleteFile
};
