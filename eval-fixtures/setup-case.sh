#!/usr/bin/env bash
# 試験ケースの作業ディレクトリを作る。
# 使い方: setup-case.sh <ケースの files ディレクトリ> <作成先ディレクトリ> [node_modules を持つ土台のコピー元]
# 土台アプリを main にコミットし、feature ブランチ上でケースの変更を未コミットのまま置く。
set -eu
case_files=$(cd "$1" && pwd)
dest=$2
here=$(cd "$(dirname "$0")" && pwd)
template=${3:-$here/base-app}
mkdir -p "$dest"
cp -a "$template/." "$dest/"
cd "$dest"
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null
rm -rf .git dist
git init -q -b main
git -c user.email=dev@example.com -c user.name=dev add -A
git -c user.email=dev@example.com -c user.name=dev commit -q -m "base app"
git checkout -q -b feature
cp -R "$case_files/overlay/." .
cp "$case_files/REQUIREMENTS.md" "$case_files/AGENT_REPORT.md" .
