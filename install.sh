#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Luca General Ledger — VPS Installer
# Supports: Ubuntu 20.04+, Ubuntu 22.04+, Ubuntu 24.04+, Debian 11+, Debian 12+
# Run as root or with sudo.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ██╗     ██╗   ██╗ ██████╗ █████╗ "
echo "  ██║     ██║   ██║██╔════╝██╔══██╗"
echo "  ██║     ██║   ██║██║     ███████║"
echo "  ██║     ██║   ██║██║     ██╔══██║"
echo "  ███████╗╚██████╔╝╚██████╗██║  ██║"
echo "  ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "  ${BOLD}General Ledger v1.0 — Server Installer${NC}"
echo ""

# ── Helper functions ──────────────────────────────────────────────────────────
info()    { echo -e "  ${BLUE}i${NC}  $1"; }
success() { echo -e "  ${GREEN}ok${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!!${NC} $1"; }
error()   { echo -e "  ${RED}xx${NC} $1"; }
step()    { echo ""; echo -e "  ${BOLD}${CYAN}>> $1${NC}"; echo "  $(printf '=%.0s' {1..58})"; }

# ── OS check ──────────────────────────────────────────────────────────────────
step "Checking system requirements"

if [ ! -f /etc/os-release ]; then
    error "Cannot detect OS. This installer supports Ubuntu 20.04+ and Debian 11+."
    exit 1
fi

. /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    error "Unsupported OS: $ID. This installer supports Ubuntu and Debian."
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    error "Please run as root or with sudo:"
    echo ""
    echo "    sudo bash install.sh"
    echo ""
    exit 1
fi

success "OS: $PRETTY_NAME"

# Check available disk space (need at least 5GB)
AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
if [ "$AVAILABLE_GB" -lt 5 ]; then
    warn "Low disk space: ${AVAILABLE_GB}GB available. Recommend at least 5GB."
fi

# ── Interactive configuration ─────────────────────────────────────────────────
step "Configuration"
echo ""
echo -e "  Please answer a few questions to configure Luca for your company."
echo -e "  Press ${BOLD}Enter${NC} to accept defaults shown in [brackets]."
echo ""

# Company name
while true; do
    read -rp "  Company name (e.g. Acme Ltd): " COMPANY_NAME
    [ -n "$COMPANY_NAME" ] && break
    error "Company name is required."
done

# Domain
echo ""
echo -e "  ${YELLOW}Important:${NC} Your domain must already point to this server's IP address."
echo -e "  Luca will obtain an SSL certificate for this domain."
echo ""
while true; do
    read -rp "  Domain name (e.g. accounts.yourcompany.com): " DOMAIN
    [ -n "$DOMAIN" ] && break
    error "Domain name is required."
done

# Admin email
echo ""
while true; do
    read -rp "  Admin email address: " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" == *@* ]] && break
    error "Please enter a valid email address."
done

# Admin password
echo ""
while true; do
    read -rsp "  Admin password (min 12 characters): " ADMIN_PASSWORD
    echo ""
    if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
        error "Password must be at least 12 characters."
        continue
    fi
    read -rsp "  Confirm password: " ADMIN_PASSWORD2
    echo ""
    if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD2" ]; then
        break
    fi
    error "Passwords do not match. Please try again."
done

# SSL/Let's Encrypt email
echo ""
echo -e "  Let's Encrypt needs an email address for SSL certificate renewal notices."
read -rp "  SSL notification email [$ADMIN_EMAIL]: " SSL_EMAIL
SSL_EMAIL="${SSL_EMAIL:-$ADMIN_EMAIL}"

# Install directory
INSTALL_DIR="/opt/luca"

# Summary
echo ""
echo -e "  ${BOLD}=========================================================${NC}"
echo -e "  ${BOLD}  Installation summary${NC}"
echo -e "  ${BOLD}=========================================================${NC}"
echo ""
echo -e "  Company:          ${BOLD}$COMPANY_NAME${NC}"
echo -e "  URL:              ${BOLD}https://$DOMAIN${NC}"
echo -e "  Admin email:      ${BOLD}$ADMIN_EMAIL${NC}"
echo -e "  Install location: ${BOLD}$INSTALL_DIR${NC}"
echo ""

read -rp "  Proceed with installation? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo ""
    info "Installation cancelled."
    exit 0
fi

# ── Install system packages ───────────────────────────────────────────────────
step "Installing system packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Install prerequisites
apt-get install -y -qq \
    curl \
    git \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    apt-transport-https \
    software-properties-common \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw

success "System packages installed"

# ── Install Docker ─────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    success "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
else
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    success "Docker installed"
fi

# Docker Compose (plugin)
if docker compose version &>/dev/null 2>&1; then
    success "Docker Compose already available"
else
    info "Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
    success "Docker Compose installed"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
step "Configuring firewall"

ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow ssh > /dev/null 2>&1
ufw allow 'Nginx Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

success "Firewall configured (SSH + HTTP/HTTPS allowed)"

# ── Clone / install application ───────────────────────────────────────────────
step "Installing Luca"

if [ -d "$INSTALL_DIR" ]; then
    warn "Directory $INSTALL_DIR already exists."
    read -rp "  Overwrite existing installation? [y/N]: " OVERWRITE
    if [[ "$OVERWRITE" =~ ^[Yy]$ ]]; then
        # Stop existing containers before removing
        if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
            cd "$INSTALL_DIR"
            docker compose down 2>/dev/null || true
        fi
        rm -rf "$INSTALL_DIR"
    else
        error "Installation cancelled. Remove $INSTALL_DIR manually and re-run."
        exit 1
    fi
fi

git clone https://github.com/roger296/luca-general-ledger.git "$INSTALL_DIR" --quiet
success "Application downloaded to $INSTALL_DIR"

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"

# ── Generate secrets and create .env ─────────────────────────────────────────
step "Generating configuration"

JWT_SECRET=$(openssl rand -base64 48)
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 40)

cat > "$INSTALL_DIR/.env" <<ENVEOF
# Luca General Ledger — Production Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Keep this file secure — it contains secrets.

# Application
NODE_ENV=production
PORT=3000

# Security
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h

# Database
POSTGRES_DB=gl_ledger
POSTGRES_USER=gl_admin
POSTGRES_PASSWORD=${DB_PASSWORD}

# Chain storage (Docker volume — do not change)
CHAIN_DIR=/data/chains

# Webhooks
ESCALATION_HOURS=48

# Logging
LOG_LEVEL=info
ENVEOF

chmod 600 "$INSTALL_DIR/.env"
success "Secrets generated and saved to $INSTALL_DIR/.env"

# ── Build and start Docker containers ─────────────────────────────────────────
step "Building and starting Luca"

cd "$INSTALL_DIR"

info "Building Docker image (this takes 2-3 minutes on first run)..."
docker compose build --quiet

info "Starting database..."
docker compose up -d db

info "Waiting for database to be ready..."
RETRIES=30
until docker compose exec -T db pg_isready -U gl_admin -d gl_ledger > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -eq 0 ]; then
        error "Database failed to start. Check logs with: docker compose logs db"
        exit 1
    fi
    sleep 2
done

info "Running database migrations..."
docker compose run --rm api sh -c "npm run migrate"

info "Seeding initial data..."
docker compose run --rm api sh -c "npm run seed"

info "Starting all services..."
docker compose up -d

success "Luca is running"

# ── Set admin user credentials ─────────────────────────────────────────────────
step "Configuring admin account"

info "Waiting for API to be ready..."
RETRIES=30
until curl -s http://localhost:3000/health > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -eq 0 ]; then
        error "API failed to start. Check logs with: docker compose logs api"
        exit 1
    fi
    sleep 2
done

# Login as default admin and get token
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@localhost","password":"admin"}' 2>/dev/null)

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    # Get the admin user ID
    ME=$(curl -s http://localhost:3000/api/auth/me \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    USER_ID=$(echo "$ME" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$USER_ID" ]; then
        # Update the admin display name
        curl -s -X PUT "http://localhost:3000/api/users/$USER_ID" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"display_name\":\"System Administrator\"}" > /dev/null 2>&1

        # Change password
        curl -s -X POST "http://localhost:3000/api/users/$USER_ID/change-password" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"current_password\":\"admin\",\"new_password\":\"${ADMIN_PASSWORD}\"}" > /dev/null 2>&1

        success "Admin account configured"
    else
        warn "Could not update admin account automatically. Login with admin@localhost / admin and update manually."
    fi
else
    warn "Could not configure admin account automatically. Login with admin@localhost / admin and update manually."
fi

# ── Configure nginx ────────────────────────────────────────────────────────────
step "Configuring web server"

# Disable default nginx site
rm -f /etc/nginx/sites-enabled/default

# Install nginx config from template
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$INSTALL_DIR/nginx.conf.template" \
    > /etc/nginx/sites-available/luca

# For certbot initial setup, we need an HTTP-only config first
cat > /etc/nginx/sites-available/luca-temp <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/luca-temp /etc/nginx/sites-enabled/luca

nginx -t && systemctl reload nginx
success "nginx configured"

# ── SSL certificate ────────────────────────────────────────────────────────────
step "Obtaining SSL certificate"

info "Requesting SSL certificate for $DOMAIN from Let's Encrypt..."

if certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$SSL_EMAIL" \
    --domains "$DOMAIN" \
    --redirect \
    --quiet 2>/dev/null; then

    # Now install the full production nginx config with SSL headers
    ln -sf /etc/nginx/sites-available/luca /etc/nginx/sites-enabled/luca
    rm -f /etc/nginx/sites-available/luca-temp
    nginx -t && systemctl reload nginx

    success "SSL certificate obtained and installed"
else
    warn "SSL certificate setup failed. Your domain may not be pointing to this server yet."
    warn "Luca is still running on HTTP at http://$DOMAIN"
    warn "To add SSL later, run: certbot --nginx -d $DOMAIN"
fi

# ── Set up automatic SSL renewal ──────────────────────────────────────────────
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

# ── Set up Docker auto-start on reboot ────────────────────────────────────────
step "Configuring automatic startup"

cat > /etc/systemd/system/luca.service <<SERVICEEOF
[Unit]
Description=Luca General Ledger
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable luca.service
success "Luca will start automatically on reboot"

# ── Done! ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  =========================================================="
echo "    Luca is installed and running!"
echo "  =========================================================="
echo -e "${NC}"
echo -e "  ${BOLD}Access your accounting system:${NC}"
echo ""
echo -e "    URL:       ${CYAN}https://$DOMAIN${NC}"
echo -e "    Email:     ${CYAN}$ADMIN_EMAIL${NC}"
echo -e "    Password:  (the password you entered during setup)"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo ""
echo -e "    View logs:        ${YELLOW}cd $INSTALL_DIR && docker compose logs -f${NC}"
echo -e "    Stop Luca:        ${YELLOW}cd $INSTALL_DIR && docker compose down${NC}"
echo -e "    Start Luca:       ${YELLOW}cd $INSTALL_DIR && docker compose up -d${NC}"
echo -e "    Update Luca:      ${YELLOW}cd $INSTALL_DIR && git pull && docker compose up -d --build${NC}"
echo ""
echo -e "  ${BOLD}Files:${NC}"
echo ""
echo -e "    Config:           ${YELLOW}$INSTALL_DIR/.env${NC}"
echo -e "    nginx config:     ${YELLOW}/etc/nginx/sites-available/luca${NC}"
echo -e "    Logs:             ${YELLOW}$INSTALL_DIR/logs/${NC}"
echo ""
echo -e "  ${YELLOW}Next step:${NC} Log in and run the setup wizard to configure"
echo -e "  your chart of accounts and company profile."
echo ""
