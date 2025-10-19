# PraisonAI Integration Guide

## Overview

The Material Kai Vision Platform now integrates PraisonAI with role-based access control. Two specialized agents are available:

1. **Research Agent** - Admin only, for advanced research and analysis
2. **MIVAA Search Agent** - All users, for material database searches

## Architecture

### Components

- **agentRoleAccessControl.ts** - Central RBAC system for agents
- **toolAccessControl.ts** - Tool-level access control
- **researchAgent.ts** - Research agent implementation
- **mivaaSearchAgent.ts** - MIVAA search agent implementation
- **agentManager.ts** - Central orchestrator
- **agents.ts** - API endpoints

### Role Hierarchy

```
Owner (Level 3) > Admin (Level 2) > Member (Level 1)
```

## Agent Access Control

### Research Agent (Admin Only)

**Access**: `admin`, `owner`

**Capabilities**:
- Web search
- Code analysis
- Data extraction
- Deep research with source analysis

**Tools**:
- `web-search` - Search the web
- `code-analysis` - Analyze code
- `data-extraction` - Extract data (requires approval)

### MIVAA Search Agent (All Users)

**Access**: `admin`, `member`, `owner`

**Capabilities**:
- Semantic search
- Vector search
- Hybrid search
- Material retrieval

**Tools**:
- `mivaa-search` - Search materials
- `material-retrieval` - Get material details
- `vector-search` - Semantic search

## API Endpoints

### List Available Agents

```http
GET /api/agents
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "agents": [
    {
      "id": "mivaa-search-agent",
      "name": "MIVAA Search Agent",
      "description": "Search and retrieve materials from MIVAA database",
      "allowedRoles": ["admin", "member", "owner"],
      "tools": [...]
    }
  ]
}
```

### Get Agent Details

```http
GET /api/agents/{agentId}
Authorization: Bearer {token}
```

### Execute Agent

```http
POST /api/agents/{agentId}/execute
Authorization: Bearer {token}
Content-Type: application/json

{
  "parameters": {
    "query": "Find materials with high thermal conductivity",
    "searchType": "semantic",
    "limit": 10
  }
}
```

**Response**:
```json
{
  "success": true,
  "agentId": "mivaa-search-agent",
  "result": {
    "query": "Find materials with high thermal conductivity",
    "materials": [...],
    "totalResults": 5,
    "executionTime": 1234,
    "timestamp": "2025-01-04T10:00:00Z"
  },
  "executionTime": 1234,
  "timestamp": "2025-01-04T10:00:00Z"
}
```

### List Available Tools

```http
GET /api/agents/tools/available
Authorization: Bearer {token}
```

### Get Execution History (Admin Only)

```http
GET /api/agents/execution-history?limit=100
Authorization: Bearer {token}
```

## Usage Examples

### JavaScript/TypeScript

```typescript
import { agentManager } from '@/services/agents';

// Initialize
await agentManager.initialize();

// Execute MIVAA Search Agent
const response = await agentManager.executeAgent({
  agentId: 'mivaa-search-agent',
  userId: 'user123',
  userRole: 'member',
  parameters: {
    query: 'ceramic materials',
    searchType: 'semantic',
    limit: 10
  }
});

if (response.success) {
  console.log('Materials found:', response.result);
} else {
  console.error('Error:', response.error);
}
```

### React Component

```typescript
import { useUserRole } from '@/hooks/useUserRole';
import { agentManager } from '@/services/agents';

export function AgentInterface() {
  const { role } = useUserRole();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    const accessible = agentManager.getAccessibleAgents(role);
    setAgents(accessible);
  }, [role]);

  return (
    <div>
      <h2>Available Agents</h2>
      {agents.map(agent => (
        <div key={agent.agentId}>
          <h3>{agent.agentName}</h3>
          <p>{agent.description}</p>
        </div>
      ))}
    </div>
  );
}
```

## Security Considerations

1. **Role-Based Access**: All agent access is controlled by user role
2. **Tool-Level Control**: Individual tools have their own access policies
3. **Rate Limiting**: Tools have per-minute rate limits
4. **Execution Logging**: All agent executions are logged
5. **Approval Required**: High-risk tools require approval

## Configuration

### Adding New Agents

```typescript
import { agentAccessControl } from '@/services/agents';

agentAccessControl.registerAgentPolicy({
  agentId: 'custom-agent',
  agentName: 'Custom Agent',
  description: 'My custom agent',
  allowedRoles: ['admin'],
  toolAccess: [
    {
      toolId: 'custom-tool',
      toolName: 'Custom Tool',
      description: 'A custom tool',
      allowedRoles: ['admin'],
      riskLevel: 'low'
    }
  ]
});
```

### Adding New Tools

```typescript
import { toolAccessControl } from '@/services/agents';

toolAccessControl.registerTool({
  id: 'custom-tool',
  name: 'Custom Tool',
  description: 'A custom tool',
  category: 'utility',
  allowedRoles: ['admin', 'member'],
  riskLevel: 'low',
  rateLimitPerMinute: 30
});
```

## Troubleshooting

### Access Denied Error

Check that:
1. User role is correct
2. Agent is registered in access control
3. User role is in `allowedRoles` for the agent

### Rate Limit Exceeded

Wait before making another request or increase `rateLimitPerMinute` in tool config.

### Agent Not Found

Ensure agent is registered and initialized in AgentManager.

