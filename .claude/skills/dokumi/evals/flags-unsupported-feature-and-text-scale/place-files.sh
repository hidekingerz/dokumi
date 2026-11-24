#!/usr/bin/env bash
# 土台アプリを main にコミットし、feature ブランチ上にこのケースの変更を未コミットで置く。
# 対応ブラウザ（.browserslistrc）は変更ではなくプロジェクトの前提なので、土台と一緒に main にコミットする。
set -eu
here=$(cd "$(dirname "$0")" && pwd)
printf 'last 2 Chrome versions\nlast 2 Safari versions\nlast 2 Firefox versions\n' > .browserslistrc
"$here/../../../../../eval-fixtures/setup-case.sh" "$here/files" .
