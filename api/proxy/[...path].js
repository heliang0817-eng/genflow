/**
 * GenFlow Proxy — Vercel Serverless Function
 * 动态路由: /api/proxy/dashscope/... → dashscope.aliyuncs.com
 *           /api/proxy/ark/...       → ark.ap-southeast.bytepluses.com
 *           /api/proxy/oss/...       → dashscope-a717.oss-accelerate.aliyuncs.com
 */
import https from 'https';

const ROUTES = {
  'dashscope': 'https://dashscope.aliyuncs.com',
  'ark':       'https://ark.ap-southeast.bytepluses.com',
  'oss':       'https://dashscope-a717.oss-accelerate.aliyuncs.com',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, X-DashScope-Async, Accept',
  'Access-Control-Max-Age': '86400',
};

export default function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS);
    res.end();
    return;
  }

  // path 参数：['dashscope', 'api', 'v1', 'services', ...]
  const pathParts = req.query.path || [];
  const service = pathParts[0]; // dashscope | ark | oss

  // 健康检查
  if (!service || service === 'health') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: 'vercel-v1' }));
    return;
  }

  const targetBase = ROUTES[service];
  if (!targetBase) {
    res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unknown_service', service }));
    return;
  }

  // 拼接真实路径（去掉 service 前缀）
  const restParts = pathParts.slice(1);
  const restPath = '/' + restParts.join('/');
  const queryStr = (() => {
    const q = { ...req.query };
    delete q.path;
    const qs = new URLSearchParams(q).toString();
    return qs ? '?' + qs : '';
  })();

  const targetHostname = new URL(targetBase).hostname;

  // 选择对应 API Key
  const isArk = service === 'ark';
  const apiKey = isArk ? process.env.ARK_KEY : process.env.DASHSCOPE_KEY;

  const headers = { ...req.headers };
  headers['host'] = targetHostname;
  headers['authorization'] = `Bearer ${apiKey}`;
  delete headers['origin'];
  delete headers['referer'];
  delete headers['accept-encoding'];

  const options = {
    hostname: targetHostname,
    port: 443,
    path: restPath + queryStr,
    method: req.method,
    headers,
  };

  console.log(`[GenFlow] ${req.method} ${targetHostname}${options.path}`);

  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`  → ${proxyRes.statusCode}`);
    res.writeHead(proxyRes.statusCode, {
      ...CORS,
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
    }
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}
