# VeilMap — Server Setup Guide

Hetzner Ubuntu 24.04 · Caddy · Next.js (single process) · PostgreSQL

## User model

| User | Purpose |
|------|---------|
| `root` | System installs, Caddy, PostgreSQL, firewall |
| `veilmap` | Runs the app, owns the code — **no sudo** |

Switch between them:
```bash
su - veilmap   # root → veilmap
exit           # veilmap → back to root
```

---

## Step 1 — System update & essentials

> Run as: **root**

```bash
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban unzip build-essential
```

---

## Step 2 — Create veilmap user

> Run as: **root**

```bash
adduser veilmap
```

Enter a password when prompted, skip the rest of the fields.

> ⚠️ Do **not** add veilmap to the sudo group.

---

## Step 3 — Firewall

> Run as: **root**

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable fail2ban
systemctl start fail2ban
```

---

## Step 4 — PostgreSQL

> Run as: **root**

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

Create the database and user. Replace `dittnyepassord` with something strong:

```bash
sudo -u postgres psql << 'EOF'
CREATE USER veilmap WITH PASSWORD 'dittnyepassord';
CREATE DATABASE veilmap OWNER veilmap;
GRANT ALL PRIVILEGES ON DATABASE veilmap TO veilmap;
EOF
```

---

## Step 5 — Caddy

> Run as: **root**

Caddy handles reverse proxy and — when you add a domain later — automatic HTTPS with zero extra config.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list

apt update && apt install -y caddy
```

Write the Caddyfile (IP-only for now, no HTTPS yet):

```bash
tee /etc/caddy/Caddyfile << 'EOF'
:80 {
    @ws {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @ws localhost:3000
    reverse_proxy localhost:3000

    handle /uploads/* {
        root * /var/www/veilmap
        file_server
    }
}
EOF
```

Create the uploads folder and hand it to the veilmap user:

```bash
mkdir -p /var/www/veilmap/uploads
chown -R veilmap:veilmap /var/www/veilmap

systemctl enable caddy
systemctl restart caddy
```

---

## Step 6 — Node.js via nvm

> Run as: **veilmap**

```bash
su - veilmap

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

nvm install 20
nvm alias default 20
```

Verify — the path should say `/home/veilmap/.nvm/...`, not `/root/`:

```bash
node --version
which node
```

---

## Step 7 — Clone & configure the app

> Run as: **veilmap**

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/veilmap.git
cd veilmap
npm install
```

Generate a secret for NextAuth:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output, then create `.env.local`:

```bash
nano .env.local
```

```env
DATABASE_URL=postgresql://veilmap:CHANGE_THIS_PASSWORD@localhost:5432/veilmap
NEXTAUTH_SECRET=PASTE_GENERATED_SECRET_HERE
NEXTAUTH_URL=http://YOUR_SERVER_IP
NEXT_PUBLIC_WS_URL=ws://YOUR_SERVER_IP
UPLOAD_DIR=/var/www/veilmap/uploads
MAX_UPLOAD_SIZE_MB=20
NODE_ENV=production
```

Run the database migration:

```bash
npm run db:migrate
# or manually:
psql $DATABASE_URL < db/schema.sql
```

---

## Step 8 — Run the app

> Run as: **veilmap**

**While developing** — hot reload, runs in the foreground:

```bash
npm run dev
```

**Production** — build once, then run in the background:

```bash
npm run build
nohup npm start > ~/veilmap.log 2>&1 &
```

Check it started:

```bash
curl http://localhost:3000
tail -f ~/veilmap.log
```

Stop it:

```bash
pkill -f "next start"
```

---

## Verify everything works

Open a browser on your local machine:

| URL | Expected |
|-----|----------|
| `http://YOUR_SERVER_IP` | VeilMap login page |
| `http://YOUR_SERVER_IP/play/test` | Player display |

Check services on the server:

```bash
# as root
systemctl status caddy
systemctl status postgresql

# as veilmap
curl http://localhost:3000
tail -f ~/veilmap.log
```

---

## When you get a domain — add HTTPS

> Run as: **root**

Point your DNS `A` record to the server IP first. Then just swap the Caddyfile:

```bash
tee /etc/caddy/Caddyfile << 'EOF'
veilmap.app {
    @ws {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @ws localhost:3000
    reverse_proxy localhost:3000

    handle /uploads/* {
        root * /var/www/veilmap
        file_server
    }
}
EOF

systemctl reload caddy
```

That's it — Caddy fetches the TLS certificate automatically and renews it forever.

Then update `.env.local` as **veilmap**:

```env
NEXTAUTH_URL=https://veilmap.app
NEXT_PUBLIC_WS_URL=wss://veilmap.app
```

Rebuild and restart:

```bash
npm run build
pkill -f "next start"
nohup npm start > ~/veilmap.log 2>&1 &
```

---

## Handy commands

### Deploy a new version
> Run as: **veilmap**

```bash
cd ~/veilmap
git pull
npm install
npm run build
pkill -f "next start"
nohup npm start > ~/veilmap.log 2>&1 &
```

### PostgreSQL shell
> Run as: **veilmap**

```bash
psql postgresql://veilmap:CHANGE_THIS_PASSWORD@localhost:5432/veilmap
```

### Caddy logs
> Run as: **root**

```bash
journalctl -u caddy -f
```

### Reload Caddy after config change
> Run as: **root**

```bash
systemctl reload caddy
```