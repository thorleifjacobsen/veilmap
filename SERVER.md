# VeilMap — Server Setup Guide

Hetzner Ubuntu 24.04 · Caddy · PM2 · Next.js · PostgreSQL

---

## User model

| User      | Purpose                                      |
| --------- | -------------------------------------------- |
| `root`    | System installs, Caddy, PostgreSQL, firewall |
| `veilmap` | Runs the app, owns the code — **no sudo**    |

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

## Step 3 — Firewall & fail2ban

> Run as: **root**

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable fail2ban
systemctl start fail2ban
```

Disable password authentication for SSH (key-only access):

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

> ⚠️ Make sure your SSH key is already added to `~/.ssh/authorized_keys` **before** running this, or you will lock yourself out.

---

## Step 4 — Node.js via nvm

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

## Step 5 — PostgreSQL

> Run as: **root**

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

Create the database user, production database, and shadow database (used by Prisma migrations).
Replace `dittnyepassord` with something strong:

```bash
sudo -u postgres psql << 'EOF'
CREATE USER veilmap WITH PASSWORD 'dittnyepassord';
CREATE DATABASE veilmap OWNER veilmap;
CREATE DATABASE veilmap_shadow OWNER veilmap;
GRANT ALL PRIVILEGES ON DATABASE veilmap TO veilmap;
GRANT ALL PRIVILEGES ON DATABASE veilmap_shadow TO veilmap;
EOF
```

---

## Step 6 — Caddy

> Run as: **root**

Caddy handles reverse proxy and automatic HTTPS via Let's Encrypt.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list

apt update && apt install -y caddy
```

Write the Caddyfile. Replace `veilmap.app` with your domain (or use `:80` for IP-only without HTTPS):

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
}
EOF
```

Enable and start Caddy:

```bash
systemctl enable caddy
systemctl restart caddy
```

> 💡 Point your DNS `A` record to the server IP **before** starting Caddy with a domain — it will automatically provision a TLS certificate.

---

## Step 7 — SSH keys & GitHub access

> Run as: **veilmap**

Generate an SSH key for deploy access:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "veilmap-deploy" -f ~/.ssh/id_github -N ""
cat ~/.ssh/id_github.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Print the public key and add it to the repository:

```bash
cat ~/.ssh/id_github.pub
```

Add it under **GitHub → Repository → Settings → Deploy keys** (read-only is sufficient).

Then add the following as **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret**:

| Name             | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| `SERVER_SSH_KEY` | The contents of `/home/veilmap/.ssh/id_github` (the private key) |
| `SERVER_HOST`    | The server's IP address or domain (e.g. `login.veilmap.app`)    |
| `SERVER_USER`    | `veilmap`                                                        |

---

## Step 8 — Clone & configure the app

> Run as: **veilmap**

```bash
cd ~
git clone git@github.com:thorleifjacobsen/veilmap.git /home/veilmap/app
cd ~/app
npm install
```

Copy the example environment file and edit it:

```bash
cp .env.example .env
nano .env
```

Generate secrets for `NEXTAUTH_SECRET` and `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fill in `.env`:

```env
DATABASE_URL=postgresql://veilmap:CHANGE_THIS_PASSWORD@localhost:5432/veilmap
SHADOW_DATABASE_URL=postgresql://veilmap:CHANGE_THIS_PASSWORD@localhost:5432/veilmap_shadow
NEXTAUTH_SECRET=PASTE_GENERATED_SECRET_HERE
NEXTAUTH_URL=https://veilmap.app
UPLOAD_DIR=public/uploads
MAX_UPLOAD_SIZE_MB=20
AUTH_SECRET=PASTE_GENERATED_SECRET_2_HERE
```

Run the database migration:

```bash
npm run db:migrate
```

---

## Step 9 — PM2 process manager

> Run as: **veilmap**

Install PM2 globally:

```bash
npm install -g pm2
```

Create a logs directory:

```bash
mkdir -p ~/logs
```

Build and start the app with PM2 (uses `ecosystem.config.js` from the repo):

```bash
cd ~/app
npm run build
pm2 start ecosystem.config.js
```

Make PM2 survive reboots:

```bash
pm2 save
pm2 startup
```

> ⚠️ `pm2 startup` will print a command that must be run as **root**. Copy and run it.

Verify:

```bash
pm2 status
curl http://localhost:3000
```

---

## Verify everything works

Open a browser:

| URL                          | Expected           |
| ---------------------------- | ------------------- |
| `https://veilmap.app`        | VeilMap login page  |
| `https://veilmap.app/play/x` | Player display      |

Check services on the server:

```bash
# as root
systemctl status caddy
systemctl status postgresql

# as veilmap
pm2 status
pm2 logs veilmap --lines 50
```

---

## Handy commands

### Deploy a new version

> Run as: **veilmap**

```bash
cd ~/app
git pull
npm install
npm run build
pm2 restart veilmap
```

### PM2 commands

```bash
pm2 status                    # overview
pm2 logs veilmap              # tail logs
pm2 logs veilmap --lines 100  # last 100 lines
pm2 restart veilmap           # restart the app
pm2 reload veilmap            # zero-downtime restart
pm2 stop veilmap              # stop
pm2 delete veilmap            # remove from PM2
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
