#!/bin/bash
# GenFlow 一键启动脚本
# 代理服务(8767)由 launchd 管理，开机自动常驻
# 本脚本只负责启动静态 Web 服务(8766)

cd "$(dirname "$0")"
UID_VAL=$(id -u)
PLIST="$HOME/Library/LaunchAgents/com.genflow.proxy.plist"

echo "🚀 启动 GenFlow..."

# ── 代理服务 (launchd 管理，常驻后台) ──
PROXY_STATE=$(launchctl print gui/${UID_VAL}/com.genflow.proxy 2>/dev/null | grep "state =" | awk '{print $3}')
if [ "$PROXY_STATE" = "running" ]; then
  echo "✅ 代理服务已在运行 → http://localhost:8767"
else
  echo "⏳ 启动代理服务..."
  launchctl bootstrap gui/${UID_VAL} "$PLIST" 2>/dev/null
  launchctl kickstart -p gui/${UID_VAL}/com.genflow.proxy 2>/dev/null
  sleep 1.5
  echo "✅ 代理服务已启动 → http://localhost:8767"
fi

# ── Web 静态服务 ──
pkill -f "http.server 8766" 2>/dev/null; sleep 0.3
python3 -m http.server 8766 &>/tmp/genflow-web.log &
echo "✅ Web 服务已启动 → http://localhost:8766"

sleep 0.5
open http://localhost:8766/
echo ""
echo "🎉 GenFlow 已就绪: http://localhost:8766/"
echo "   代理服务由系统管理，无需手动维护"
