# MovieAnimation.ai — DNS Configuration

## Domain Information
- **Domain:** movieanimation.ai
- **Registrar:** TBD
- **TLD:** .ai (Anguilla ccTLD)
- **Target:** Production deployment on Azure + local GPU backend

---

## Required DNS Records

### Apex Domain (movieanimation.ai)

```
Type:   A
Name:   @
Value:  <Azure Front Door / Vercel IP>
TTL:    300
```

### WWW Subdomain

```
Type:   CNAME
Name:   www
Value:  movieanimation.ai
TTL:    300
```

### API Subdomain (if separating API from frontend)

```
Type:   CNAME
Name:   api
Value:  <Azure API Management / Load Balancer endpoint>
TTL:    300
```

---

## SSL/TLS Certificates

### Option A: Let's Encrypt (Recommended)

```bash
# Using Certbot with Nginx on the production server
sudo certbot certonly --nginx \
  -d movieanimation.ai \
  -d www.movieanimation.ai

# Certificates will be placed at:
#   /etc/letsencrypt/live/movieanimation.ai/fullchain.pem
#   /etc/letsencrypt/live/movieanimation.ai/privkey.pem

# Copy to project's nginx/ssl directory:
cp /etc/letsencrypt/live/movieanimation.ai/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/movieanimation.ai/privkey.pem nginx/ssl/privkey.pem
```

### Option B: Azure Managed Certificate (if using Azure Front Door)

1. Go to Azure Portal → Front Door → Settings → Domains
2. Add `movieanimation.ai` and `www.movieanimation.ai`
3. Enable "Azure Managed HTTPS"
4. Azure auto-renews via DigiCert

### Option C: Vercel Auto-SSL (if frontend on Vercel)

1. Add domain in Vercel Dashboard → Domains
2. Vercel provisions Let's Encrypt automatically
3. Configure DNS CNAME or A record as instructed by Vercel

---

## Email Configuration (Optional)

### SPF Record

```
Type:   TXT
Name:   @
Value:  v=spf1 include:_spf.google.com ~all
TTL:    300
```

### DKIM (for transactional emails via SendGrid/Resend)

Set up through email provider dashboard.

### DMARC

```
Type:   TXT
Name:   _dmarc
Value:  v=DMARC1; p=quarantine; rua=mailto:admin@simrobotics.com
TTL:    300
```

---

## Deployment Architecture DNS Flow

```
                    ┌──────────────────────┐
                    │   movieanimation.ai  │
                    │   (DNS A/CNAME)      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Azure Front Door /  │
                    │  Vercel Edge Network │
                    │  (SSL termination)   │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
     │  Frontend     │  │  API Proxy │  │  Static     │
     │  (Next.js SSR)│  │  (Nginx)   │  │  Assets     │
     │  Vercel/Azure │  │            │  │  CDN        │
     └───────────────┘  └─────┬──────┘  └─────────────┘
                              │
                   ┌──────────▼───────────┐
                   │  Tailscale VPN       │
                   │  (Azure VNet → LAN)  │
                   └──────────┬───────────┘
                              │
                   ┌──────────▼───────────┐
                   │  Local GPU Node      │
                   │  Backend API :3001   │
                   │  PostgreSQL :5432    │
                   │  Redis :6379         │
                   └──────────────────────┘
```

---

## DNS Propagation Checklist

- [ ] Confirm domain is registered
- [ ] Set nameservers (if using external DNS)
- [ ] Add A/CNAME records as above
- [ ] Wait for propagation (5min — 48hrs, typically <1hr for .ai TLD)
- [ ] Verify: `dig movieanimation.ai +short`
- [ ] Verify: `dig www.movieanimation.ai +short`
- [ ] Verify SSL: `curl -I https://movieanimation.ai`
- [ ] Test HTTPS redirect
- [ ] Test API endpoint: `curl https://movieanimation.ai/api/health`

---

## .ai TLD Notes

- .ai domains are managed by the Anguilla government
- Registration/renewal typically $60-120/yr
- WHOIS privacy may not be available for .ai domains
- Propagation is generally fast (sub-1-hour TTL supported)

---

**Last Updated:** 2026-06-07
**Maintained By:** SimRobotics Corp — DevOps
