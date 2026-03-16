#!/bin/bash
# GenFlow 代理守护脚本
# 检查代理是否在运行，没有就重启
PROXY_MJS="/Users/heliang/.openclaw/workspace/projects/gen-platform/proxy.mjs"
LOG="/tmp/genflow-proxy-v2.log"

# 测试代理连通性
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8767/ 2>/dev/null)

if [ "$STATUS" = "000" ]; then
  echo "[$(date)] 代理未响应，重启中..." >> /tmp/genflow-keepalive.log
  pkill -f "proxy.mjs" 2>/dev/null
  sleep 0.5
  node "$PROXY_MJS" >> "$LOG" 2>&1 &
  echo "[$(date)] 代理已重启 PID: $!" >> /tmp/genflow-keepalive.log
else
  echo "[$(date)] 代理正常 (HTTP $STATUS)" >> /tmp/genflow-keepalive.log
fi
