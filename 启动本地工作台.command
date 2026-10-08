#!/bin/zsh
set -e

launcher_dir="${0:A:h}"
cd "$launcher_dir"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run desktop
