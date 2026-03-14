/**
 * GenFlow Proxy — Netlify Serverless Function
 * 路由:
 *   /api/proxy/dashscope/... → dashscope.aliyuncs.com
 *   /api/proxy/ark/...       → ark.ap-southeast.bytepluses.com
 *   /api/proxy/oss/...       → dashscope-a717.oss-accelerate.aliyuncs.com
 *   GET  /api/proxy/storage/history  → 读取共享历史
 *   POST /api/proxy/storage/history  → 写入共享历史
 *
 * 安全说明：
 *   所有 API Keys 必须通过 Netlify 环境变量注入（DASHSCOPE_KEY, ARK_KEY, GH_TOKEN）
 *   不在代码中硬编码任何密钥
 */
import https from 'https';

const ROUTES = {
  'dashscope': 'https://dashscope.aliyuncs.com',
  'ark':       'https://ark.ap-southeast.bytepluses.com',
  'oss':       'https://dashscope-a717.oss-accelerate.aliyuncs.com',
};

// 允许的来源白名单
const ALLOWED_ORIGINS = new Set([
  'https://genflow2.netlify.app',
  'http://localhost:8766',
  'http://localhost:8765',
  'http://localhost:8767',
  'http://127.0.0.1:8766',
  'http://127.0.0.1:8765',
]);

function getCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://genflow2.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, X-DashScope-Async, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// API Keys 仅从环境变量读取，不包含任何硬编码 fallback
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_REPO  = process.env.GH_REPO || 'heliang0817-eng/genflow';
const GH_FILE  = 'data/shared-history.json';
const GH_API   = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;

// ── GitHub 文件读写 ──
async function ghGet() {
  if (!GH_TOKEN) throw new Error('GH_TOKEN 环境变量未配置');
  const res = await fetch(GH_API, {
    headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  const j = await res.json();
  const content = Buffer.from(j.content, 'base64').toString('utf8');
  return { data: JSON.parse(content), sha: j.sha };
}

async function ghPut(data, sha) {
  if (!GH_TOKEN) throw new Error('GH_TOKEN 环境变量未配置');
  const content = Buffer.from(JSON.stringify(data)).toString('base64');
  const res = await fetch(GH_API, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'update: shared history', content, sha }),
  });
  return res.ok;
}

export const handler = async (event, context) => {
  const origin = (event.headers && event.headers.origin) || '';
  const CORS = getCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const rawPath = event.path || '';
  const stripped = rawPath
    .replace(/^\/.netlify\/functions\/proxy/, '')
    .replace(/^\/api\/proxy/, '')
    .replace(/^\//, '');
  const parts = stripped.split('/').filter(Boolean);
  const service = parts[0];

  // ── 健康检查 ──
  if (!service || service === 'health') {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ok', version: 'netlify-fn-v5-secure' }),
    };
  }

  // ── 共享历史存储 ──
  if (service === 'storage' && parts[1] === 'history') {
    try {
      if (event.httpMethod === 'GET') {
        const { data } = await ghGet();
        return {
          statusCode: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        };
      }
      if (event.httpMethod === 'POST') {
        const body = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : (event.body || '{}');
        const newData = JSON.parse(body);
        const { sha } = await ghGet();
        await ghPut(newData, sha);
        return {
          statusCode: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: true }),
        };
      }
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // ── 动态 OSS 代理：oss-dynamic/<hostname>/path ──
  if (service === 'oss-dynamic') {
    const hostname = parts[1];
    if (!hostname || (!hostname.endsWith('.aliyuncs.com') && !hostname.endsWith('.byteimg.com'))) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'forbidden_host' }) };
    }
    const restPath = '/' + parts.slice(2).join('/');
    const queryStr = event.rawQuery ? '?' + event.rawQuery : '';
    const targetUrl = `https://${hostname}${restPath}${queryStr}`;
    const result = await new Promise((resolve, reject) => {
      const targetUrlObj = new URL(targetUrl);
      const options = {
        hostname,
        port: 443,
        path: targetUrlObj.pathname + (targetUrlObj.search || ''),
        method: 'GET',
        headers: { host: hostname },
      };
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode, contentType: res.headers['content-type'] || 'image/jpeg', body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
    return {
      statusCode: result.statusCode,
      headers: { ...CORS, 'Content-Type': result.contentType },
      body: result.body.toString('base64'),
      isBase64Encoded: true,
    };
  }

  // ── API 代理 ──
  const targetBase = ROUTES[service];
  if (!targetBase) {
    return {
      statusCode: 404,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unknown_service', service }),
    };
  }

  const restPath = '/' + parts.slice(1).join('/');
  const queryStr = event.rawQuery ? '?' + event.rawQuery : '';
  const targetUrl = targetBase + restPath + queryStr;
  const targetHostname = new URL(targetBase).hostname;

  // API Keys 仅从环境变量读取
  const DASHSCOPE_KEY = process.env.DASHSCOPE_KEY || '';
  const ARK_KEY       = process.env.ARK_KEY       || '';

  if (!DASHSCOPE_KEY && service !== 'ark') {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DASHSCOPE_KEY 环境变量未配置' }),
    };
  }
  if (!ARK_KEY && service === 'ark') {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ARK_KEY 环境变量未配置' }),
    };
  }

  const apiKey = service === 'ark' ? ARK_KEY : DASHSCOPE_KEY;

  // 从头构建干净的请求头，避免大小写冲突
  const skipHeaders = new Set(['host','origin','referer','accept-encoding',
    'x-forwarded-for','x-forwarded-host','x-forwarded-proto','authorization',
    'content-length','connection','transfer-encoding']);
  const reqHeaders = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (!skipHeaders.has(k.toLowerCase())) reqHeaders[k.toLowerCase()] = v;
  }
  reqHeaders['host'] = targetHostname;
  reqHeaders['authorization'] = `Bearer ${apiKey}`;

  const result = await new Promise((resolve, reject) => {
    const targetUrlObj = new URL(targetUrl);
    const options = {
      hostname: targetHostname,
      port: 443,
      path: targetUrlObj.pathname + (targetUrlObj.search || ''),
      method: event.httpMethod,
      headers: reqHeaders,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'] || 'application/json',
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', reject);

    if (event.body) {
      req.write(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body);
    }
    req.end();
  });

  return {
    statusCode: result.statusCode,
    headers: { ...CORS, 'Content-Type': result.contentType },
    body: result.body.toString('base64'),
    isBase64Encoded: true,
  };
};
