/**
 * GenFlow Proxy — Cloudflare Pages Function
 * 路由:
 *   /api/proxy/dashscope/... → dashscope.aliyuncs.com
 *   /api/proxy/ark/...       → ark.ap-southeast.bytepluses.com
 *   /api/proxy/oss/...       → dashscope-a717.oss-accelerate.aliyuncs.com
 *   GET  /api/proxy/storage/history  → 读取共享历史
 *   POST /api/proxy/storage/history  → 写入共享历史
 */

const ROUTES = {
  'dashscope': 'https://dashscope.aliyuncs.com',
  'ark':       'https://ark.ap-southeast.bytepluses.com',
  'oss':       'https://dashscope-a717.oss-accelerate.aliyuncs.com',
};

const ALLOWED_ORIGINS = new Set([
  'https://genflow-cf.pages.dev',
  'https://genflow2.netlify.app',
  'http://localhost:8766',
  'http://localhost:8765',
  'http://localhost:8767',
  'http://127.0.0.1:8766',
  'http://127.0.0.1:8765',
]);

function getCorsHeaders(origin) {
  // 允许所有 *.pages.dev 子域
  let allowedOrigin = '*';
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.pages.dev'))) {
    allowedOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, X-DashScope-Async, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function ghGet(ghApi, ghToken) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (ghToken) headers.Authorization = `token ${ghToken}`;
  const res = await fetch(ghApi, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const j = await res.json();
  const content = atob(j.content.replace(/\n/g, ''));
  return { data: JSON.parse(content), sha: j.sha };
}

async function ghPut(ghApi, ghToken, data, sha) {
  if (!ghToken) throw new Error('GH_TOKEN 环境变量未配置');
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const res = await fetch(ghApi, {
    method: 'PUT',
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'update: shared history', content, sha }),
  });
  return res.ok;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = request.headers.get('origin') || '';
  const CORS = getCorsHeaders(origin);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  // 解析路径：去掉 /api/proxy 前缀
  let pathname = url.pathname.replace(/^\/api\/proxy\/?/, '');
  const parts = pathname.split('/').filter(Boolean);
  const service = parts[0];

  // 环境变量
  const DASHSCOPE_KEY = env.DASHSCOPE_KEY || '';
  const ARK_KEY       = env.ARK_KEY       || '';
  const GH_TOKEN      = env.GH_TOKEN      || '';
  const GH_REPO       = env.GH_REPO       || 'heliang0817-eng/genflow';
  const GH_FILE       = 'data/shared-history.json';
  const GH_API        = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;

  // 健康检查
  if (!service || service === 'health') {
    return new Response(JSON.stringify({ status: 'ok', version: 'cf-pages-v1' }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // 共享历史存储
  if (service === 'storage' && parts[1] === 'history') {
    try {
      if (request.method === 'GET') {
        const { data } = await ghGet(GH_API, GH_TOKEN);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      if (request.method === 'POST') {
        const newData = await request.json();
        const { sha } = await ghGet(GH_API, GH_TOKEN);
        await ghPut(GH_API, GH_TOKEN, newData, sha);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  // 动态 OSS 代理
  if (service === 'oss-dynamic') {
    const hostname = parts[1];
    if (!hostname || (!hostname.endsWith('.aliyuncs.com') && !hostname.endsWith('.byteimg.com'))) {
      return new Response(JSON.stringify({ error: 'forbidden_host' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const restPath = '/' + parts.slice(2).join('/');
    const queryStr = url.search || '';
    const targetUrl = `https://${hostname}${restPath}${queryStr}`;
    const proxyRes = await fetch(targetUrl, { method: 'GET' });
    const body = await proxyRes.arrayBuffer();
    return new Response(body, {
      status: proxyRes.status,
      headers: {
        ...CORS,
        'Content-Type': proxyRes.headers.get('content-type') || 'image/jpeg',
      },
    });
  }

  // API 代理
  const targetBase = ROUTES[service];
  if (!targetBase) {
    return new Response(JSON.stringify({ error: 'unknown_service', service }), {
      status: 404,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!DASHSCOPE_KEY && service !== 'ark') {
    return new Response(JSON.stringify({ error: 'DASHSCOPE_KEY 未配置' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  if (!ARK_KEY && service === 'ark') {
    return new Response(JSON.stringify({ error: 'ARK_KEY 未配置' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = service === 'ark' ? ARK_KEY : DASHSCOPE_KEY;
  const restPath = '/' + parts.slice(1).join('/');
  const targetUrl = targetBase + restPath + url.search;

  // 构建转发请求头
  const skipHeaders = new Set([
    'host', 'origin', 'referer', 'accept-encoding',
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
    'authorization', 'content-length', 'connection', 'transfer-encoding',
    'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
  ]);
  const newHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (!skipHeaders.has(k.toLowerCase())) newHeaders.set(k, v);
  }
  newHeaders.set('host', new URL(targetBase).hostname);
  newHeaders.set('authorization', `Bearer ${apiKey}`);

  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();

  const proxyRes = await fetch(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body,
  });

  const resBody = await proxyRes.arrayBuffer();
  const resHeaders = new Headers(CORS);
  resHeaders.set('Content-Type', proxyRes.headers.get('content-type') || 'application/json');

  return new Response(resBody, {
    status: proxyRes.status,
    headers: resHeaders,
  });
}
