# Troubleshooting Guide

Common issues and solutions for Material Kai Vision Platform.

---

## 🔴 Critical Issues

### API Service Down

**Symptoms**:
- 502 Bad Gateway errors
- Connection refused
- Timeout errors

**Diagnosis**:
```bash
# Check service status
sudo systemctl status mivaa-api

# Check if port is listening
sudo netstat -tlnp | grep 8000

# Check logs
sudo journalctl -u mivaa-api -f
```

**Solutions**:
1. Restart service
   ```bash
   sudo systemctl restart mivaa-api
   ```

2. Check disk space
   ```bash
   df -h
   ```

3. Check memory
   ```bash
   free -h
   ```

4. Check database connection
   ```bash
   psql -h db.supabase.co -U postgres -d postgres -c "SELECT 1"
   ```

---

### Database Connection Failed

**Symptoms**:
- "Connection refused" errors
- Timeout on queries
- "Too many connections"

**Diagnosis**:
```bash
# Check connection pool
SELECT count(*) FROM pg_stat_activity;

# Check max connections
SHOW max_connections;
```

**Solutions**:
1. Increase connection pool
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   SELECT pg_reload_conf();
   ```

2. Kill idle connections
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' AND query_start < now() - interval '1 hour';
   ```

3. Restart database
   - Use Supabase dashboard
   - Or SSH and restart PostgreSQL

---

### Out of Memory (OOM)

**Symptoms**:
- Process killed
- "Cannot allocate memory"
- Slow performance

**Diagnosis**:
```bash
# Check memory usage
free -h

# Check process memory
ps aux | grep mivaa

# Check swap
swapon -s
```

**Solutions**:
1. Increase server memory
2. Optimize batch size
3. Clear cache
   ```bash
   sync; echo 3 > /proc/sys/vm/drop_caches
   ```

4. Restart service
   ```bash
   sudo systemctl restart mivaa-api
   ```

---

## 🟡 Common Issues

### PDF Processing Fails

**Symptoms**:
- Job stuck at certain stage
- Error in logs
- Timeout

**Diagnosis**:
```bash
# Check job status
curl https://v1api.materialshub.gr/api/v1/documents/job/{job_id}

# Check logs
sudo journalctl -u mivaa-api -f | grep {job_id}
```

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
   - Check Together AI quota

4. **Resume from checkpoint**
   ```bash
   POST /api/v1/documents/job/{job_id}/resume
   ```

---

### Search Returns No Results

**Symptoms**:
- Empty search results
- Low relevance scores
- Timeout on search

**Diagnosis**:
```bash
# Check embeddings exist
SELECT COUNT(*) FROM embeddings WHERE chunk_id = '{chunk_id}';

# Check index health
SELECT * FROM pg_stat_user_indexes WHERE relname = 'idx_embeddings_text';
```

**Solutions**:
1. Verify embeddings generated
   ```bash
   GET /api/embeddings/generate
   ```

2. Rebuild indexes
   ```sql
   REINDEX INDEX idx_embeddings_text;
   ```

3. Check query embedding
   ```bash
   POST /api/embeddings/generate
   Body: { "text": "your query" }
   ```

4. Adjust similarity threshold
   ```bash
   POST /api/search/semantic
   Body: { "query": "...", "threshold": 0.5 }
   ```

---

### High Latency

**Symptoms**:
- Slow API responses
- Timeout errors
- Poor user experience

**Diagnosis**:
```bash
# Check API response time
time curl https://v1api.materialshub.gr/health

# Check database query time
EXPLAIN ANALYZE SELECT * FROM chunks WHERE document_id = '...';

# Check network latency
ping v1api.materialshub.gr
```

**Solutions**:
1. Optimize queries
   ```sql
   CREATE INDEX idx_chunks_document_page ON chunks(document_id, page_number);
   ```

2. Enable query caching
   ```python
   # In MIVAA backend
   @cache(ttl=300)
   async def get_chunks(document_id):
       ...
   ```

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

**Diagnosis**:
```bash
# Check JWT token
curl -H "Authorization: Bearer {token}" https://v1api.materialshub.gr/health

# Decode JWT
echo {token} | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

**Solutions**:
1. Verify token not expired
   ```bash
   # Check expiry
   echo {token} | jq -R 'split(".") | .[1] | @base64d | fromjson | .exp'
   ```

2. Refresh token
   ```bash
   POST /auth/refresh
   ```

3. Check API key
   ```bash
   curl -H "X-API-Key: {key}" https://v1api.materialshub.gr/health
   ```

4. Verify workspace access
   ```bash
   GET /api/workspaces
   ```

---

### Image Analysis Fails

**Symptoms**:
- "Image analysis failed"
- Llama API errors
- Quality score 0

**Diagnosis**:
```bash
# Check image file
file /path/to/image.png

# Check image size
ls -lh /path/to/image.png

# Check Llama API
curl https://api.together.xyz/health
```

**Solutions**:
1. Verify image format
   - Supported: PNG, JPG, WEBP
   - Size: < 10MB
   - Resolution: > 100x100px

2. Check Together AI quota
   - Verify API key
   - Check rate limits
   - Check account balance

3. Retry with different image
   ```bash
   POST /api/images/analyze
   ```

---

## 🟢 Performance Optimization

### Slow Embeddings Generation

**Solutions**:
1. Batch embeddings
   ```bash
   POST /api/embeddings/batch
   Body: { "texts": [...] }
   ```

2. Use smaller model
   ```python
   model = "text-embedding-3-small"  # Instead of large
   ```

3. Cache results
   ```python
   @cache(ttl=3600)
   async def get_embedding(text):
       ...
   ```

---

### Slow Search Queries

**Solutions**:
1. Add indexes
   ```sql
   CREATE INDEX idx_chunks_quality ON chunks(quality_score);
   ```

2. Limit results
   ```bash
   POST /api/search/semantic
   Body: { "query": "...", "limit": 10 }
   ```

3. Use vector search (faster)
   ```bash
   POST /api/search/vector
   ```

---

### High Database Load

**Solutions**:
1. Enable connection pooling
   ```python
   pool_size = 20
   max_overflow = 10
   ```

2. Optimize queries
   - Use EXPLAIN ANALYZE
   - Add indexes
   - Denormalize if needed

3. Archive old data
   ```sql
   DELETE FROM chunks WHERE created_at < NOW() - INTERVAL '1 year';
   ```

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

