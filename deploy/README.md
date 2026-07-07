# PeopleHub OS Production Deploy

This package runs PeopleHub OS on a single Docker host behind nginx.

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
