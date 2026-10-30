#!/bin/sh
# 推送教程站点样式更新
set -e
cd /Users/cici/Desktop/temp/ai-ledger/docs
git add -A
git commit -m "style: 重做教程排版与代码高亮（纸感主题 v2）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
