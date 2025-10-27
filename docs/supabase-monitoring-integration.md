# Supabase Monitoring Integration

## Overview

Integrate real-time Supabase resource monitoring into the platform UI to prevent upload failures and provide visibility into resource usage.

**Goals:**
1. Show storage/database usage in Admin Dashboard
2. Display current Supabase status in PDF Upload Modal
3. Warn users BEFORE uploads fail due to storage limits
4. Provide upgrade recommendations when approaching limits

---

## Backend API (✅ DEPLOYED)

### Endpoints

**Base URL:** `https://v1api.materialshub.gr/api/monitoring`

#### 1. GET /supabase-status

Returns complete Supabase resource usage.

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-10-26T19:30:00Z",
  "health_status": "healthy",
  "database": {
    "tables": [
      {"table": "documents", "rows": 52},
      {"table": "document_chunks", "rows": 15498},
      {"table": "document_images", "rows": 1431}
    ],
    "total_rows": 19965
  },
  "storage": {
    "buckets": [
      {"bucket": "pdf-tiles", "files": 850, "size_mb": 245.5, "size_gb": 0.240}
    ],
    "total_files": 1000,
    "total_size_gb": 0.362
  },
  "limits": {
    "storage_gb": 1.0,
    "database_size_gb": 0.5
  },
  "usage": {
    "storage_percent": 36.2,
    "storage_remaining_gb": 0.638
  },
  "warnings": [],
  "can_upload": true
}
```

**Health Status Values:**
- `healthy` - Usage < 50%
- `notice` - Usage 50-80%
- `warning` - Usage 80-90%
- `critical` - Usage > 90%

#### 2. GET /health

Quick health check for monitoring systems.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "checks": [
    {"check": "database", "status": "ok", "message": "Database is accessible"},
    {"check": "storage", "status": "ok", "message": "Storage is accessible"}
  ]
}
```

#### 3. GET /storage-estimate

Estimate if there's enough storage for a PDF upload.

**Parameters:**
- `file_size_mb` (required) - Size of PDF file in MB
- `estimated_images` (optional, default: 50) - Estimated number of images to extract

**Response:**
```json
{
  "success": true,
  "is_safe": true,
  "current_usage_gb": 0.362,
  "estimated_additional_gb": 0.069,
  "projected_usage_gb": 0.431,
  "projected_usage_percent": 43.1,
  "storage_limit_gb": 1.0,
  "recommendation": "safe",
  "message": "Upload is safe"
}
```

---

## Frontend Integration (TODO)

### 1. Admin Dashboard - Supabase Monitoring Page

**Location:** `src/app/admin/supabase-monitoring/page.tsx`

**Features:**
- Real-time resource usage display
- Storage usage per bucket (chart)
- Database row counts per table (chart)
- Color-coded warnings (green < 50%, yellow 50-80%, orange 80-90%, red > 90%)
- Auto-refresh every 30 seconds
- Manual refresh button
- Upgrade recommendations when needed

**Implementation:**
```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function SupabaseMonitoringPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const response = await fetch('https://v1api.materialshub.gr/api/monitoring/supabase-status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const getColorClass = (percent) => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    if (percent < 90) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Supabase Resource Monitoring</h1>
        <Button onClick={fetchStatus}>Refresh</Button>
      </div>

      {/* Warnings */}
      {status.warnings.map((warning, i) => (
        <Alert key={i} variant={warning.type === 'critical' ? 'destructive' : 'default'}>
          <AlertTitle>{warning.type.toUpperCase()}</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Storage Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={status.usage.storage_percent} 
              className={getColorClass(status.usage.storage_percent)} 
            />
            <p className="mt-2">
              {status.storage.total_size_gb} GB / {status.limits.storage_gb} GB 
              ({status.usage.storage_percent}%)
            </p>
            <p className="text-sm text-gray-500">
              {status.usage.storage_remaining_gb} GB remaining
            </p>
          </CardContent>
        </Card>

        {/* Database Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Database Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status.database.total_rows.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Rows</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### 2. PDF Upload Modal - Storage Status Display

**Location:** `src/components/knowledge-base/PDFUploadModal.tsx`

**Features:**
- Show current storage status BEFORE upload
- Estimate storage needed for current PDF
- Block upload if storage > 95%
- Show warning if storage > 80%
- Display upgrade link if needed

**Implementation:**
```typescript
const [storageStatus, setStorageStatus] = useState(null);
const [uploadEstimate, setUploadEstimate] = useState(null);

// Fetch storage status on modal open
useEffect(() => {
  if (isOpen) {
    fetchStorageStatus();
  }
}, [isOpen]);

const fetchStorageStatus = async () => {
  const response = await fetch('https://v1api.materialshub.gr/api/monitoring/supabase-status');
  const data = await response.json();
  setStorageStatus(data);
};

// Estimate storage when file is selected
const handleFileSelect = async (file) => {
  const fileSizeMB = file.size / 1024 / 1024;
  const response = await fetch(
    `https://v1api.materialshub.gr/api/monitoring/storage-estimate?file_size_mb=${fileSizeMB}&estimated_images=50`
  );
  const estimate = await response.json();
  setUploadEstimate(estimate);
};

// In the modal JSX:
{storageStatus && (
  <Alert variant={storageStatus.health_status === 'critical' ? 'destructive' : 'default'}>
    <AlertTitle>Storage Status</AlertTitle>
    <AlertDescription>
      {storageStatus.usage.storage_percent}% used 
      ({storageStatus.usage.storage_remaining_gb} GB remaining)
    </AlertDescription>
  </Alert>
)}

{uploadEstimate && !uploadEstimate.is_safe && (
  <Alert variant="destructive">
    <AlertTitle>Upload Blocked</AlertTitle>
    <AlertDescription>
      {uploadEstimate.message}
      <a href="/admin/supabase-monitoring" className="underline ml-2">
        View storage details
      </a>
    </AlertDescription>
  </Alert>
)}

<Button 
  onClick={handleUpload}
  disabled={!uploadEstimate?.is_safe}
>
  {uploadEstimate?.is_safe ? 'Upload PDF' : 'Storage Full - Upgrade Required'}
</Button>
```

---

## Implementation Steps

### Step 1: Create Admin Monitoring Page
- Create `src/app/admin/supabase-monitoring/page.tsx`
- Add to admin navigation menu
- Implement auto-refresh (30s interval)
- Add charts for storage/database usage

### Step 2: Update PDF Upload Modal
- Add storage status check on modal open
- Add storage estimate on file select
- Block upload if storage > 95%
- Show warnings if storage > 80%

### Step 3: Create API Client
- Create `src/services/apiGateway/monitoringClient.ts`
- Add TypeScript types for responses
- Add error handling

### Step 4: Test
- Test admin monitoring page
- Test PDF upload with storage warnings
- Test upload blocking when storage full
- Test auto-refresh functionality

---

## Success Criteria

- ✅ Admin can see real-time Supabase resource usage
- ✅ PDF upload modal shows current storage status
- ✅ Upload is blocked if storage > 95%
- ✅ Warnings shown if storage > 80%
- ✅ Upgrade recommendations displayed when needed
- ✅ Auto-refresh keeps data current
- ✅ No manual scripts needed - everything in UI

