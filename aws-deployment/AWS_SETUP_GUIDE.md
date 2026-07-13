# AWS EC2 Deployment Guide for BrainwaveAI Backend

## 📋 Prerequisites

- AWS Account
- GitHub repository with your code
- Domain name (optional, for custom domain)

## 💰 Cost Estimate

**Recommended Setup (t3.medium):**
- EC2 Instance: ~$30-35/month
- Elastic IP: Free (when attached)
- Storage (30GB): ~$3/month
- **Total: ~$33-38/month**

**Budget Setup (t3.small):**
- EC2 Instance: ~$15-17/month
- Elastic IP: Free (when attached)
- Storage (20GB): ~$2/month
- **Total: ~$17-19/month**

## 🚀 Step-by-Step Deployment

### Step 1: Launch EC2 Instance

1. **Go to AWS Console** → EC2 → Launch Instance

2. **Configure Instance:**
   - **Name**: `brainwave-backend`
   - **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
   - **Instance Type**: 
     - Recommended: `t3.medium` (2 vCPU, 4GB RAM)
     - Budget: `t3.small` (2 vCPU, 2GB RAM)
   - **Key Pair**: Create new or use existing (download .pem file)
   - **Storage**: 30GB gp3 (or 20GB for budget)

3. **Network Settings:**
   - Create new security group or use existing
   - **Allow SSH** (port 22) from your IP
   - **Allow HTTP** (port 80) from anywhere (0.0.0.0/0)
   - **Allow HTTPS** (port 443) from anywhere (0.0.0.0/0)
   - **Allow Custom TCP** (port 8000) from anywhere (for API)

4. **Launch Instance**

### Step 2: Allocate Elastic IP (Static Private IP)

1. **Go to EC2** → Elastic IPs → Allocate Elastic IP address
2. **Associate** the Elastic IP with your instance
3. **Note down** the Elastic IP - this is your static public IP

### Step 3: Connect to EC2 Instance

```bash
# Make key file secure
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

### Step 4: Initial Server Setup

Once connected to your EC2 instance:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install basic tools
sudo apt-get install -y curl wget git htop

# Set timezone (optional)
sudo timedatectl set-timezone America/New_York
```

### Step 5: Download and Run Deployment Script

```bash
# Download deployment script
curl -o deploy.sh https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/aws-deployment/deploy.sh

# Make it executable
chmod +x deploy.sh

# Set your GitHub repository URL
export GITHUB_REPO="https://github.com/YOUR_USERNAME/YOUR_REPO.git"
export GITHUB_BRANCH="main"

# Run deployment
./deploy.sh
```

**OR manually clone and deploy:**

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Run deployment script
cd aws-deployment
chmod +x deploy.sh
./deploy.sh
```

### Step 6: Configure Environment Variables

The script will prompt you to configure `.env.production`. Edit it:

```bash
nano backend/.env.production
```

**Required variables:**

```env
# Security
SECRET_KEY=your-super-secret-key-change-this-in-production

# AI API Keys
GOOGLE_GENERATIVE_AI_KEY=your-gemini-api-key

# Database (SQLite by default, or use PostgreSQL)
DATABASE_URL=sqlite:///./brainwave_tutor.db

# Server
ENVIRONMENT=production
DEBUG=false

# CORS (add your frontend domain)
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000

# Optional: Redis for caching
REDIS_URL=redis://localhost:6379
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

### Step 7: Start the Application

```bash
# If you edited .env, restart the deployment
./deploy.sh
```

### Step 8: Verify Deployment

```bash
# Check if containers are running
docker ps

# Check logs
docker-compose -f aws-deployment/docker-compose.production.yml logs -f backend

# Test API
curl http://localhost:8000/api/health

# Test from outside (use your Elastic IP)
curl http://YOUR_ELASTIC_IP:8000/api/health
```

### Step 9: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/brainwave
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_ELASTIC_IP;  # or your domain name

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Enable and start Nginx:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/brainwave /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable on boot
sudo systemctl enable nginx
```

### Step 10: Setup SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
```

## 🔧 Useful Commands

### Application Management

```bash
# View logs
docker-compose -f aws-deployment/docker-compose.production.yml logs -f backend

# Restart backend
docker-compose -f aws-deployment/docker-compose.production.yml restart backend

# Stop all containers
docker-compose -f aws-deployment/docker-compose.production.yml down

# Start all containers
docker-compose -f aws-deployment/docker-compose.production.yml up -d

# Rebuild and restart
docker-compose -f aws-deployment/docker-compose.production.yml up -d --build

# Access container shell
docker exec -it brainwave-backend-prod bash
```

### Update Application from GitHub

```bash
cd /home/ubuntu/brainwave-backend
git pull origin main
docker-compose -f aws-deployment/docker-compose.production.yml up -d --build
```

### System Monitoring

```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check CPU usage
htop

# Check Docker stats
docker stats

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Database Backup

```bash
# Backup SQLite database
docker exec brainwave-backend-prod cp /app/brainwave_tutor.db /app/exports/backup_$(date +%Y%m%d).db

# Download backup to local machine
scp -i your-key.pem ubuntu@YOUR_ELASTIC_IP:/home/ubuntu/brainwave-backend/backend/exports/backup_*.db ./
```

## 🔒 Security Best Practices

1. **Change default passwords** in `.env.production`
2. **Restrict SSH access** to your IP only in security group
3. **Enable automatic security updates:**
   ```bash
   sudo apt-get install unattended-upgrades
   sudo dpkg-reconfigure --priority=low unattended-upgrades
   ```
4. **Setup firewall:**
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
5. **Regular backups** of database and uploads
6. **Monitor logs** regularly for suspicious activity

## 📊 Monitoring & Maintenance

### Setup Automatic Restarts

```bash
# Docker containers already have restart: unless-stopped
# To ensure Docker starts on boot:
sudo systemctl enable docker
```

### Setup Log Rotation

Docker already handles log rotation, but you can adjust:

```bash
# Edit docker-compose.production.yml logging section
# Already configured with max-size: 10m and max-file: 3
```

### Monitor Disk Space

```bash
# Clean up old Docker images
docker system prune -a

# Clean up old logs
docker-compose -f aws-deployment/docker-compose.production.yml logs --tail=0 backend
```

## 🐛 Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose -f aws-deployment/docker-compose.production.yml logs backend

# Check if port is in use
sudo netstat -tulpn | grep 8000

# Restart Docker
sudo systemctl restart docker
```

### Out of memory

```bash
# Check memory
free -h

# Consider upgrading to larger instance or add swap:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Can't connect from outside

1. Check security group allows port 8000
2. Check if backend is running: `docker ps`
3. Check if port is listening: `sudo netstat -tulpn | grep 8000`
4. Check Nginx configuration if using reverse proxy

## 📱 Connect Frontend

Update your frontend `.env` or config:

```env
REACT_APP_API_URL=http://YOUR_ELASTIC_IP:8000
# or with domain and SSL:
REACT_APP_API_URL=https://api.yourdomain.com
```

## 💡 Tips

1. **Use Elastic IP** to avoid IP changes on instance restart
2. **Setup CloudWatch** for monitoring (optional)
3. **Use RDS** for PostgreSQL if scaling (optional)
4. **Use S3** for media storage if scaling (optional)
5. **Setup CI/CD** with GitHub Actions for automatic deployments

## 📞 Support

If you encounter issues:
1. Check logs: `docker-compose logs backend`
2. Check GitHub issues
3. Verify all environment variables are set correctly
