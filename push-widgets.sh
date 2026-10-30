#!/bin/sh
# 推送互动教学组件
set -e
cd /Users/cici/Desktop/temp/ai-ledger/docs
git add -A
git commit -m "feat: 教程加入互动教学组件（Agent 循环演示/架构探索/工具卡片）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
