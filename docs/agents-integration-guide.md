# Agent System Integration Guide

**Last Updated**: 2025-01-04
**Version**: 1.0.0

## 🎯 Quick Integration Steps

### Step 1: Initialize Agent Manager

```typescript
// In your main application file (e.g., src/main.ts or src/server.ts)
import { agentManager } from '@/services/agents';

// Initialize on app startup
await agentManager.initialize();
```

### Step 2: Mount Agent Routes

```typescript
import express from 'express';
import agentRoutes from '@/api/agents';

const app = express();

// Mount agent routes
app.use('/api', agentRoutes);
```

### Step 3: Add Authentication Middleware

```typescript
// Middleware to extract user info from JWT
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    // Decode JWT and attach user info
    const decoded = jwt.decode(token);
    (req as any).userId = decoded.sub;
    (req as any).userRole = decoded.user_role || 'member';
  }
  
  next();
});
```

## 📁 File Structure

```
src/
├── services/
│   └── agents/
│       ├── index.ts                      # Main exports
│       ├── agentManager.ts               # Central orchestrator
│       ├── agentRoleAccessControl.ts     # RBAC system
│       ├── toolAccessControl.ts          # Tool permissions
│       ├── researchAgent.ts              # Research agent
│       ├── mivaaSearchAgent.ts           # MIVAA search agent
│       ├── agentFileUploadService.ts     # File upload
│       └── agentChatHistoryService.ts    # Chat history
├── api/
│   └── agents.ts                         # REST endpoints
└── components/
    └── AI/
        └── MaterialAgentSearchInterface.tsx  # UI component

supabase/
└── migrations/
    ├── create_agent_uploaded_files_table.sql
    └── create_agent_chat_history_tables.sql

docs/
├── agents-system.md                      # Main documentation
└── agents-integration-guide.md           # This file
```

## 🔌 Frontend Integration

### Using Agent in React Component

```typescript
import { useState } from 'react';
import { agentManager } from '@/services/agents';

export function AgentInterface() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const executeAgent = async (query: string) => {
    setLoading(true);
    try {
      const response = await agentManager.executeAgent({
        agentId: 'mivaa-search-agent',
        userId: 'current-user-id',
        userRole: 'member',
        parameters: { query }
      });
      
      setResult(response.result);
    } catch (error) {
      console.error('Agent execution failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        type="text" 
        placeholder="Ask the agent..."
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            executeAgent(e.currentTarget.value);
          }
        }}
      />
      {loading && <p>Loading...</p>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

### Using Chat History

```typescript
import { agentChatHistoryService } from '@/services/agents';

export function ChatInterface() {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);

  // Load conversations
  const loadConversations = async (userId: string) => {
    const convs = await agentChatHistoryService.getUserConversations(userId);
    setConversations(convs);
  };

  // Create new conversation
  const createChat = async (userId: string, agentId: string) => {
    const conv = await agentChatHistoryService.createConversation({
      userId,
      agentId,
      title: 'New Chat',
      description: 'Chat with agent'
    });
    setCurrentConversation(conv);
  };

  // Save message
  const sendMessage = async (content: string) => {
    if (!currentConversation) return;
    
    const message = await agentChatHistoryService.saveMessage({
      conversationId: currentConversation.id,
      role: 'user',
      content
    });
    
    return message;
  };

  return (
    <div>
      {/* Conversation list */}
      {conversations.map(conv => (
        <div key={conv.id} onClick={() => setCurrentConversation(conv)}>
          {conv.title}
        </div>
      ))}
      
      {/* Chat area */}
      {currentConversation && (
        <div>
          <h2>{currentConversation.title}</h2>
          <input 
            type="text"
            placeholder="Type message..."
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                sendMessage(e.currentTarget.value);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
```

### File Upload Integration

```typescript
import { agentFileUploadService } from '@/services/agents';

export function FileUploadComponent() {
  const handleFileUpload = async (file: File, userId: string, agentId: string) => {
    const result = await agentFileUploadService.uploadFile(file, {
      userId,
      agentId
    });

    if (result.success) {
      console.log('File uploaded:', result.file);
      // Use result.file.url for agent processing
    } else {
      console.error('Upload failed:', result.error);
    }
  };

  return (
    <input 
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          handleFileUpload(file, 'user-id', 'agent-id');
        }
      }}
    />
  );
}
```

## 🔐 Role-Based Access Control

### User Roles

```typescript
type UserRole = 'owner' | 'admin' | 'member' | 'guest';

// Role Hierarchy
// owner > admin > member > guest
```

### Agent Access by Role

| Agent | Owner | Admin | Member | Guest |
|-------|-------|-------|--------|-------|
| Research Agent | ✅ | ✅ | ❌ | ❌ |
| MIVAA Search Agent | ✅ | ✅ | ✅ | ❌ |

### Tool Access by Role

| Tool | Owner | Admin | Member |
|------|-------|-------|--------|
| web-search | ✅ | ✅ | ❌ |
| code-analysis | ✅ | ✅ | ❌ |
| mivaa-search | ✅ | ✅ | ✅ |
| material-retrieval | ✅ | ✅ | ✅ |

## 🗄️ Database Setup

### Run Migrations

```bash
# Using Supabase CLI
supabase migration up

# Or manually execute SQL files
# supabase/migrations/create_agent_uploaded_files_table.sql
# supabase/migrations/create_agent_chat_history_tables.sql
```

### Verify Tables

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'agent_%';

-- Should return:
-- agent_chat_conversations
-- agent_chat_messages
-- agent_uploaded_files
```

## 🧪 Testing Integration

### Test Agent Execution

```typescript
import { agentManager } from '@/services/agents';

describe('Agent Integration', () => {
  it('should execute MIVAA search agent', async () => {
    const response = await agentManager.executeAgent({
      agentId: 'mivaa-search-agent',
      userId: 'test-user',
      userRole: 'member',
      parameters: { query: 'test' }
    });

    expect(response.success).toBe(true);
    expect(response.result).toBeDefined();
  });

  it('should deny access to research agent for members', async () => {
    const response = await agentManager.executeAgent({
      agentId: 'research-agent',
      userId: 'test-user',
      userRole: 'member',
      parameters: {}
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('access');
  });
});
```

### Test File Upload

```typescript
import { agentFileUploadService } from '@/services/agents';

describe('File Upload', () => {
  it('should upload file successfully', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    
    const result = await agentFileUploadService.uploadFile(file, {
      userId: 'test-user',
      agentId: 'test-agent'
    });

    expect(result.success).toBe(true);
    expect(result.file?.url).toBeDefined();
  });
});
```

## 🚀 Deployment Checklist

- [ ] Database migrations executed
- [ ] Environment variables configured
- [ ] Agent routes mounted in Express app
- [ ] Authentication middleware added
- [ ] Agent manager initialized on startup
- [ ] File upload bucket created in Supabase
- [ ] RLS policies verified
- [ ] Tests passing
- [ ] Frontend components integrated
- [ ] Documentation updated

## 📞 Troubleshooting

### Agent Not Found
```
Error: Agent 'agent-id' not found
```
**Solution**: Verify agent is registered in agentManager

### Access Denied
```
Error: User role 'member' cannot access agent 'research-agent'
```
**Solution**: Check role-based access policies

### File Upload Failed
```
Error: File size exceeds limit of 50MB
```
**Solution**: Reduce file size or update MAX_FILE_SIZE

### Database Connection Error
```
Error: Failed to connect to database
```
**Solution**: Verify Supabase credentials and network access

## 📚 Additional Resources

- [PraisonAI Documentation](https://docs.praison.ai)
- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Guide](https://expressjs.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

---

**Version**: 1.0.0
**Last Updated**: 2025-01-04

