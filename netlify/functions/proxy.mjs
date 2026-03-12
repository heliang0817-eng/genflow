/**
 * GenFlow Proxy — Netlify Edge Function
 * 路由: /api/proxy/dashscope/... → dashscope.aliyuncs.com
 *       /api/proxy/ark/...       → ark.ap-southeast.bytepluses.com
 *       /api/proxy/oss/...       → dashscope-a717.oss-accelerate.aliyuncs.com
 */

const ROUTES = {
  'dashscope': 'https://dashscope.aliyuncs.com',
  'ark':       'https://ark.ap-southeast.bytepluses.com',
  'oss':       'https://dashscope-a717.oss-accelerate.aliyuncs.com',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, X-DashScope-Async, Accept',
  'Access-Control-Max-Age': '86400',
};

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  // 路径格式: /api/proxy/{service}/...
  // Netlify Functions 实际路径: /.netlify/functions/proxy/{service}/...
  // 通过 redirect 映射到 /api/proxy
  const pathParts = url.pathname
    .replace(/^\/.netlify\/functions\/proxy\/?/, '')
    .replace(/^\/api\/proxy\/?/, '')
    .split('/').filter(Boolean);

  const service = pathParts[0];

  // 健康检查
  if (!service || service === 'health') {
    return new Response(JSON.stringify({ status: 'ok', version: 'netlify-v1' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  const targetBase = ROUTES[service];
  if (!targetBase) {
    return new Response(JSON.stringify({ error: 'unknown_service', service }), {
      status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  // 剩余路径
  const restPath = '/' + pathParts.slice(1).join('/');
  const targetUrl = targetBase + restPath + url.search;

  // 选择 API Key（服务端保存，用户不可见）
  const DASHSCOPE_KEY = Netlify.env.get('DASHSCOPE_KEY') || '***DASHSCOPE_KEY_REMOVED***';
  const ARK_KEY = Netlify.env.get('ARK_KEY') || '***ARK_KEY_REMOVED***';
  const isArk = service === 'ark';
  const apiKey = isArk ? ARK_KEY : DASHSCOPE_KEY;

  // 构建新请求头
  const newHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const kl = k.toLowerCase();
    if (['origin','referer','accept-encoding','host'].includes(kl)) continue;
    newHeaders.set(k, v);
  }
  newHeaders.set('host', new URL(targetBase).hostname);
  newHeaders.set('authorization', `Bearer ${apiKey}`);

  console.log(`[GenFlow] ${request.method} ${targetUrl}`);

  try {
    const hasBody = !['GET','HEAD'].includes(request.method);
    const resp = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: hasBody ? request.body : undefined,
    });

    const outHeaders = new Headers(CORS_HEADERS);
    outHeaders.set('Content-Type', resp.headers.get('Content-Type') || 'application/json');

    return new Response(resp.body, {
      status: resp.status,
      headers: outHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy_error', message: err.message }), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: ['/api/proxy', '/api/proxy/*'] };
