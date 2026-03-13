/**
 * GenFlow 代理服务器 v3 — 安全版
 * Key 存服务端，前端无需（也无法）传递 API Key
 * 外部用户完全看不到任何 Key
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { readFileSync } from 'fs';

// 加载 .env（本地开发用，生产环境用平台环境变量）
try {
  const env = readFileSync(new URL('.env', import.meta.url), 'utf8');
  env.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch(e) { /* 生产环境没有 .env 文件，忽略 */ }

const PROXY_PORT = parseInt(process.env.PORT || '8767');

// ── API Keys（从环境变量读取，本地开发可用 .env 文件）──
const KEYS = {
  dashscope: process.env.DASHSCOPE_KEY || '',
  ark:       process.env.ARK_KEY       || '',
};

// 启动时打印（脱敏），确认 Key 已加载
console.log(`[GenFlow Proxy v3] DashScope Key: ${KEYS.dashscope.slice(0,8)}****`);
console.log(`[GenFlow Proxy v3] ARK Key:       ${KEYS.ark.slice(0,8)}****`);

const ROUTES = {
  '/proxy/dashscope': { base: 'https://dashscope.aliyuncs.com',                        keyType: 'dashscope' },
  '/proxy/ark':       { base: 'https://ark.ap-southeast.bytepluses.com',               keyType: 'ark'       },
  '/proxy/oss':       { base: 'https://dashscope-a717.oss-accelerate.aliyuncs.com',    keyType: 'dashscope' },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, X-DashScope-Async, Accept',
  'Access-Control-Max-Age': '86400',
};

function proxyRequest(req, res, route, prefix) {
  const restPath = req.url.slice(prefix.length);
  const target = new URL(restPath || '/', route.base);

  // 服务端注入正确的 API Key，忽略前端传来的任何 Authorization
  const key = KEYS[route.keyType];
  const headers = {
    ...req.headers,
    host: target.hostname,
    authorization: `Bearer ${key}`,  // 覆盖前端传来的（即使前端没传也会注入）
  };
  delete headers['origin'];
  delete headers['referer'];
  delete headers['accept-encoding']; // 禁止 gzip，避免乱码

  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + (target.search || ''),
    method: req.method,
    headers,
  };

  console.log(`[${new Date().toISOString()}] ${req.method} ${target.hostname}${options.path}`);

  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`  → ${proxyRes.statusCode}`);
    res.writeHead(proxyRes.statusCode, {
      ...CORS_HEADERS,
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, CORS_HEADERS);
      res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
    }
  });

  req.on('error', (err) => {
    console.error('Request error:', err.message);
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  // 健康检查端点
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: 'v3-secure' }));
    return;
  }

  // 动态 OSS 代理：/proxy/oss-dynamic/<hostname>/path → https://<hostname>/path
  // 支持任意 aliyuncs.com 子域，解决 wan2.6 等模型返回不同 OSS 域的图片
  if (req.url.startsWith('/proxy/oss-dynamic/')) {
    const rest = req.url.slice('/proxy/oss-dynamic/'.length); // hostname/path
    const slashIdx = rest.indexOf('/');
    const hostname = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const pathPart = slashIdx === -1 ? '/' : rest.slice(slashIdx);

    // 安全限制：只允许 aliyuncs.com 和 bytepluses.com 子域
    if (!hostname.endsWith('.aliyuncs.com') && !hostname.endsWith('.bytepluses.com') && !hostname.endsWith('.byteimg.com')) {
      res.writeHead(403, CORS_HEADERS);
      res.end(JSON.stringify({ error: 'forbidden_host', hostname }));
      return;
    }

    const dynRoute = { base: `https://${hostname}`, keyType: 'dashscope' };
    const fakeReq = Object.assign(Object.create(req), { url: pathPart });
    proxyRequest(fakeReq, res, dynRoute, '');
    return;
  }

  const matchedPrefix = Object.keys(ROUTES).find(k => req.url.startsWith(k));
  if (matchedPrefix) {
    proxyRequest(req, res, ROUTES[matchedPrefix], matchedPrefix);
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'not_found', path: req.url }));
});

server.listen(PROXY_PORT, () => {
  console.log(`✅ GenFlow Proxy v3 (secure) running on http://localhost:${PROXY_PORT}`);
  console.log(`   API Keys are server-side only — never exposed to clients`);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
