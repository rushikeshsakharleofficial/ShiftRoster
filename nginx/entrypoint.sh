#!/bin/sh
set -e

DOMAIN="${DOMAIN:-localhost}"
PROTOCOL="${PROTOCOL:-http}"
BACKEND_URL="${BACKEND_URL:-http://backend:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://frontend:80}"
SSL_CERT="${SSL_CERT:-/etc/nginx/ssl/cert.pem}"
SSL_KEY="${SSL_KEY:-/etc/nginx/ssl/key.pem}"

COMMON_LOCATIONS='
    location /api {
        proxy_pass '"$BACKEND_URL"';
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location /uploads {
        proxy_pass '"$BACKEND_URL"';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass '"$FRONTEND_URL"';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }'

if [ "$PROTOCOL" = "https" ] && [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "Generating HTTPS nginx config for domain: $DOMAIN"
    cat > /etc/nginx/conf.d/default.conf << CONF
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

${COMMON_LOCATIONS}
}
CONF
else
    echo "Generating HTTP nginx config for domain: $DOMAIN"
    cat > /etc/nginx/conf.d/default.conf << CONF
server {
    listen 80;
    listen 443 ssl;
    server_name ${DOMAIN};

    # Self-signed fallback cert (only used when SSL_CERT/SSL_KEY not provided)
    ssl_certificate /etc/ssl/nginx/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/nginx/nginx-selfsigned.key;
    ssl_protocols TLSv1.2 TLSv1.3;

${COMMON_LOCATIONS}
}
CONF
    # Generate self-signed cert if it doesn't exist
    if [ ! -f /etc/ssl/nginx/nginx-selfsigned.crt ]; then
        mkdir -p /etc/ssl/nginx
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout /etc/ssl/nginx/nginx-selfsigned.key \
            -out /etc/ssl/nginx/nginx-selfsigned.crt \
            -subj "/C=IN/ST=State/L=City/O=ShiftRoster/CN=${DOMAIN}" 2>/dev/null || true
    fi
fi

echo "Starting nginx..."
exec nginx -g "daemon off;"
