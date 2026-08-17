# Namecheap Abuse Response — getvericlick.site (Ref: NC-GLI-5245)

**Date:** August 2026
**Domain:** getvericlick.site
**Reported link:** https://getvericlick.site/r/44wkekw/
**Reporter workspace:** riitmn (riitmn@gmail.com)

---

## 1. Immediate Remediation

The flagged link (`/r/44wkekw/`) and the offending user account (`riitmn@gmail.com`) have been **permanently disabled** at the account and link level. The slug is now dead — any visitor receives a 410 Gone response. The workspace has been deactivated and all links across that workspace have been force-disabled pending investigation.

No other links on getvericlick.site are currently serving traffic. We have taken the product domain **completely offline for tracked-link redirection** as an immediate safety measure (see Section 3).

---

## 2. Investigation Summary

The offending link was created by a newly registered free-tier user who created their account on the same day the phishing link was detected. The workspace had a single domain registered in "degraded" status (DNS not pointing at our infrastructure), meaning the link operated on the shared product domain rather than a verified custom domain. This is the mechanism that allowed the link to appear under `getvericlick.site`.

---

## 3. Structural Change — Permanent Fix

We have implemented a **permanent architectural change** that eliminates the root cause. VeriClick is transitioning to a ZeroBot-style model:

- **Shared product domain removed from link serving.** The `/r/*` path on `getvericlick.site` no longer serves tracked links. All tracked links now resolve exclusively on **user-owned custom domains** that the user has verified control of via DNS TXT records.
- **Link creation requires a verified custom domain.** The backend now blocks any link creation that would result in a URL on a VeriClick-owned domain. Users must add and verify their own domain before their first link goes live.
- **Existing links migrated.** All previously active links on the shared product domain have been disabled and their owners notified with instructions to add a custom domain.

Under this model, VeriClick operates as a pure link-protection engine. The product domain never appears in any customer-facing URL. Phishing or abuse originating through VeriClick would be hosted on the offender's own domain — not ours.

---

## 4. Abuse Prevention Measures

We have implemented (or are deploying) the following measures:

### Already Live
- **Destination URL blocklist.** Known malicious destinations are blocked at link creation time; a growing blocklist is maintained in the database and admin panel.
- **Google Safe Browsing integration.** Every new destination URL is checked against Google's Safe Browsing API before a link is created. Flagged URLs are rejected.
- **Abuse reporting endpoint.** A public `POST /api/abuse/report/` endpoint allows anyone to report a link. Reports are stored in a dedicated table and trigger admin notifications.
- **Admin rapid-response actions.** One-click bulk disable and workspace ban actions in the Django admin panel for instant response to abuse reports.
- **Rate limiting.** Link creation is throttled per-account, preventing automated mass-link creation by bad actors.
- **Destination change logging.** Every change to a link's destination URL is logged with timestamp, IP, and user agent for forensic auditing.

### Deploying (within 48 hours)
- **Terms of Service acceptance recording.** Registration now records an explicit ToS acceptance timestamp. The ToS has been expanded to include clear abuse, takedown, indemnification, and law-enforcement cooperation clauses.
- **Email disclaimers.** All outgoing emails include a notice that VeriClick links must comply with the Terms of Service.
- **Public "Report Abuse" link.** A visible abuse-reporting link is present on every public page (footer, help page, pricing page).
- **Daily destination re-scanning.** Existing links are re-checked daily against the blocklist and Safe Browsing; flagged links are auto-disabled.

---

## 5. Request

We respectfully request reinstatement of `getvericlick.site`. The structural change (Section 3) means this domain will never again serve tracked customer links. It will only serve the product dashboard, API, and admin — none of which present a phishing risk.

We are committed to the safety of our users and the integrity of our platform. We welcome any additional measures Namecheap requires.

---

**Contact:** samuelolaonipekun050@gmail.com
**Abuse email:** support@donlabs.site
**Company:** MAILIONDEV TECHNOLOGY LTD (RC 9233525)
