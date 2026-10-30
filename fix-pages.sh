#!/bin/sh
# 修复 GitHub Pages 忽略 _sidebar.md 的问题
set -e
cd /Users/cici/Desktop/temp/ai-ledger/docs
git add -A
git commit -m "fix: 添加 .nojekyll 防止 Jekyll 忽略 _sidebar.md" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
