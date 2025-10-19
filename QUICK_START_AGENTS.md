# PraisonAI Agents - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Initialize Agent Manager
```typescript
import { agentManager } from '@/services/agents';

// In your app initialization
await agentManager.initialize();
```

### 2. Execute an Agent
```typescript
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
  console.log('Results:', response.result);
} else {
  console.error('Error:', response.error);
}
```

## 📋 Available Agents

### Research Agent
- **ID**: `research-agent`
- **Access**: Admin, Owner only
- **Use**: Advanced research, analysis, data extraction
- **Tools**: web-search, code-analysis, data-extraction

### MIVAA Search Agent
- **ID**: `mivaa-search-agent`
- **Access**: All users (admin, member, owner)
- **Use**: Search material database
- **Tools**: mivaa-search, material-retrieval, vector-search

## 🔐 Check Access

```typescript
// Check if user can access an agent
const canAccess = agentManager.checkAgentAccess('research-agent', 'member');
// Returns: false

// Get accessible agents for a role
const agents = agentManager.getAccessibleAgents('member');
// Returns: [MIVAA Search Agent]

// Check if user can access a tool
const canUseTool = agentManager.checkToolAccess('data-extraction', 'admin');
// Returns: true
```

## 📊 Get Accessible Resources

```typescript
// Get all agents accessible to a role
const agents = agentManager.getAccessibleAgents('member');
agents.forEach(agent => {
  console.log(`Agent: ${agent.agentName}`);
  console.log(`Description: ${agent.description}`);
  console.log(`Tools: ${agent.toolAccess.map(t => t.toolId).join(', ')}`);
});

// Get all tools accessible to a role
const tools = agentManager.getAccessibleTools('admin');
tools.forEach(tool => {
  console.log(`Tool: ${tool.name}`);
  console.log(`Risk Level: ${tool.riskLevel}`);
  console.log(`Rate Limit: ${tool.rateLimitPerMinute}/min`);
});
```

## 🔍 MIVAA Search Examples

### Semantic Search
```typescript
const response = await agentManager.executeAgent({
  agentId: 'mivaa-search-agent',
  userId: 'user123',
  userRole: 'member',
  parameters: {
    query: 'high strength lightweight materials',
    searchType: 'semantic',
    limit: 5
  }
});
```

### Vector Search
```typescript
const response = await agentManager.executeAgent({
  agentId: 'mivaa-search-agent',
  userId: 'user123',
  userRole: 'member',
  parameters: {
    query: 'aluminum alloys',
    searchType: 'vector',
    limit: 10
  }
});
```

### Hybrid Search
```typescript
const response = await agentManager.executeAgent({
  agentId: 'mivaa-search-agent',
  userId: 'user123',
  userRole: 'member',
  parameters: {
    query: 'thermal conductivity',
    searchType: 'hybrid',
    limit: 15
  }
});
```

## 🛠️ API Endpoints

### List Accessible Agents
```bash
GET /api/agents
Authorization: Bearer {token}
```

### Get Agent Details
```bash
GET /api/agents/mivaa-search-agent
Authorization: Bearer {token}
```

### Execute Agent
```bash
POST /api/agents/mivaa-search-agent/execute
Authorization: Bearer {token}
Content-Type: application/json

{
  "parameters": {
    "query": "ceramic materials",
    "searchType": "semantic",
    "limit": 10
  }
}
```

### List Available Tools
```bash
GET /api/agents/tools/available
Authorization: Bearer {token}
```

### View Execution History (Admin Only)
```bash
GET /api/agents/execution-history?limit=100
Authorization: Bearer {token}
```

## 🎯 Common Patterns

### React Component Example
```typescript
import { useEffect, useState } from 'react';
import { agentManager } from '@/services/agents';
import { useUserRole } from '@/hooks/useUserRole';

export function AgentSearch() {
  const { role } = useUserRole();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const accessible = agentManager.getAccessibleAgents(role);
    setAgents(accessible);
  }, [role]);

  const handleSearch = async (query: string) => {
    setLoading(true);
    try {
      const response = await agentManager.executeAgent({
        agentId: 'mivaa-search-agent',
        userId: 'current-user',
        userRole: role,
        parameters: { query, searchType: 'semantic', limit: 10 }
      });
      setResults(response.result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Available Agents: {agents.length}</h2>
      <input 
        type="text" 
        placeholder="Search materials..."
        onKeyPress={(e) => e.key === 'Enter' && handleSearch(e.currentTarget.value)}
      />
      {loading && <p>Searching...</p>}
      {results && <pre>{JSON.stringify(results, null, 2)}</pre>}
    </div>
  );
}
```

## ⚠️ Common Issues

### Access Denied Error
```
Error: Access denied - User role 'member' cannot access agent 'research-agent'
```
**Solution**: Research Agent is admin-only. Use MIVAA Search Agent instead.

### Rate Limit Exceeded
```
Error: Rate limit exceeded for tool 'mivaa-search' (60 per minute)
```
**Solution**: Wait before making another request or increase rate limit in config.

### Agent Not Found
```
Error: Agent 'unknown-agent' not found
```
**Solution**: Check agent ID. Available agents: 'research-agent', 'mivaa-search-agent'

## 📚 Documentation

- **Full Guide**: See `src/services/agents/INTEGRATION_GUIDE.md`
- **Implementation Details**: See `PRAISONAI_IMPLEMENTATION_COMPLETE.md`
- **API Reference**: See `src/api/agents.ts`

## 🧪 Testing

```bash
# Run agent system tests
npm test -- agentSystem.test.ts

# Run specific test
npm test -- agentSystem.test.ts -t "should allow admin to access research agent"
```

## 🔗 Related Files

- Agent Manager: `src/services/agents/agentManager.ts`
- API Routes: `src/api/agents.ts`
- Access Control: `src/services/agents/agentRoleAccessControl.ts`
- Tool Control: `src/services/agents/toolAccessControl.ts`
- Research Agent: `src/services/agents/researchAgent.ts`
- MIVAA Search Agent: `src/services/agents/mivaaSearchAgent.ts`

## 💡 Tips

1. Always check user role before executing agents
2. Use `getAccessibleAgents()` to show only available agents to users
3. Handle rate limiting gracefully in UI
4. Log execution results for debugging
5. Use semantic search for natural language queries
6. Use vector search for similarity matching
7. Use hybrid search for best results

---

**Last Updated**: 2025-01-04
**Version**: 1.0.0

