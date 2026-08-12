# Bundled datacenter IP datasets

`ip2asn-v4-dc.tsv.gz` and `ip2asn-v6-dc.tsv.gz` are subsets of the free
iptoasn.com IP-to-ASN dumps, filtered to hosting/datacenter/cloud/VPN
networks. VeriClick uses them to block links served to bots that come from
server infrastructure.

## Regenerate with fresh data

```bash
# 1. Download the hourly iptoasn.com dumps (IPv4 and IPv6).
curl -L -o ip2asn-v4.tsv.gz https://iptoasn.com/data/ip2asn-v4.tsv.gz
curl -L -o ip2asn-v6.tsv.gz https://iptoasn.com/data/ip2asn-v6.tsv.gz

# 2. Keep only rows whose org name matches the datacenter keywords.
#    Column layout: start_ip<TAB>end_ip<TAB>asn<TAB>country<TAB>org
python - <<'PY'
import gzip, re
kw = re.compile(
    r'hosting|cloud|datacenter|data center|server|colo|dedicated|compute|vps'
    r'|ovh|hetzner|digitalocean|linode|vultr|choopa|contabo|leaseweb|scaleway'
    r'|quadranet|psychz|m247|fiberhub|iweb|amazon|microsoft|google|oracle'
    r'|alibaba|tencent|softlayer|ibm|hostven|hostgator|bluehost|namecheap',
    re.I,
)
for src, dst in (('ip2asn-v4.tsv.gz', 'ip2asn-v4-dc.tsv.gz'),
                 ('ip2asn-v6.tsv.gz', 'ip2asn-v6-dc.tsv.gz')):
    n = 0
    with gzip.open(src, 'rt', errors='replace') as f, gzip.open(dst, 'wt') as w:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 5 and kw.search(p[4]):
                w.write(f'{p[0]}\t{p[1]}\t{p[2]}\t{p[3]}\t{p[4]}\n')
                n += 1
    print(dst, n)
PY

# 3. Replace the two files in this directory and commit them.
```

## Loading at runtime

The backend imports these files into the `IpAsnRange` table:

- On container boot via the Dockerfile (`python manage.py import_asn`,
  idempotent — skips when the table is already seeded).
- Manually at any time: `python manage.py import_asn --refresh`
