#!/usr/bin/env bash
set -euo pipefail

deploy_script="$(cd "$(dirname "$0")" && pwd)/server-deploy.sh"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
printf 'DOMAIN=67.230.180.146\n' > "$test_dir/.deploy.env"
export PROJECT_DIR="$test_dir"
unset DOMAIN
# Load definitions without running deployment or requiring root.
source <(sed '$d' "$deploy_script")
test "$DOMAIN" = '67.230.180.146'
test "$NGINX_CONF" = '/etc/nginx/conf.d/67.230.180.146.conf'
NGINX_CONF="$test_dir/ip.conf"
ACME_ROOT="$test_dir/acme"
write_nginx_http
grep -Fq 'server_name 67.230.180.146;' "$NGINX_CONF"
grep -Fq 'proxy_pass http://127.0.0.1:3001;' "$NGINX_CONF"
grep -Fq 'proxy_read_timeout 960s;' "$NGINX_CONF"
if grep -Fq 'return 301' "$NGINX_CONF"; then
  echo 'IP access must not redirect to HTTPS.' >&2
  exit 1
fi
echo 'IP deployment tests passed'
