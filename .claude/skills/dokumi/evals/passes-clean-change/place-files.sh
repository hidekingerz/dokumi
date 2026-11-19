#!/usr/bin/env bash
# 土台アプリを main にコミットし、feature ブランチ上にこのケースの変更を未コミットで置く。
set -eu
here=$(cd "$(dirname "$0")" && pwd)
"$here/../../../../../eval-fixtures/setup-case.sh" "$here/files" .
