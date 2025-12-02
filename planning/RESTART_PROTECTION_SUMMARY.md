# 🔒 Restart Protection System - Implementation Summary

## 📋 What Was Created

### 1. Safe Restart Script (`scripts/safe-restart.sh`)
**Purpose**: Checks for active jobs before allowing service restart

**Features**:
- ✅ Checks for active jobs via API
- ✅ Blocks restart if jobs are running (unless `--force`)
- ✅ Requires confirmation for force restarts
- ✅ Logs restart reason
- ✅ Shows job details before blocking

**Usage**:
```bash
# Safe restart (blocks if jobs active)
bash scripts/safe-restart.sh --reason "Deploy bug fix"

# Force restart (interrupts jobs)
bash scripts/safe-restart.sh --force --reason "Critical patch"
```

---

### 2. Block Unsafe Restart Script (`scripts/block-unsafe-restart.sh`)
**Purpose**: Prevents direct `systemctl restart` commands

**Features**:
- ✅ Shows error message when direct restart attempted
- ✅ Guides user to use safe restart script
- ✅ Installed as bash alias to intercept systemctl commands

---

### 3. Admin Restart API (`app/api/admin_restart_routes.py`)
**Purpose**: Authorized service restarts via API with job protection

**Endpoint**: `POST /api/admin/restart-service`

**Features**:
- ✅ Token-based authentication
- ✅ Checks for active jobs
- ✅ Blocks restart if jobs active (unless force=true)
- ✅ Marks interrupted jobs in database
- ✅ Logs all restart attempts to Sentry

**Example**:
```bash
curl -X POST http://localhost:8000/api/admin/restart-service \
  -H "Content-Type: application/json" \
  -d '{
    "force": false,
    "reason": "Deploy new features",
    "admin_token": "your-token"
  }'
```

---

### 4. Documentation (`docs/restart-protection-setup.md`)
**Purpose**: Complete installation and usage guide

**Includes**:
- ✅ Installation steps
- ✅ Bash alias setup
- ✅ Admin token configuration
- ✅ Usage examples
- ✅ Security best practices
- ✅ Testing procedures

---

## 🚀 Installation Steps

### Step 1: Make Scripts Executable
```bash
cd /var/www/mivaa-pdf-extractor
chmod +x scripts/safe-restart.sh
chmod +x scripts/block-unsafe-restart.sh
```

### Step 2: Add Bash Alias
Add to `/root/.bashrc`:
```bash
systemctl() {
    if [[ "$1" == "restart" && "$2" == "mivaa-pdf-extractor" ]]; then
        bash /var/www/mivaa-pdf-extractor/scripts/block-unsafe-restart.sh
    else
        command systemctl "$@"
    fi
}
```

Reload:
```bash
source /root/.bashrc
```

### Step 3: Set Admin Token
Generate token:
```bash
openssl rand -hex 32
```

Add to `/etc/systemd/system/mivaa-pdf-extractor.service`:
```ini
Environment=ADMIN_RESTART_TOKEN=your-generated-token
```

Reload systemd:
```bash
sudo systemctl daemon-reload
sudo systemctl restart mivaa-pdf-extractor
```

---

## 🎯 How It Works

### Scenario 1: No Active Jobs
```
User: systemctl restart mivaa-pdf-extractor
↓
Bash Alias: Intercepts command
↓
Safe Script: Checks API for active jobs
↓
API: Returns 0 active jobs
↓
Safe Script: ✅ Restarts service immediately
```

### Scenario 2: Active Jobs (No Force)
```
User: systemctl restart mivaa-pdf-extractor
↓
Bash Alias: Intercepts command
↓
Safe Script: Checks API for active jobs
↓
API: Returns 1 active job (processing)
↓
Safe Script: ❌ BLOCKS restart, shows job details
↓
User: Must wait or use --force
```

### Scenario 3: Active Jobs (Force)
```
User: bash scripts/safe-restart.sh --force --reason "Emergency"
↓
Safe Script: Checks API for active jobs
↓
API: Returns 1 active job
↓
Safe Script: ⚠️ Prompts for confirmation
↓
User: Confirms "yes"
↓
Safe Script: Marks job as interrupted in DB
↓
Safe Script: ✅ Restarts service
```

---

## 🔐 Security Features

1. **Token Authentication**: Admin API requires secret token
2. **Bash Alias Protection**: Prevents accidental direct restarts
3. **Audit Logging**: All restart attempts logged to Sentry
4. **Job Protection**: Active jobs marked as interrupted before restart
5. **Confirmation Prompts**: Force restarts require explicit confirmation

---

## 📊 Benefits

✅ **Prevents Data Loss**: No more interrupted jobs from accidental restarts  
✅ **Audit Trail**: All restarts logged with reason  
✅ **User-Friendly**: Clear error messages and guidance  
✅ **Flexible**: Force option for emergencies  
✅ **Automated**: Works with GitHub Actions deployments  

---

## 🧪 Testing

Test the system:
```bash
# 1. Start a test job
python3 scripts/testing/comprehensive_nova_test.py

# 2. Try to restart (should be blocked)
systemctl restart mivaa-pdf-extractor
# Expected: ❌ RESTART BLOCKED!

# 3. Force restart
bash scripts/safe-restart.sh --force --reason "Testing"
# Expected: Prompts for confirmation, then restarts
```

---

## 📝 Next Steps

1. **Deploy to server** (commit and push changes)
2. **Install bash alias** on server
3. **Generate and set admin token**
4. **Test the protection system**
5. **Update GitHub Actions** to use safe restart

