# Cloudflare Origin TLS Certificate

Place the Cloudflare Origin Certificate and private key in this directory.

## How to get them

1. Go to Cloudflare dashboard → SSL/TLS → Origin Server
2. Click "Create Certificate"
3. Select "Generate private key and CSR with Cloudflare"
4. Hostnames: `vericlick.site`, `www.vericlick.site`
5. Validity: 15 years (default)
6. Click "Create"
7. Download both files:
   - Origin certificate → save as `origin.crt`
   - Private key → save as `origin.key`

## File names

Caddy expects exactly these filenames:
- `origin.crt` — the Cloudflare Origin Certificate (PEM format)
- `origin.key` — the private key (PEM format)

## After placing the files

```bash
docker compose up -d --build
```

Caddy will use the manual cert instead of ACME. No rate limits.
