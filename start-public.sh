#!/bin/bash
# GenFlow 公网部署启动脚本
# 同时启动：前端静态服务 + 代理服务 + Cloudflare Tunnel

cd "$(dirname "$0")"
echo "🚀 GenFlow 公网部署启动中..."

# ──── 停止旧进程 ────
pkill -f "proxy.mjs" 2>/dev/null || true
pkill -f "http.server 8766" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# ──── 启动代理服务 ────
echo "→ 代理服务（端口 8767）..."
nohup node proxy.mjs > /tmp/genflow-proxy.log 2>&1 &
echo "  PID: $!"

# ──── 启动前端静态服务 ────
echo "→ 前端服务（端口 8766）..."
python3 -c "
import http.server, socketserver, os
os.chdir('$(pwd)')
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-cache, no-store, must-revalidate')
        super().end_headers()
    def log_message(self,*a):pass
with socketserver.TCPServer(('',8766),H) as s:
    s.serve_forever()
" > /tmp/genflow-web.log 2>&1 &
echo "  PID: $!"

sleep 2

# ──── 启动两个 Cloudflare Tunnel ────
echo ""
echo "→ 启动 Cloudflare Tunnels（临时免费，无需账号）..."

# 前端 tunnel
cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8766 2>/tmp/tunnel-web.log &
# 代理 tunnel
cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8767 2>/tmp/tunnel-proxy.log &

# 等待隧道地址出现
echo "  等待隧道地址... (最多30秒)"
WEB_URL=""
PROXY_URL=""
for i in $(seq 1 30); do
  sleep 1
  [[ -z "$WEB_URL" ]] && WEB_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tunnel-web.log 2>/dev/null | head -1)
  [[ -z "$PROXY_URL" ]] && PROXY_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tunnel-proxy.log 2>/dev/null | head -1)
  [[ -n "$WEB_URL" && -n "$PROXY_URL" ]] && break
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "$WEB_URL" && -n "$PROXY_URL" ]]; then
  FULL_URL="${WEB_URL}/?proxy=${PROXY_URL}"
  echo "✅ 部署成功！发给其他用户的访问链接："
  echo ""
  echo "   🔗 $FULL_URL"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   前端地址：$WEB_URL"
  echo "   代理地址：$PROXY_URL"
else
  echo "⚠ 部分隧道未能获取地址，请查看日志："
  echo "  前端 tunnel 日志：/tmp/tunnel-web.log"
  echo "  代理 tunnel 日志：/tmp/tunnel-proxy.log"
  echo "  前端 URL：${WEB_URL:-未获取}"
  echo "  代理 URL：${PROXY_URL:-未获取}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠  重启脚本后地址会变化（trycloudflare 临时隧道特性）"
echo "   本地访问：http://localhost:8766"
echo "   按 Ctrl+C 停止所有服务"

wait
