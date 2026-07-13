# AWS EC2 Quick Reference Card

## 🎯 Instance Recommendations

| Instance | vCPU | RAM | Cost/Month | Best For |
|----------|------|-----|------------|----------|
| **t3.medium** | 2 | 4GB | ~$30-35 | Recommended - handles AI workloads well |
| **t3a.medium** | 2 | 4GB | ~$27-30 | Same as t3.medium but AMD (cheaper) |
| t3.small | 2 | 2GB | ~$15-17 | Budget option - may struggle with heavy AI |
| t3.large | 2 | 8GB | ~$60-70 | If you need more power |

## 🔌 Security Group Ports

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH access |
| 80 | TCP | 0.0.0.0/0 | HTTP (Nginx) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (SSL) |
| 8000 | TCP | 0.0.0.0/0 | Backend API |

## 📝 Essential Commands

### Deployment
```bash
# Initial deployment
./deploy.sh

# Update from GitHub
./update.sh

# Manual update
cd /home/ubuntu/brainwave-backend
git pull origin main
docker-compose -f aws-deployment/docker-compose.production.yml up -d --build
```

### Container Management
```bash
# View logs
docker-compose -f aws-deployment/docker-compose.production.yml logs -f backend

# Restart
docker-compose -f aws-deployment/docker-compose.production.yml restart backend

# Stop
docker-compose -f aws-deployment/docker-compose.production.yml down

# Start
docker-compose -f aws-deployment/docker-compose.production.yml up -d

# Shell access
docker exec -it brainwave-backend-prod bash
```

### Monitoring
```bash
# Check running containers
docker ps

# Check resource usage
docker stats

# Check disk space
df -h

# Check memory
free -h

# System monitor
htop
```

### Nginx
```bash
# Test config
sudo nginx -t

# Restart
sudo systemctl restart nginx

# View logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Backup
```bash
# Backup database
docker exec brainwave-backend-prod cp /app/brainwave_tutor.db /app/exports/backup_$(date +%Y%m%d).db

# Download to local
scp -i your-key.pem ubuntu@YOUR_IP:/home/ubuntu/brainwave-backend/backend/exports/backup_*.db ./
```

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose -f aws-deployment/docker-compose.production.yml logs backend

# Check if port is in use
sudo netstat -tulpn | grep 8000

# Restart Docker
sudo systemctl restart docker
```

### Out of disk space
```bash
# Clean Docker
docker system prune -a

# Check space
df -h
```

### Can't connect
1. Check security group allows port 8000
2. Check backend is running: `docker ps`
3. Test locally: `curl http://localhost:8000/api/health`
4. Check Nginx if using reverse proxy

## 📍 Important Paths

| Path | Description |
|------|-------------|
| `/home/ubuntu/brainwave-backend` | Application directory |
| `/home/ubuntu/brainwave-backend/backend/.env.production` | Environment config |
| `/var/log/nginx/` | Nginx logs |
| `/etc/nginx/sites-available/brainwave` | Nginx config |

## 🌐 URLs

| URL | Description |
|-----|-------------|
| `http://YOUR_IP:8000` | Backend API |
| `http://YOUR_IP:8000/docs` | API Documentation (Swagger) |
| `http://YOUR_IP:8000/api/health` | Health check |

## 🔐 Environment Variables (Required)

```env
SECRET_KEY=your-secret-key
GOOGLE_GENERATIVE_AI_KEY=your-gemini-key
DATABASE_URL=sqlite:///./brainwave_tutor.db
ENVIRONMENT=production
DEBUG=false
```

## 💡 Pro Tips

1. **Always use Elastic IP** - prevents IP changes on restart
2. **Setup swap** if using t3.small (2GB RAM may not be enough)
3. **Enable automatic security updates**
4. **Setup CloudWatch alarms** for monitoring
5. **Regular backups** of database and uploads
6. **Use Nginx** as reverse proxy for better performance
7. **Setup SSL** with Let's Encrypt (free)

## 🚨 Emergency Commands

```bash
# Stop everything
docker-compose -f aws-deployment/docker-compose.production.yml down

# Restart Docker service
sudo systemctl restart docker

# Reboot instance (last resort)
sudo reboot
```

## 📞 Health Check

```bash
# Local check
curl http://localhost:8000/api/health

# External check (from your computer)
curl http://YOUR_ELASTIC_IP:8000/api/health
```

Expected response: `{"status":"healthy"}`
