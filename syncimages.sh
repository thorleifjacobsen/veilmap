#!/bin/bash
# Sync uploads between local and remote server (bidirectional, no deletes)
# SSH as root, then use sudo to rsync as veilmap user
rsync -avz --ignore-existing --rsync-path="sudo -u veilmap rsync" root@veilmap:/home/veilmap/app/public/uploads/ ./public/uploads/
rsync -avz --ignore-existing --rsync-path="sudo -u veilmap rsync" ./public/uploads/ root@veilmap:/home/veilmap/app/public/uploads/

# Login as root, su as veilmap and rebuild the app then restart PM2
ssh root@veilmap << 'EOF'
su - veilmap -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd ~/app && npm run build && pm2 restart veilmap'
EOF