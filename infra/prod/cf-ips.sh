#!/usr/bin/env bash
# Runs ON THE SERVER (cron, weekly, as seap). Writes Caddy snippets with the
# current Cloudflare IP ranges into /srv/seap/caddy and reloads Caddy when they
# change, so the origin keeps answering only Cloudflare.
set -euo pipefail
out=/srv/seap/caddy; mkdir -p "$out"
v4=$(curl -fsS https://www.cloudflare.com/ips-v4); v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
ranges=$(printf '%s\n%s\n' "$v4" "$v6" | grep -E '^[0-9a-f.:/]+$' | tr '\n' ' ')
[ -n "$ranges" ] || { echo "no ranges fetched"; exit 1; }
tmp=$(mktemp -d)
printf '(cloudflare_only) {\n\t@notcf not remote_ip %s\n\tabort @notcf\n}\n' "$ranges" > "$tmp/cloudflare-only.caddy"
printf 'trusted_proxies static %s\n' "$ranges" > "$tmp/cloudflare-trusted.caddy"
if ! cmp -s "$tmp/cloudflare-only.caddy" "$out/cloudflare-only.caddy" 2>/dev/null; then
  cp "$tmp"/*.caddy "$out"/
  cd /srv/seap/src/infra/prod && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
  echo "cloudflare ranges updated $(date -u +%FT%TZ)"
fi
rm -rf "$tmp"
