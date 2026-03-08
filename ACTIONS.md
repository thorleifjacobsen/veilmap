# GitHub Actions Configuration Guide

This document describes everything you need to configure on both GitHub and your VPS to make the **Deploy to Production** and **Preview Deployment** workflows function correctly.

---

## GitHub Secrets

Go to **Settings → Secrets and variables → Actions** in the repository and add the following repository secrets:

| Secret | Description |
|---|---|
| `SERVER_HOST` | The IP address or hostname of your VPS |
| `SERVER_USER` | The SSH username used to connect to the VPS (e.g. `veilmap`) |
| `SERVER_SSH_KEY` | The **private** SSH key whose public counterpart is in `~/.ssh/authorized_keys` on the server |

---

## VPS Requirements

### System Packages

Install the following on your Ubuntu VPS:

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (global process manager)
sudo npm install -g pm2

# Caddy (reverse proxy)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Git
sudo apt install -y git
```

### User & Directory Structure

Create a dedicated user and the required directories:

```bash
sudo useradd -m -s /bin/bash veilmap
sudo mkdir -p /home/veilmap/app
sudo mkdir -p /home/veilmap/previews
sudo chown -R veilmap:veilmap /home/veilmap
```

### SSH Key for GitHub

The server user (`veilmap`) needs an SSH key pair so it can clone the repository during preview deployments:

```bash
sudo -u veilmap ssh-keygen -t ed25519 -C "veilmap-deploy" -f /home/veilmap/.ssh/id_ed25519 -N ""
sudo -u veilmap cat /home/veilmap/.ssh/id_ed25519.pub
```

Add the printed public key to the repository under **Settings → Deploy keys** (read-only access is sufficient).

### Production App

Clone the production app to `/home/veilmap/app`:

```bash
sudo -u veilmap git clone git@github.com:thorleifjacobsen/veilmap.git /home/veilmap/app
```

Create a `.env` file at `/home/veilmap/app/.env` with all required environment variables (see the app's own documentation). At minimum:

```
PORT=3000
NEXT_PUBLIC_BASE_URL=https://veilmap.app
DATABASE_URL=postgresql://user:password@localhost:5432/veilmap
```

### ecosystem.config.js

Create `/home/veilmap/app/ecosystem.config.js` so PM2 knows how to run the app:

```js
module.exports = {
  apps: [
    {
      name: 'veilmap',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/veilmap/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
}
```

Start the production process for the first time:

```bash
sudo -u veilmap pm2 start /home/veilmap/app/ecosystem.config.js
sudo -u veilmap pm2 save
sudo -u veilmap pm2 startup  # follow the printed instructions to enable PM2 on boot
```

---

## Caddy Configuration

### Main Caddyfile

Create `/etc/caddy/Caddyfile`:

```
veilmap.app {
  reverse_proxy localhost:3000
}

import /etc/caddy/previews/*.conf
```

### Previews Directory

Create the directory where preview Caddy configs will be written:

```bash
sudo mkdir -p /etc/caddy/previews
```

### Sudoers for Caddy Commands

The `veilmap` user needs permission to write preview configs and reload Caddy without a password. Add the following with `sudo visudo`:

```
veilmap ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/caddy/previews/*, /usr/bin/rm /etc/caddy/previews/*, /usr/sbin/caddy reload *
```

Restart Caddy to apply the main config:

```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
```

---

## DNS

For preview deployments to be accessible, set up a wildcard DNS record pointing to your VPS:

| Type | Name | Value |
|---|---|---|
| A | `veilmap.app` | `<your VPS IP>` |
| A | `*.veilmap.app` | `<your VPS IP>` |

> **Note:** The preview workflow uses `tls internal` (self-signed) for preview domains. If you want valid TLS certificates for previews, change the Caddy block in the workflow to use `tls` (ACME) instead — but this requires the wildcard DNS to be publicly resolvable, and the VPS must be reachable on ports 80 and 443 (firewall rules must allow HTTP/HTTPS traffic) so the ACME CA can validate domain ownership.

---

## How the Workflows Behave

### `deploy.yaml` — Deploy to Production

- Triggers on every push to `main` that touches relevant source files, or manually via **Actions → Run workflow**.
- SSHes into the VPS, pulls the latest code, runs `npm ci`, migrates the database, builds the app, then restarts the `veilmap` PM2 process.
- Uses a file lock (`/tmp/preview-build.lock`) to avoid collisions with concurrent preview builds.

### `preview.yaml` — Preview Deployment

- **On PR opened / synchronize / reopened:** deploys the branch to `/home/veilmap/previews/pr-<number>/` on the VPS, starts a PM2 process named `veilmap-pr-<number>` on port `3000 + <PR number>`, creates a Caddy config, and posts the preview URL as a PR comment.
- **On PR closed:** stops and removes the PM2 process, deletes the preview directory and its Caddy config, and posts a cleanup comment on the PR.
- Can also be triggered manually via **Actions → Run workflow** by providing a PR number and branch name.
