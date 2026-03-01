# Interior Design Generation - Complete Data Flow

## 🔄 End-to-End Data Flow Verification

### Step 1: User Request → Agent Tool

The user provides a natural language prompt such as "Generate a modern minimalist bedroom with oak flooring". The agent tool is then called with the parsed parameters: prompt, roomType, style, an optional referenceImageUrl, and an optional models array (if omitted, all 7 models are used).

### Step 2: Agent → MIVAA API

The agent sends a POST request to `http://localhost:8000/api/interior` with a JSON body containing: prompt, room_type (mapped from roomType), style, image (null if no reference), models (null if all), user_id, workspace_id, width (768), and height (768).

### Step 3: MIVAA API → Database Insert

The API inserts a new record into the `generation_3d` table with id (job UUID), user_id, workspace_id, generation_name (e.g., "Interior Design - bedroom"), generation_type ("interior_design"), generation_status ("processing"), progress_percentage (0), input_data (JSON of prompt, room_type, style, and other inputs), and metadata. The metadata contains a models_queue array listing each model with its id, name, and provider, and a models_results array with one entry per model containing model_id, model_name, provider, capability ("text-to-image"), status ("pending"), and an empty image_urls array. The metadata also has a workflow_status of "generating".

### Step 4: MIVAA API → Agent Response

The MIVAA API returns a JSON response with success (true), job_id, model_count, a models array listing each model's id and name, and a message confirming how many variations are being generated. The agent tool returns this same payload with an additional async_job: true field.

### Step 5: Agent → Frontend

The agent sends its full response to the frontend including the text response, and a tool_results array. The tool_results entry contains the tool name ("generate_3d") and the result object with success, async_job, job_id, model_count, and models.

### Step 6: Frontend Extracts Job Info

The frontend searches the tool_results array for an entry with tool "generate_3d". If the result has async_job set to true and a job_id, it stores asyncJobInfo containing job_id, model_count, and models.

### Step 7: Frontend Renders ProgressiveImageGrid

The ProgressiveImageGrid component is rendered with props: jobId (the job UUID), modelCount (e.g., 7), and models (array of objects with id, name, and provider).

### Step 8: Frontend Polls Database

The ProgressiveImageGrid polls the Supabase `generation_3d` table by selecting metadata, progress_percentage, and generation_status for the given jobId. It reads models_results from the metadata field.

### Step 9: Background Processing Updates Database

After each model completes, an UPDATE is executed on the generation_3d table setting metadata (with the updated models_results array, where the completed model now has status "completed" and a populated image_urls array), progress_percentage (e.g., 50 after half complete), and updated_at.

### Step 10: Frontend Displays Images

The ProgressiveImageGrid renders each model's result:
- ✅ Completed models: Shows the generated image
- ⏳ Processing models: Shows a spinner
- ⏳ Pending models: Shows a placeholder

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

## 🌐 Next Step: VR World Generation

After the design images are rendered, users can click **"Generate VR"** on any image in the DesignCanvas to create an explorable 3D Gaussian Splat world via WorldLabs Marble API. The VR world appears as a new message in the agent chat with an embedded Spark.js viewer.

**Flow:** DesignCanvas "Generate VR" → `generate-vr-world` Edge Function → WorldLabs API → `vr_worlds` table → WorldViewer (Spark.js)

**Full documentation:** [vr-world-generation.md](vr-world-generation.md)

---

## ✅ All Systems Aligned!
