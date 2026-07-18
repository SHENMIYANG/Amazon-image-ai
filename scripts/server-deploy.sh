#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/amazon-image-ai}"
REPO_URL="${REPO_URL:-https://github.com/SHENMIYANG/Amazon-image-ai.git}"
DOMAIN="${DOMAIN:-image.ubjhbdhsv.top}"
APP_NAME="${APP_NAME:-ecommerce-image-gen}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
NGINX_CONF="/etc/nginx/conf.d/${DOMAIN}.conf"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
ACME_ROOT="/var/www/acme"

log() {
  printf '\n[deploy] %s\n' "$1"
}

need_root() {
  if [ "$(id -u)" != "0" ]; then
    echo "Please run this script as root."
    exit 1
  fi
}

install_base_packages() {
  log "Installing base packages"
  dnf install -y git curl wget unzip vim firewalld nginx openssl

  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 20 ]; then
    log "Installing Node.js 20"
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    log "Installing PM2"
    npm install -g pm2
  fi

  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl start nginx

  systemctl enable firewalld >/dev/null 2>&1 || true
  systemctl start firewalld >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-service=https >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
}

sync_project() {
  log "Syncing project code"
  mkdir -p "$(dirname "$PROJECT_DIR")"

  if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    git pull --ff-only origin master
  else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
  fi
}

check_env() {
  if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    log "backend/.env is missing"
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/backend/.env"
    cat <<EOF

I created:
  $PROJECT_DIR/backend/.env

Edit it first, fill your API keys, then run this script again:
  vim $PROJECT_DIR/backend/.env
  bash $PROJECT_DIR/scripts/server-deploy.sh update

EOF
    exit 0
  fi
}

build_project() {
  log "Installing dependencies and building frontend"
  cd "$PROJECT_DIR"
  npm ci

  cd "$PROJECT_DIR/frontend"
  npm ci
  npm run build

  cd "$PROJECT_DIR/backend"
  npm ci --omit=dev

  mkdir -p "$PROJECT_DIR/backend/uploads" "$PROJECT_DIR/backend/logs"
}

restart_pm2() {
  log "Starting app with PM2"
  cd "$PROJECT_DIR"

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start ecosystem.config.js
  fi

  pm2 save
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
}

write_nginx_http() {
  log "Writing HTTP Nginx config"
  mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
  [ -f "$NGINX_CONF" ] && cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 30M;

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
    }

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 360s;
        proxy_read_timeout 360s;
    }
}
EOF
}

write_nginx_https() {
  log "Writing HTTPS Nginx config"
  mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
  [ -f "$NGINX_CONF" ] && cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    client_max_body_size 30M;

    ssl_certificate ${SSL_DIR}/fullchain.pem;
    ssl_certificate_key ${SSL_DIR}/key.pem;

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 360s;
        proxy_read_timeout 360s;
    }
}
EOF
}

reload_nginx() {
  nginx -t
  systemctl reload nginx
}

configure_nginx() {
  if [ -f "${SSL_DIR}/fullchain.pem" ] && [ -f "${SSL_DIR}/key.pem" ]; then
    write_nginx_https
  else
    write_nginx_http
  fi

  reload_nginx
}

print_status() {
  log "Done"
  pm2 status || true
  cat <<EOF

Open:
  http://${DOMAIN}

If HTTPS cert files exist, open:
  https://${DOMAIN}

Health check:
  curl http://127.0.0.1:${BACKEND_PORT}/api/health

EOF
}

main() {
  need_root
  MODE="${1:-update}"

  case "$MODE" in
    install)
      install_base_packages
      sync_project
      check_env
      build_project
      restart_pm2
      configure_nginx
      print_status
      ;;
    update)
      sync_project
      check_env
      build_project
      restart_pm2
      configure_nginx
      print_status
      ;;
    nginx)
      configure_nginx
      print_status
      ;;
    *)
      echo "Usage: bash scripts/server-deploy.sh [install|update|nginx]"
      exit 1
      ;;
  esac
}

main "$@"
