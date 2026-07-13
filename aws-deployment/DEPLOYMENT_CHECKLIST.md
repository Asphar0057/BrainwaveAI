# ✅ AWS EC2 Deployment Checklist

Use this checklist to ensure you don't miss any steps during deployment.

## Pre-Deployment

- [ ] Push all code to GitHub
- [ ] Have AWS account ready
- [ ] Have credit card added to AWS (for billing)
- [ ] Have your API keys ready (Gemini, etc.)
- [ ] Know your GitHub repository URL

## AWS Setup

- [ ] Launch EC2 instance (t3.medium recommended)
- [ ] Choose Ubuntu 22.04 LTS
- [ ] Configure security group with ports: 22, 80, 443, 8000
- [ ] Download .pem key file
- [ ] Save .pem file securely (chmod 400)
- [ ] Allocate Elastic IP
- [ ] Associate Elastic IP with instance
- [ ] Note down Elastic IP address: `___________________`

## Initial Connection

- [ ] SSH into instance: `ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP`
- [ ] Connection successful

## Deployment

- [ ] Set GitHub repo URL: `export GITHUB_REPO="https://github.com/..."`
- [ ] Download deploy.sh script
- [ ] Make script executable: `chmod +x deploy.sh`
- [ ] Run deployment: `./deploy.sh`
- [ ] Docker installed successfully
- [ ] Docker Compose installed successfully
- [ ] Repository cloned successfully

## Configuration

- [ ] Edit .env.production: `nano backend/.env.production`
- [ ] Set SECRET_KEY
- [ ] Set GOOGLE_GENERATIVE_AI_KEY
- [ ] Set DATABASE_URL
- [ ] Set ENVIRONMENT=production
- [ ] Set DEBUG=false
- [ ] Save and exit

## Start Application

- [ ] Run deploy.sh again: `./deploy.sh`
- [ ] Containers built successfully
- [ ] Backend container running: `docker ps`
- [ ] Health check passed: `curl http://localhost:8000/api/health`

## External Access Test

- [ ] Test from your computer: `curl http://YOUR_ELASTIC_IP:8000/api/health`
- [ ] Visit in browser: `http://YOUR_ELASTIC_IP:8000/docs`
- [ ] API documentation loads

## Optional: Nginx Setup

- [ ] Install Nginx: `sudo apt-get install -y nginx`
- [ ] Create Nginx config: `/etc/nginx/sites-available/brainwave`
- [ ] Enable site: `sudo ln -s /etc/nginx/sites-available/brainwave /etc/nginx/sites-enabled/`
- [ ] Test config: `sudo nginx -t`
- [ ] Restart Nginx: `sudo systemctl restart nginx`
- [ ] Test through Nginx: `curl http://YOUR_ELASTIC_IP/api/health`

## Optional: SSL Setup

- [ ] Have domain name pointing to Elastic IP
- [ ] Install Certbot: `sudo apt-get install -y certbot python3-certbot-nginx`
- [ ] Get certificate: `sudo certbot --nginx -d yourdomain.com`
- [ ] Test HTTPS: `https://yourdomain.com/api/health`

## Security Hardening

- [ ] Restrict SSH to your IP in security group
- [ ] Enable automatic security updates
- [ ] Setup firewall: `sudo ufw enable`
- [ ] Change all default passwords in .env
- [ ] Review security group rules

## Frontend Connection

- [ ] Update frontend .env with backend URL
- [ ] Test frontend can connect to backend
- [ ] Test login/signup works
- [ ] Test API calls work

## Monitoring Setup

- [ ] Bookmark EC2 console
- [ ] Setup CloudWatch alarms (optional)
- [ ] Test log viewing: `docker-compose logs -f backend`
- [ ] Test container restart: `docker-compose restart backend`

## Backup Setup

- [ ] Test database backup command
- [ ] Setup backup schedule (cron job)
- [ ] Test downloading backup to local machine
- [ ] Document backup location

## Documentation

- [ ] Note down Elastic IP: `___________________`
- [ ] Note down instance ID: `___________________`
- [ ] Save .pem key in secure location
- [ ] Document any custom configurations
- [ ] Share access info with team (if applicable)

## Final Verification

- [ ] Backend responds to health checks
- [ ] API documentation accessible
- [ ] Frontend can connect
- [ ] User registration works
- [ ] User login works
- [ ] AI chat works
- [ ] File uploads work (if applicable)
- [ ] All features tested

## Post-Deployment

- [ ] Monitor logs for first 24 hours
- [ ] Check disk space: `df -h`
- [ ] Check memory usage: `free -h`
- [ ] Setup monitoring alerts
- [ ] Document any issues encountered
- [ ] Create backup of working configuration

## Optional: Auto-Deploy Setup

- [ ] Add EC2_HOST to GitHub Secrets
- [ ] Add EC2_SSH_KEY to GitHub Secrets
- [ ] Test auto-deploy by pushing to main branch
- [ ] Verify deployment workflow runs successfully

## Maintenance Schedule

- [ ] Weekly: Check logs and disk space
- [ ] Weekly: Test backups
- [ ] Monthly: Update system packages
- [ ] Monthly: Review security group rules
- [ ] Monthly: Check AWS billing

---

## Quick Commands Reference

```bash
# View logs
docker-compose -f aws-deployment/docker-compose.production.yml logs -f backend

# Restart
docker-compose -f aws-deployment/docker-compose.production.yml restart backend

# Update from GitHub
./update.sh

# Check status
docker ps
curl http://localhost:8000/api/health

# Backup database
docker exec brainwave-backend-prod cp /app/brainwave_tutor.db /app/exports/backup_$(date +%Y%m%d).db
```

---

**Deployment Date**: ___________________

**Deployed By**: ___________________

**Notes**: 
___________________
___________________
___________________
