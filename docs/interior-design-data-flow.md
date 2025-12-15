# Interior Design Generation - Complete Data Flow

## 🔄 End-to-End Data Flow Verification

### Step 1: User Request → Agent Tool

**User Input:**
```
"Generate a modern minimalist bedroom with oak flooring"
```

**Agent Tool Call:**
```typescript
// supabase/functions/agent-chat/index.ts (line 429)
{
  prompt: "Generate a modern minimalist bedroom with oak flooring",
  roomType: "bedroom",
  style: "modern minimalist",
  referenceImageUrl: undefined,
  models: undefined  // Use all 7 models
}
```

### Step 2: Agent → MIVAA API

**HTTP Request:**
```http
POST http://localhost:8000/api/interior
Content-Type: application/json

{
  "prompt": "Generate a modern minimalist bedroom with oak flooring",
  "room_type": "bedroom",
  "style": "modern minimalist",
  "image": null,
  "models": null,
  "user_id": "user-uuid",
  "workspace_id": "workspace-uuid",
  "width": 768,
  "height": 768
}
```

### Step 3: MIVAA API → Database Insert

**Database Insert:**
```sql
INSERT INTO generation_3d (
  id, user_id, workspace_id, generation_name, generation_type,
  generation_status, progress_percentage, input_data, metadata
) VALUES (
  'job-uuid',
  'user-uuid',
  'workspace-uuid',
  'Interior Design - bedroom',
  'interior_design',
  'processing',
  0,
  '{"prompt": "...", "room_type": "bedroom", "style": "modern minimalist", ...}',
  '{"models_queue": [...], "models_results": [...], "workflow_status": "generating"}'
)
```

**models_results Structure:**
```json
{
  "models_queue": [
    {"id": "flux-dev", "name": "Flux Dev", "provider": "replicate"},
    {"id": "sdxl", "name": "SDXL", "provider": "replicate"}
  ],
  "models_results": [
    {
      "model_id": "flux-dev",
      "model_name": "Flux Dev",
      "provider": "replicate",
      "capability": "text-to-image",
      "status": "pending",
      "image_urls": []
    },
    {
      "model_id": "sdxl",
      "model_name": "SDXL",
      "provider": "replicate",
      "capability": "text-to-image",
      "status": "pending",
      "image_urls": []
    }
  ],
  "workflow_status": "generating"
}
```

### Step 4: MIVAA API → Agent Response

**MIVAA Response:**
```json
{
  "success": true,
  "job_id": "job-uuid",
  "model_count": 7,
  "models": [
    {"id": "flux-dev", "name": "Flux Dev"},
    {"id": "sdxl", "name": "SDXL"}
  ],
  "message": "Started generating 7 interior design variations"
}
```

**Agent Tool Return:**
```json
{
  "success": true,
  "async_job": true,
  "job_id": "job-uuid",
  "model_count": 7,
  "models": [...],
  "message": "Started generating 7 interior design variations"
}
```

### Step 5: Agent → Frontend

**Agent Response to Frontend:**
```json
{
  "success": true,
  "response": "I've started generating 7 interior design variations...",
  "tool_results": [
    {
      "tool": "generate_3d",
      "result": {
        "success": true,
        "async_job": true,
        "job_id": "job-uuid",
        "model_count": 7,
        "models": [...]
      }
    }
  ]
}
```

### Step 6: Frontend Extracts Job Info

**MaterialAgentSearchInterface.tsx (line 766):**
```typescript
const generate3DResult = toolResults.find((r: any) => r.tool === 'generate_3d');
if (generate3DResult?.result?.async_job && generate3DResult.result.job_id) {
  asyncJobInfo = {
    job_id: result.job_id,
    model_count: result.model_count,
    models: result.models
  };
}
```

### Step 7: Frontend Renders ProgressiveImageGrid

**Component Props:**
```tsx
<ProgressiveImageGrid
  jobId="job-uuid"
  modelCount={7}
  models={[
    {id: "flux-dev", name: "Flux Dev", provider: "replicate"},
    {id: "sdxl", name: "SDXL", provider: "replicate"}
  ]}
/>
```

### Step 8: Frontend Polls Database

**ProgressiveImageGrid.tsx (line 57):**
```typescript
const { data } = await supabase
  .from('generation_3d')
  .select('metadata, progress_percentage, generation_status')
  .eq('id', jobId)
  .single();

const metadata = data.metadata as any;
const models_results = metadata?.models_results || [];
```

### Step 9: Background Processing Updates Database

**After Each Model Completes:**
```sql
UPDATE generation_3d 
SET 
  metadata = '{"models_results": [{"model_id": "flux-dev", "status": "completed", "image_urls": ["https://..."]}, ...]}',
  progress_percentage = 50,
  updated_at = NOW()
WHERE id = 'job-uuid'
```

### Step 10: Frontend Displays Images

**ProgressiveImageGrid renders:**
- ✅ Model 1: Completed - Shows image
- ⏳ Model 2: Processing - Shows spinner
- ⏳ Model 3: Pending - Shows placeholder

## ✅ Data Contract Verification

| Component | Sends | Receives |
|-----------|-------|----------|
| Agent Tool | `{prompt, roomType, style}` | `{success, job_id, model_count, models}` |
| MIVAA API | `{success, job_id, ...}` | `{prompt, room_type, style, user_id, ...}` |
| Database | Stores in `metadata.models_results` | - |
| Frontend | Polls `metadata` field | `{models_results: [...]}` |

## 🔧 Key Fields Mapping

| Agent Field | MIVAA Field | Database Field |
|-------------|-------------|----------------|
| `roomType` | `room_type` | `input_data.room_type` |
| `style` | `style` | `input_data.style` |
| `models` | `models` | `metadata.models_queue` |
| - | - | `metadata.models_results` |
| `job_id` | `job_id` | `id` |

## ✅ All Systems Aligned!

