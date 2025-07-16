# 3D Generation Edge Function Test

This directory contains a comprehensive test script to validate all AI models in your 3D generation system.

## Test Script: `test-3d-generation.js`

A Node.js script that tests all models with a standardized prompt to identify any remaining issues and validate functionality.

### Features

- ✅ Tests all Replicate and Hugging Face models
- 📊 Provides detailed success/failure statistics  
- 💾 Saves results to timestamped JSON files
- 🔍 Validates image data formats (base64, URLs)
- ⏱️ Measures response times and performance
- 🔄 Shows workflow step status for each model
- 📝 Comprehensive logging and error reporting

### Setup

1. **Set Environment Variables:**
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_ANON_KEY="your-anon-key-here"
   ```

   Or edit the script directly and replace:
   - `YOUR_SUPABASE_URL` with your actual Supabase URL
   - `YOUR_SUPABASE_ANON_KEY` with your actual anon key

2. **Install Node.js** (if not already installed)

### Usage

#### Basic Test (Text-to-Image Only)
```bash
node test-3d-generation.js
```

#### Test with Reference Image (Image-to-Image Models)
Edit the script and set:
```javascript
const REFERENCE_IMAGE_URL = "https://example.com/your-reference-image.jpg";
```

### Test Prompt

The script uses your example prompt:
```
"Modern living room with minimalist furniture, large windows, natural light, neutral colors, clean lines, high-end photography style --ar 16:9 --v 6"
```

### Expected Output

```
🚀 Starting 3D Generation Edge Function Test
============================================================
📝 Test Prompt: Modern living room with minimalist furniture...
🖼️  Reference Image: None (text-to-image only)
🔗 Endpoint: https://your-project.supabase.co/functions/v1/crewai-3d-generation
============================================================

⏳ Sending request to edge function...

✅ Request completed in 45230ms
📊 Status Code: 200

🎯 GENERATION RESULTS:
========================================
📸 Total Images Generated: 8

1. 🤗 FLUX.1 [schnell] - black-forest-labs/FLUX.1-schnell
   🔗 URL: Generated ✅
   📏 URL Length: 125847 chars
   ✅ Valid base64 image data

2. 🏡 Interior Design AI - adirik/interior-design
   🔗 URL: Generated ✅
   📏 URL Length: 89234 chars
   ✅ Valid base64 image data

[... more results ...]

📈 SUMMARY:
==============================
✅ Successful: 7
❌ Failed: 1
📊 Success Rate: 87.5%

🔄 WORKFLOW STEPS:
==============================
✅ black-forest-labs/FLUX.1-schnell: success
✅ adirik/interior-design: success
❌ stabilityai/stable-diffusion-2-1: failed
[... more workflow steps ...]

💾 Results saved to: test-results-2025-07-16T22-21-39-123Z.json

🏁 Test completed!
```

### Output Files

The script generates timestamped JSON files with complete test results:

```json
{
  "timestamp": "2025-07-16T22:21:39.123Z",
  "prompt": "Modern living room with minimalist furniture...",
  "referenceImage": null,
  "duration": 45230,
  "statusCode": 200,
  "results": {
    "images": [...],
    "workflowSteps": {...}
  },
  "summary": {
    "total": 8,
    "successful": 7,
    "failed": 1,
    "successRate": "87.5%"
  }
}
```

### Troubleshooting

#### Common Issues

1. **Missing Environment Variables**
   ```
   ❌ Missing required environment variables:
      - SUPABASE_URL
      - SUPABASE_ANON_KEY
   ```
   **Solution:** Set the environment variables or edit the script directly.

2. **Connection Refused**
   ```
   ❌ Test failed: connect ECONNREFUSED
   🔧 Check if your Supabase project is running
   ```
   **Solution:** Verify your Supabase URL and project status.

3. **Request Timeout**
   ```
   ❌ Test failed: Request timeout
   🔧 Request timed out - the function may be taking too long
   ```
   **Solution:** The function has a 2-minute timeout. Some models may take longer.

4. **Authentication Error**
   ```
   📊 Status Code: 401
   ```
   **Solution:** Check your `SUPABASE_ANON_KEY` is correct.

### Model Coverage

The test validates all models in your system:

**Hugging Face Models:**
- 🤗 FLUX.1 [schnell] - black-forest-labs/FLUX.1-schnell
- 🎨 Stable Diffusion 2.1 - stabilityai/stable-diffusion-2-1

**Replicate Models:**
- 🏡 Interior Design AI - adirik/interior-design
- 🏠 Interior AI - erayyavuz/interior-ai  
- 🎨 ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel
- 🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev
- 🏘️ Interior V2 - jschoormans/interior-v2
- 🚀 Interior Design SDXL - rocketdigitalai/interior-design-sdxl
- 🏗️ Designer Architecture - davisbrown/designer-architecture

### Next Steps

After running the test:

1. **Review Results:** Check the success rate and identify any failing models
2. **Analyze Errors:** Look at specific error messages for failed models
3. **Validate Images:** Verify that generated images are valid and display correctly
4. **Performance Analysis:** Review response times and optimize if needed
5. **Fix Issues:** Address any remaining problems identified by the test

This comprehensive test will help ensure your 3D generation system is working correctly across all models!