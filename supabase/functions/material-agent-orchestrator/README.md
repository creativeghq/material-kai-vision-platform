# Material Agent Orchestrator - PraisonAI Integration

## Overview

The Material Agent Orchestrator is a Supabase Edge Function that orchestrates PraisonAI agents for comprehensive material analysis and search tasks. It provides:

- **Multi-Agent Orchestration**: Coordinates multiple specialized agents (Research Agent, MIVAA Search Agent)
- **Database Persistence**: Tracks all tasks, executions, and performance metrics
- **Role-Based Access Control**: Enforces user permissions and workspace isolation
- **Performance Monitoring**: Tracks execution times, confidence scores, and agent metrics
- **Comprehensive Error Handling**: Graceful fallbacks and detailed error reporting

## Architecture

```
Request → Authentication → Agent Selection → Coordination Planning
                                                      ↓
                                          Agent Execution (Sequential)
                                                      ↓
                                          Result Synthesis
                                                      ↓
                                          Database Persistence
                                                      ↓
                                          Response
```

## Key Features

### 1. Authentication & Authorization

- **JWT Token Validation**: Validates Bearer tokens using JWT_SECRET
- **Workspace Isolation**: Ensures users can only access their workspace
- **Role-Based Access**: Different agents for different user roles
  - `research-agent`: Admin/Owner only
  - `mivaa-search-agent`: All authenticated users

### 2. Agent Orchestration

- **Agent Selection**: Chooses appropriate agents based on task type
- **Coordination Planning**: Creates execution plans using MIVAA semantic analysis
- **Sequential Execution**: Executes agents in coordinated order with context passing
- **Result Synthesis**: Combines agent outputs into cohesive response

### 3. Database Persistence

**agent_tasks table**:
- Task tracking with status (processing, completed, failed)
- Input/output data storage
- Processing time metrics
- Execution timeline

**material_agents table**:
- Performance metrics (total executions, average confidence)
- Last execution time and confidence
- Updated timestamps

### 4. Performance Monitoring

- Execution time tracking per agent
- Confidence score calculation
- Overall confidence averaging
- Agent performance metrics updates

## API Request Format

```typescript
POST /functions/v1/material-agent-orchestrator
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "user_id": "user-uuid",
  "task_type": "comprehensive_design",
  "input_data": {
    "query": "Find ceramic materials for kitchen countertops",
    "context": { /* optional context */ },
    "sessionId": "session-uuid",
    "hybridConfig": { /* optional config */ },
    "attachments": [ /* optional files */ ]
  },
  "priority": 5,
  "workspace_id": "workspace-uuid"
}
```

## API Response Format

```typescript
{
  "success": true,
  "task_id": "task-uuid",
  "coordinated_result": {
    "content": "Analysis results...",
    "analysis": "Detailed analysis...",
    "summary": "Summary..."
  },
  "agent_executions": [
    {
      "agent_id": "mivaa-search-agent",
      "agent_name": "mivaa-search-agent",
      "specialization": "Material Search",
      "result": { /* agent output */ },
      "confidence": 0.85,
      "execution_time_ms": 1234,
      "reasoning": "Execution reasoning..."
    }
  ],
  "coordination_summary": "Coordination plan summary",
  "overall_confidence": 0.85,
  "total_processing_time_ms": 2500
}
```

## Task Types

- `material_analysis`: Analyze material properties
- `material_search`: Search for materials
- `comprehensive_design`: Full design analysis
- `research`: Research-focused analysis (admin only)

## Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
MIVAA_API_URL=https://mivaa-api.example.com
MIVAA_API_KEY=your-mivaa-api-key
```

## Error Handling

The function handles errors gracefully:

1. **Authentication Errors**: Returns 401 Unauthorized
2. **Validation Errors**: Returns 400 Bad Request
3. **Execution Errors**: Returns 500 with error message
4. **Agent Failures**: Continues with fallback responses
5. **Database Errors**: Logs but doesn't fail the request

## Performance Characteristics

- **Typical Execution Time**: 2-5 seconds
- **Agent Execution**: ~1-2 seconds per agent
- **Coordination Planning**: ~500ms
- **Result Synthesis**: ~500ms
- **Database Operations**: ~100-200ms

## Integration with Frontend

The function is called from `MaterialAgentSearchInterface.tsx`:

```typescript
const response = await apiService.callSupabaseFunction('material-agent-orchestrator', {
  user_id: session.user.id,
  task_type: 'comprehensive_design',
  input_data: {
    query: input,
    sessionId: sessionId,
    context: enhancedContext,
    hybridConfig: hybridConfig,
    attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
  },
});
```

## Database Schema

### agent_tasks
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key to users)
- `workspace_id`: UUID (Foreign Key to workspaces)
- `task_name`: TEXT
- `task_type`: TEXT
- `task_status`: TEXT (processing, completed, failed)
- `priority`: TEXT
- `input_data`: JSONB
- `output_data`: JSONB
- `metadata`: JSONB
- `processing_time_ms`: INTEGER
- `created_at`, `updated_at`, `completed_at`: TIMESTAMPTZ

### material_agents
- `id`: UUID (Primary Key)
- `performance_metrics`: JSONB
  - `total_executions`: INTEGER
  - `average_confidence`: FLOAT
  - `last_execution_time`: INTEGER
  - `last_confidence`: FLOAT
- `updated_at`: TIMESTAMPTZ

## Security Considerations

1. **JWT Validation**: All requests must include valid JWT token
2. **Workspace Isolation**: Users can only access their workspace
3. **Role-Based Access**: Agents enforce role requirements
4. **Input Validation**: All inputs are validated before processing
5. **Error Messages**: Sensitive information is not exposed in errors

## Monitoring & Debugging

Enable detailed logging by checking:
- Supabase Edge Function logs
- agent_tasks table for execution history
- material_agents table for performance metrics

## Future Enhancements

- [ ] Caching for coordination plans
- [ ] Parallel agent execution
- [ ] Advanced retry logic
- [ ] Rate limiting per user
- [ ] Agent performance optimization
- [ ] Custom agent registration

