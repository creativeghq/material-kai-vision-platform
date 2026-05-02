# Troubleshooting Guide

Common issues and solutions for Material Kai Vision Platform.

---

## 🔴 Critical Issues

### API Service Down

**Symptoms**:
- 502 Bad Gateway errors
- Connection refused
- Timeout errors

**Solutions**:
1. Restart service

2. Check disk space

3. Check memory

4. Check database connection

---

### Database Connection Failed

**Symptoms**:
- "Connection refused" errors
- Timeout on queries
- "Too many connections"

**Solutions**:
1. Increase connection pool

2. Kill idle connections

3. Restart database
   - Use Supabase dashboard
   - Or SSH and restart PostgreSQL

---

### Out of Memory (OOM)

**Symptoms**:
- Process killed
- "Cannot allocate memory"
- Slow performance

**Solutions**:
1. Increase server memory
2. Optimize batch size
3. Clear cache

4. Restart service

---

## 🟡 Common Issues

### PDF Processing Fails

**Symptoms**:
- Job stuck at certain stage
- Error in logs
- Timeout

**Solutions**:
1. **Stage 0 (Product Discovery)**
   - Check PDF format
   - Verify file size < 100MB
   - Check AI API keys

2. **Stage 2 (Text Extraction)**
   - Verify PDF is readable
   - Check for corrupted pages
   - Try different extraction method

3. **Stage 6 (Image Analysis)**
   - Check image count
   - Verify image quality
   - Check Anthropic API quota / rate limits (Claude Opus 4.7 vision_analysis is the sole vision pass post-2026-05-01; the HuggingFace Qwen3-VL endpoint was retired in the migration — it had been 404-ing for months)

4. **Resume from checkpoint**

---

### Search Returns No Results

**Symptoms**:
- Empty search results
- Low relevance scores
- Timeout on search

**Solutions**:
1. Verify embeddings generated

2. Rebuild indexes

3. Check query embedding

4. Adjust similarity threshold

---

### High Latency

**Symptoms**:
- Slow API responses
- Timeout errors
- Poor user experience

**Solutions**:
1. Optimize queries

2. Enable query caching

3. Scale horizontally
   - Add more API instances
   - Use load balancer

4. Optimize embeddings
   - Use smaller dimension
   - Cache results

---

### Authentication Failures

**Symptoms**:
- 401 Unauthorized
- 403 Forbidden
- JWT token errors

**Solutions**:
1. Verify token not expired

2. Refresh token

3. Check API key

4. Verify workspace access

---

### Image Analysis Fails

**Symptoms**:
- "Image analysis failed"
- Anthropic API errors on Claude Opus 4.7 vision_analysis (sole vision pass post-2026-05-01)
- Quality score 0

**Solutions**:
1. Verify image format
   - Supported: PNG, JPG, WEBP
   - Size: < 10MB
   - Resolution: > 100x100px

2. Check Anthropic API quota / rate limits
   - Verify `ANTHROPIC_API_KEY` is set
   - Check rate-limit headers on the failing call
   - Confirm the response was tool_use (not text) — `VisionAnalysis` schema is hard-enforced by `VISION_ANALYSIS_TOOL`; if the model returned plain text instead of `tool_use`, the call should be retried (this is rare with the schema-locked path)
   - Pre-2026-05-01 troubleshooting referenced `QWEN_ENDPOINT_TOKEN` and the HuggingFace Qwen3-VL endpoint — both are retired. The Qwen HF endpoint had been 404-ing for months and silently falling through to Claude; the migration removed the dead path entirely.

3. Retry with different image

---

## 🟢 Performance Optimization

### Slow Embeddings Generation

**Solutions**:
1. Batch embeddings

2. Use smaller model

3. Cache results

---

### Slow Search Queries

**Solutions**:
1. Add indexes

2. Limit results

3. Use vector search (faster)

---

### High Database Load

**Solutions**:
1. Enable connection pooling

2. Optimize queries
   - Use EXPLAIN ANALYZE
   - Add indexes
   - Denormalize if needed

3. Archive old data

---

## 📞 Support Resources

**Documentation**:
- API Reference: `/docs`
- ReDoc: `/redoc`
- OpenAPI Schema: `/openapi.json`

**Monitoring**:
- Vercel Dashboard: https://vercel.com/dashboard
- Supabase Dashboard: https://app.supabase.com
- Server Logs: SSH to v1api.materialshub.gr

**Contact**:
- Email: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Last Updated**: October 31, 2025
**Version**: 1.0.0
**Status**: Production

