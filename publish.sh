#!/bin/sh
# 发布《从零开始构建 AI 记账助手》网页版教程到 GitHub Pages
set -e
cd /Users/cici/Desktop/temp/ai-ledger/docs
rm -rf .git
git init -b main
git config user.name "Baicaicn"
git config user.email "193595304+Baicaicn23@users.noreply.github.com"
git config credential.helper '!$HOME/.local/bin/gh auth git-credential'
git config http.https://github.com.proxy socks5h://127.0.0.1:1080
git add -A
git commit -m "docs: 发布《从零开始构建 AI 记账助手》网页版教程

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
HTTPS_PROXY=socks5h://127.0.0.1:1080 HTTP_PROXY=socks5h://127.0.0.1:1080 "$HOME/.local/bin/gh" repo create ai-ledger-tutorial --public --source=. --remote=origin --push
echo '{"source":{"branch":"main","path":"/"}}' | HTTPS_PROXY=socks5h://127.0.0.1:1080 "$HOME/.local/bin/gh" api --method POST repos/Baicaicn23/ai-ledger-tutorial/pages --input -
HTTPS_PROXY=socks5h://127.0.0.1:1080 "$HOME/.local/bin/gh" api repos/Baicaicn23/ai-ledger-tutorial/pages --jq '.html_url + " | " + .status'
