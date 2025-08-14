# Secrets Configuration Guide

This guide provides comprehensive information about all environment variables and secrets required for deploying the Material Kai Vision Platform and its services.

## Overview

The platform uses environment variables for configuration management across different deployment environments. This guide categorizes all required secrets and provides setup instructions for each deployment platform.

## Core Application Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `APP_NAME` | No | Application name | "PDF Processing Service" | GitHub Secrets, Vercel |
| `APP_VERSION` | No | Application version | "1.0.0" | GitHub Secrets, Vercel |
| `DEBUG` | No | Enable debug mode | false | GitHub Secrets, Vercel |
| `HOST` | No | Server host | "0.0.0.0" | GitHub Secrets, Digital Ocean |
| `PORT` | No | Server port | 8000 | GitHub Secrets, Digital Ocean |
| `API_PREFIX` | No | API route prefix | "/api/v1" | GitHub Secrets, Vercel |
| `CORS_ORIGINS` | No | Allowed CORS origins | "*" | GitHub Secrets, Vercel |
| `LOG_LEVEL` | No | Logging level | "INFO" | GitHub Secrets, Digital Ocean |
| `MAX_FILE_SIZE` | No | Maximum upload file size | 104857600 | GitHub Secrets, Vercel |
| `MAX_WORKERS` | No | Maximum worker processes | 4 | GitHub Secrets, Digital Ocean |
| `REQUEST_TIMEOUT` | No | Request timeout in seconds | 300 | GitHub Secrets, Digital Ocean |

## Database & Storage Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `SUPABASE_URL` | Yes | Supabase project URL | - | GitHub Secrets, Vercel, Supabase |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | - | GitHub Secrets, Vercel, Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key | - | GitHub Secrets, Supabase |
| `SUPABASE_STORAGE_BUCKET` | No | Supabase storage bucket name | "pdf-documents" | GitHub Secrets, Supabase |
| `DATABASE_POOL_SIZE` | No | Database connection pool size | 10 | GitHub Secrets, Digital Ocean |
| `DATABASE_MAX_OVERFLOW` | No | Database max overflow connections | 20 | GitHub Secrets, Digital Ocean |
| `DATABASE_TIMEOUT` | No | Database connection timeout | 30 | GitHub Secrets, Digital Ocean |

## AI/ML Service Integration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM and embeddings | - | GitHub Secrets, Vercel |
| `OPENAI_ORG_ID` | No | OpenAI organization ID | - | GitHub Secrets, Vercel |
| `OPENAI_PROJECT_ID` | No | OpenAI project ID | - | GitHub Secrets, Vercel |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for Claude models | - | GitHub Secrets, Vercel |
| `HUGGINGFACE_API_TOKEN` | Yes | Hugging Face API token for 3D generation models | - | GitHub Secrets, Supabase |
| `HUGGING_FACE_ACCESS_TOKEN` | Yes | Alternative Hugging Face token (same as above) | - | GitHub Secrets, Supabase |
| `REPLICATE_API_KEY` | Yes | Replicate API key for 3D generation models | - | GitHub Secrets, Supabase |
| `JINA_API_KEY` | Yes | Jina AI API key for embeddings and material scraping | - | GitHub Secrets, Supabase |
| `FIRECRAWL_API_KEY` | Yes | Firecrawl API key for web scraping | - | GitHub Secrets, Supabase |
| `LLAMAINDEX_EMBEDDING_MODEL` | No | LlamaIndex embedding model | "text-embedding-3-small" | GitHub Secrets, Vercel |
| `LLAMAINDEX_LLM_MODEL` | No | LlamaIndex LLM model | "gpt-3.5-turbo" | GitHub Secrets, Vercel |
| `LLAMAINDEX_CHUNK_SIZE` | No | Text chunk size for processing | 1024 | GitHub Secrets, Vercel |
| `LLAMAINDEX_CHUNK_OVERLAP` | No | Text chunk overlap | 200 | GitHub Secrets, Vercel |
| `LLAMAINDEX_SIMILARITY_TOP_K` | No | Top K similarity results | 5 | GitHub Secrets, Vercel |
| `LLAMAINDEX_STORAGE_DIR` | No | LlamaIndex storage directory | "./data/llamaindex" | GitHub Secrets, Digital Ocean |
| `LLAMAINDEX_ENABLE_RAG` | No | Enable RAG functionality | true | GitHub Secrets, Vercel |

## Multi-modal Processing Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `ENABLE_MULTIMODAL` | No | Enable multi-modal processing | true | GitHub Secrets, Vercel |
| `MULTIMODAL_LLM_MODEL` | No | Multi-modal LLM model | "gpt-4-vision-preview" | GitHub Secrets, Vercel |
| `MULTIMODAL_MAX_TOKENS` | No | Maximum tokens for multi-modal | 4096 | GitHub Secrets, Vercel |
| `MULTIMODAL_TEMPERATURE` | No | Temperature for multi-modal | 0.1 | GitHub Secrets, Vercel |
| `MULTIMODAL_IMAGE_DETAIL` | No | Image detail level | "high" | GitHub Secrets, Vercel |
| `MULTIMODAL_BATCH_SIZE` | No | Batch size for processing | 5 | GitHub Secrets, Vercel |
| `MULTIMODAL_TIMEOUT` | No | Timeout for multi-modal requests | 60 | GitHub Secrets, Vercel |

## OCR Processing Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `OCR_ENABLED` | No | Enable OCR processing | true | GitHub Secrets, Vercel |
| `OCR_LANGUAGE` | No | OCR language code | "en" | GitHub Secrets, Vercel |
| `OCR_CONFIDENCE_THRESHOLD` | No | OCR confidence threshold | 0.6 | GitHub Secrets, Vercel |
| `OCR_ENGINE` | No | OCR engine to use | "easyocr" | GitHub Secrets, Vercel |
| `OCR_GPU_ENABLED` | No | Enable GPU for OCR | false | GitHub Secrets, Digital Ocean |
| `OCR_PREPROCESSING_ENABLED` | No | Enable OCR preprocessing | true | GitHub Secrets, Vercel |
| `OCR_DESKEW_ENABLED` | No | Enable image deskewing | true | GitHub Secrets, Vercel |
| `OCR_NOISE_REMOVAL_ENABLED` | No | Enable noise removal | true | GitHub Secrets, Vercel |

## Image Processing Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `IMAGE_PROCESSING_ENABLED` | No | Enable image processing | true | GitHub Secrets, Vercel |
| `IMAGE_ANALYSIS_MODEL` | No | Model for image analysis | "gpt-4-vision-preview" | GitHub Secrets, Vercel |
| `IMAGE_RESIZE_MAX_WIDTH` | No | Maximum image width | 2048 | GitHub Secrets, Vercel |
| `IMAGE_RESIZE_MAX_HEIGHT` | No | Maximum image height | 2048 | GitHub Secrets, Vercel |
| `IMAGE_COMPRESSION_QUALITY` | No | Image compression quality | 85 | GitHub Secrets, Vercel |
| `IMAGE_FORMAT_CONVERSION` | No | Target image format | "JPEG" | GitHub Secrets, Vercel |
| `DEFAULT_IMAGE_FORMAT` | No | Default image format | "png" | GitHub Secrets, Vercel |
| `DEFAULT_IMAGE_QUALITY` | No | Default image quality | 95 | GitHub Secrets, Vercel |
| `WRITE_IMAGES` | No | Write extracted images | true | GitHub Secrets, Vercel |
| `EXTRACT_TABLES` | No | Extract tables from PDFs | true | GitHub Secrets, Vercel |
| `EXTRACT_IMAGES` | No | Extract images from PDFs | true | GitHub Secrets, Vercel |

## Authentication & Security Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `JWT_SECRET_KEY` | Yes | JWT signing secret key | - | GitHub Secrets, Vercel |
| `JWT_ALGORITHM` | No | JWT algorithm | "HS256" | GitHub Secrets, Vercel |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | Access token expiry | 30 | GitHub Secrets, Vercel |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | No | Refresh token expiry | 7 | GitHub Secrets, Vercel |
| `JWT_ISSUER` | No | JWT issuer | "material-kai-platform" | GitHub Secrets, Vercel |
| `JWT_AUDIENCE` | No | JWT audience | "mivaa-pdf-extractor" | GitHub Secrets, Vercel |
| `MAX_REQUESTS_PER_MINUTE` | No | Rate limiting | 60 | GitHub Secrets, Vercel |

## Material Kai Platform Integration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `MATERIAL_KAI_PLATFORM_URL` | No | Platform API URL | "https://api.materialkai.vision" | GitHub Secrets, Vercel |
| `MATERIAL_KAI_API_KEY` | Yes | Platform API key | - | GitHub Secrets, Vercel |
| `MATERIAL_KAI_WORKSPACE_ID` | Yes | Platform workspace ID | - | GitHub Secrets, Vercel |
| `MATERIAL_KAI_SERVICE_NAME` | No | Service identifier | "mivaa-pdf-extractor" | GitHub Secrets, Vercel |
| `MATERIAL_KAI_SYNC_ENABLED` | No | Enable platform sync | true | GitHub Secrets, Vercel |
| `MATERIAL_KAI_REAL_TIME_ENABLED` | No | Enable real-time updates | true | GitHub Secrets, Vercel |
| `MATERIAL_KAI_BATCH_SIZE` | No | Batch processing size | 10 | GitHub Secrets, Vercel |
| `MATERIAL_KAI_RETRY_ATTEMPTS` | No | Retry attempts | 3 | GitHub Secrets, Vercel |
| `MATERIAL_KAI_TIMEOUT` | No | Request timeout | 30 | GitHub Secrets, Vercel |

## Monitoring & Error Tracking

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `SENTRY_DSN` | No | Sentry DSN for error tracking | - | GitHub Secrets, Vercel |
| `SENTRY_ENVIRONMENT` | No | Sentry environment | "development" | GitHub Secrets, Vercel |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Sentry traces sample rate | 0.1 | GitHub Secrets, Vercel |
| `SENTRY_PROFILES_SAMPLE_RATE` | No | Sentry profiles sample rate | 0.1 | GitHub Secrets, Vercel |
| `SENTRY_ENABLED` | No | Enable Sentry monitoring | false | GitHub Secrets, Vercel |
| `SENTRY_RELEASE` | No | Sentry release version | - | GitHub Secrets, Vercel |
| `SENTRY_SERVER_NAME` | No | Sentry server name | - | GitHub Secrets, Vercel |

## Digital Ocean Deployment Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `DO_API_TOKEN` | Yes | Digital Ocean API token | - | GitHub Secrets |
| `DO_DROPLET_NAME` | Yes | Droplet name for deployment | - | GitHub Secrets |
| `DO_REGION` | No | Digital Ocean region | "nyc3" | GitHub Secrets |
| `DO_SIZE` | No | Droplet size | "s-2vcpu-4gb" | GitHub Secrets |
| `DO_SSH_KEY_NAME` | Yes | SSH key name for droplet access | - | GitHub Secrets |
| `DO_DOMAIN` | No | Domain for the application | - | GitHub Secrets |

## CI/CD Configuration

| Variable Name | Required | Description | Default Value | Configuration Location |
|---------------|----------|-------------|---------------|----------------------|
| `GITHUB_TOKEN` | Yes | GitHub token for CI/CD | - | GitHub Secrets |
| `DOCKER_REGISTRY` | No | Docker registry URL | "ghcr.io" | GitHub Secrets |
| `DOCKER_IMAGE_NAME` | No | Docker image name | "mivaa-pdf-extractor" | GitHub Secrets |

## Setup Instructions by Platform

### GitHub Secrets Configuration

1. Navigate to your repository settings
2. Go to "Secrets and variables" → "Actions"
3. Add the following required secrets:

**Required Secrets:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `JWT_SECRET_KEY`
- `MATERIAL_KAI_API_KEY`
- `MATERIAL_KAI_WORKSPACE_ID`
- `DO_API_TOKEN`
- `DO_DROPLET_NAME`
- `DO_SSH_KEY_NAME`
- `GITHUB_TOKEN`

### Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Environment Variables"
3. Add the following variables for all environments (Development, Preview, Production):

**Required Variables:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `JWT_SECRET_KEY`
- `MATERIAL_KAI_API_KEY`
- `MATERIAL_KAI_WORKSPACE_ID`

### Supabase Configuration

1. Go to your Supabase project dashboard
2. Navigate to "Settings" → "API"
3. Copy the following values:
   - Project URL → `SUPABASE_URL`
   - Anon public key → `SUPABASE_ANON_KEY`
   - Service role key → `SUPABASE_SERVICE_ROLE_KEY`

### Digital Ocean Configuration

1. Create a Digital Ocean API token in your account settings
2. Set up SSH keys for server access
3. Configure the droplet settings in GitHub Secrets

## Security Best Practices

1. **Never commit secrets to version control**
2. **Use different values for different environments**
3. **Rotate secrets regularly**
4. **Use least privilege principle for API keys**
5. **Monitor secret usage and access logs**
6. **Use environment-specific configurations**

## Environment-Specific Configuration

### Development
- Use test/development API keys
- Enable debug mode
- Use local storage for development

### Staging
- Use staging API keys
- Mirror production configuration
- Enable detailed logging

### Production
- Use production API keys
- Disable debug mode
- Enable monitoring and error tracking
- Use production-grade storage and databases

## Validation

Use the provided validation script to ensure all required secrets are properly configured:

```bash
python mivaa-pdf-extractor/scripts/validate-deployment.py
```

This script will check all environment variables and provide a detailed report of missing or misconfigured secrets.

## Troubleshooting

### Common Issues

1. **Missing API Keys**: Ensure all required API keys are set in the correct environment
2. **Invalid JWT Secret**: Generate a strong, random JWT secret key
3. **Database Connection Issues**: Verify Supabase URL and keys are correct
4. **CORS Issues**: Configure CORS_ORIGINS for your domain
5. **File Upload Issues**: Check MAX_FILE_SIZE setting

### Getting Help

If you encounter issues with secret configuration:

1. Check the validation script output
2. Verify all required secrets are set
3. Ensure secrets match the expected format
4. Check environment-specific configurations
5. Review the deployment logs for specific error messages