# VioHr Production Deploy

This package runs VioHr on a single Docker host behind nginx.

## Subdomain

Point your subdomain to the Hetzner server:

```text
Type: A
Name: viohr
Value: 167.233.137.16
TTL: 300
```

For IPv6, add an `AAAA` record only if you know the exact assigned IPv6 address. Do not paste the `/64` network prefix directly into DNS.

```text
Type: AAAA
Name: viohr
Value: <server IPv6 address>
TTL: 300
```

For the current HRMS app, set these in `deploy/.env.prod`:

```text
PUBLIC_HOST=viohr.triviontechnologies.com
APP_URL=https://viohr.triviontechnologies.com
NEXTAUTH_URL=https://viohr.triviontechnologies.com
NEXT_PUBLIC_APP_URL=https://viohr.triviontechnologies.com
NEXT_PUBLIC_API_URL=/api/v1
```

The nginx container uses `PUBLIC_HOST` for `server_name`.
The nginx container terminates TLS using certificates stored under `deploy/certbot/conf`.

When you buy the VioHr domain later, use this split:

```text
app.viohr.com  # HRMS app
api.viohr.com  # public API later
viohr.com      # marketing site
```

The current app should keep `NEXT_PUBLIC_API_URL=/api/v1` so browser API calls stay same-origin through nginx.

## TLS Renewal

Issue the first certificate before starting the TLS nginx config:

```bash
cd /opt/peoplehub/deploy
docker compose -p peoplehub -f docker-compose.prod.yml --env-file .env.prod stop nginx
mkdir -p certbot/conf certbot/www
docker run --rm -p 80:80 \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone --non-interactive --agree-tos \
  --register-unsafely-without-email -d viohr.triviontechnologies.com
docker compose -p peoplehub -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Renew manually or from cron:

```bash
cd /opt/peoplehub/deploy
docker run --rm \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  certbot/certbot renew --webroot -w /var/www/certbot --quiet
docker compose -p peoplehub -f docker-compose.prod.yml --env-file .env.prod restart nginx
```

## Server Cutover

1. Copy the repo to the server.
2. Create `deploy/.env.prod` from `deploy/.env.prod.example`.
3. Stop the old app that owns ports 80/443.
4. Run:

```bash
cd deploy
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The API container runs Prisma migrations before starting.

## Health Checks

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -I http://127.0.0.1
curl -I http://127.0.0.1/api/docs
```

## GitHub Actions Auto Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`.

Required repository secrets:

```text
DEPLOY_HOST=167.233.137.16
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_PATH=/opt/peoplehub
DEPLOY_SSH_KEY=<private key for a key listed in /root/.ssh/authorized_keys>
```

From this machine, after `gh auth login`, set them with:

```bash
gh secret set DEPLOY_HOST --body "167.233.137.16"
gh secret set DEPLOY_USER --body "root"
gh secret set DEPLOY_PORT --body "22"
gh secret set DEPLOY_PATH --body "/opt/peoplehub"
gh secret set DEPLOY_SSH_KEY < ~/.ssh/gh_deploy
```

The workflow:

1. Builds the app in GitHub Actions.
2. Uploads a tarball of the pushed commit to the server.
3. Preserves the existing server-only `deploy/.env.prod`.
4. Replaces `/opt/peoplehub` with the new release.
5. Rebuilds and restarts the `peoplehub` Docker Compose project.
6. Runs `curl --head http://127.0.0.1` on the server as a health check.

If Docker Compose fails during activation, the workflow moves the previous release back and tries to restart it.

## First User

Open the public URL and use **Sign up**. Signup creates a new tenant and routes the owner into `/setup`.

## Transactional Email

VioHr supports tenant SMTP from the Communications screen. If no active tenant SMTP
provider exists, the API uses the platform Resend configuration from
`deploy/.env.prod`:

```text
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=noreply@your-verified-domain.com
RESEND_FROM_NAME=VioHr
RESEND_REPLY_TO=support@your-domain.com
```

Verify the sending domain in Resend before using it for real employee invites,
password/reset emails, payroll notices, and approval notifications.
