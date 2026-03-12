/**
 * GenFlow Proxy — Netlify Serverless Function
 * 触发路径: /.netlify/functions/proxy/* (通过 netlify.toml redirect 映射到 /api/proxy/*)
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

// Netlify Serverless Function handler
export const handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // 从路径提取 service: /api/proxy/{service}/...
  const rawPath = event.path || '';
  const stripped = rawPath
    .replace(/^\/.netlify\/functions\/proxy/, '')
    .replace(/^\/api\/proxy/, '')
    .replace(/^\//, '');
  const parts = stripped.split('/').filter(Boolean);
  const service = parts[0];

  // 健康检查
  if (!service || service === 'health') {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ok', version: 'netlify-fn-v1' }),
    };
  }

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

  // API Key（服务端，用户不可见）
  const DASHSCOPE_KEY = process.env.DASHSCOPE_KEY || '***DASHSCOPE_KEY_REMOVED***';
  const ARK_KEY       = process.env.ARK_KEY       || '***ARK_KEY_REMOVED***';
  const apiKey = service === 'ark' ? ARK_KEY : DASHSCOPE_KEY;

  // 构建请求头
  const reqHeaders = { ...(event.headers || {}) };
  reqHeaders['host'] = targetHostname;
  reqHeaders['authorization'] = `Bearer ${apiKey}`;
  delete reqHeaders['origin'];
  delete reqHeaders['referer'];
  delete reqHeaders['accept-encoding'];
  delete reqHeaders['x-forwarded-for'];
  delete reqHeaders['x-forwarded-host'];
  delete reqHeaders['x-forwarded-proto'];

  console.log(`[GenFlow] ${event.httpMethod} ${targetUrl}`);

  // 发起代理请求
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
