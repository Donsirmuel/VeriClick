# Radix Registry Unsuspension Request — getvericlick.site

**Date:** August 2026
**Domain:** getvericlick.site
**Reported phishing URL:** https://getvericlick.site/r/44wkekw/
**Reported by:** Netcraft
**Registrant email:** samuelolaonipekun050@gmail.com

---

## Steps Completed

### 1. Phishing URL Removed
The flagged link (`/r/44wkekw/`) and the offending user account have been **permanently disabled**. The slug returns a 410 Gone response. All links across that workspace have been force-disabled.

### 2. Phishing Contents Cleared
We have implemented a **permanent structural change** that eliminates the root cause:

- **The `/r/*` path on `getvericlick.site` no longer serves tracked links.** This path has been removed from our web server configuration entirely. The domain now only serves the product dashboard, API, and admin panel.
- **All tracked links require user-owned custom domains.** Link creation is blocked unless the user has verified control of their own domain via DNS TXT records. The product domain never appears in any customer-facing URL.
- **All existing product-domain links have been disabled.** We ran a migration to disable every link that was using the shared product domain and emailed affected users.

### 3. Security Measures Implemented
- **Destination URL blocklist** — known malicious destinations are blocked at link creation time
- **Google Safe Browsing integration** — every destination is checked before link creation
- **Public abuse reporting** — anyone can report a link via our abuse endpoint
- **Rate limiting** — 30 link creates per hour per account
- **Admin rapid-response** — one-click bulk disable and workspace ban
- **Destination change logging** — every URL change logged with IP and user agent
- **Daily re-scanning** — all active links re-checked daily against blocklist and Safe Browsing
- **Expanded Terms of Service** — includes abuse takedown, indemnification, and law-enforcement cooperation clauses

---

## Contact

**Name:** Samuel Olaonipekun
**Email:** samuelolaonipekun050@gmail.com
**Company:** MAILIONDEV TECHNOLOGY LTD (RC 9233525)
**Abuse email:** support@donlabs.site
