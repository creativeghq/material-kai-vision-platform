# Agent System Architecture

Complete guide to the AI Agent system with database-driven prompts and configurations.

---

## 🤖 Overview

The Material Kai Vision Platform uses an AI Agent system powered by LangChain.js and Anthropic Claude models. Agents are specialized AI assistants that help users with specific tasks like PDF processing, search, and product information.

**Key Features**:
- ✅ Database-driven system prompts (no code deployment needed)
- ✅ Admin UI for prompt management
- ✅ Real-time prompt updates
- ✅ Fallback to default prompts
- ✅ Role-based access control
- ✅ Tool orchestration with LangChain.js

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - Agent Hub (/agents)                                      │
│  - Agent Configs Admin (/admin/agent-configs)              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                 │
│  - agent-chat/index.ts                                      │
│  - Loads prompts from database                              │
│  - LangChain.js tool orchestration                          │
│  - Claude Sonnet 4.5 model                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL/Supabase)                 │
│  - material_agents table                                    │
│  - Stores: prompts, configs, capabilities                   │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

**Table: `material_agents`**

```sql
CREATE TABLE material_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT DEFAULT 'active',
  version TEXT,
  system_prompt TEXT,              -- AI system prompt
  configuration JSONB,              -- Agent-specific config
  capabilities JSONB,               -- Agent capabilities
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Current Agents**:

| Agent Type | Name | Status | Prompt Length | Purpose |
|------------|------|--------|---------------|---------|
| pdf-processor | PDF Processing Agent | active | 8,997 chars | Orchestrate PDF processing pipeline |
| search | Search Agent | active | 198 chars | Help users search materials |
| product | Product Agent | active | 158 chars | Provide product information |

---

## 🎯 Agent Types

### 1. PDF Processing Agent

**Agent Type**: `pdf-processor`  
**Access**: Admin only  
**Model**: Claude Sonnet 4.5

**Purpose**: Orchestrate the complete PDF processing pipeline with intelligent monitoring, diagnostics, and recovery.

**Key Capabilities**:
- Job recovery and continuity checking
- Pre-upload validation (check for existing jobs)
- Real-time progress monitoring
- Error handling and diagnostics
- Server health checks
- Sentry error querying

**Available Tools**:
1. `uploadPDF` - Upload PDF and start processing
2. `checkJobStatus` - Poll job progress
3. `queryDatabase` - Direct database access
4. `checkServerHealth` - SSH server diagnostics
5. `querySentry` - Error tracking

**Workflow**:
1. Pre-upload check (MANDATORY)
2. Upload phase
3. Monitoring phase (poll every 10s)
4. Completion phase (generate report)
5. Failure phase (diagnostics and recovery)

### 2. Search Agent

**Agent Type**: `search`  
**Access**: All users  
**Model**: Claude Sonnet 4.5

**Purpose**: Help users find materials using multi-modal search capabilities.

**Key Capabilities**:
- Semantic search
- Vector search
- Image-based search
- Hybrid search strategies

### 3. Product Agent

**Agent Type**: `product`  
**Access**: All users  
**Model**: Claude Sonnet 4.5

**Purpose**: Provide detailed product information and recommendations.

**Key Capabilities**:
- Product details lookup
- Metadata explanation
- Related products
- Material recommendations

---

## 🔧 Admin UI - Agent Configurations

### Location
`/admin/agent-configs`

### Features

**Table View**:
- Agent name and description
- Agent type (code format)
- Status badge (active/inactive/development)
- Version number
- Prompt length (character count)
- Last updated timestamp
- Edit button

**Edit Modal**:
- Large textarea for prompt editing
- Real-time character count
- Agent metadata display
- Save/Cancel buttons
- Validation

**Stats Cards**:
- Total agents
- Active agents
- Configured prompts (>100 chars)

**Actions**:
- Refresh data
- Edit prompts
- Save changes (updates database)

### Usage

1. Navigate to Admin Dashboard → AI & Intelligence → Agent Configurations
2. Click "Edit" button on any agent
3. Modify the system prompt in the textarea
4. Click "Save Changes"
5. Changes take effect immediately on next agent execution

---

## 💻 Technical Implementation

### Edge Function (agent-chat/index.ts)

**Load Prompt from Database**:
```typescript
async function getAgentSystemPrompt(agentType: string): Promise<string> {
  const { data, error } = await supabase
    .from('material_agents')
    .select('system_prompt')
    .eq('agent_type', agentType)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    return getDefaultPrompt(agentType);
  }

  return data.system_prompt;
}
```

**Execute Agent**:
```typescript
async function executeAgent(agentId: string, userInput: string) {
  const config = AGENT_CONFIGS[agentId];
  
  // Load prompt from database
  const systemPrompt = config.systemPrompt || 
                       await getAgentSystemPrompt(agentId);
  
  // Invoke model with tools
  const response = await modelWithTools.invoke(messages, {
    system: systemPrompt,
  });
  
  return response;
}
```

### Admin UI Component

**Load Agents**:
```typescript
const loadAgents = async () => {
  const { data, error } = await supabase
    .from('material_agents')
    .select('*')
    .order('agent_type');

  setAgents(data || []);
};
```

**Update Prompt**:
```typescript
const handleSave = async () => {
  const { error } = await supabase
    .from('material_agents')
    .update({
      system_prompt: editedPrompt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', editingAgent.id);

  if (!error) {
    toast({ title: 'Success', description: 'Prompt updated' });
    await loadAgents();
  }
};
```

---

## 🔐 Security & Access Control

### Role-Based Access

**Agent Execution**:
- PDF Processing Agent: Admin/Owner only
- Search Agent: All authenticated users
- Product Agent: All authenticated users

**Admin UI**:
- Agent Configurations page: Admin only (protected by AdminGuard)
- Prompt editing: Admin only
- View agents: Admin only

### Authentication

All agent requests require:
1. Valid Supabase session
2. Workspace membership
3. Appropriate role (for restricted agents)

---

## 📊 Monitoring & Analytics

### Metrics Tracked

- Agent invocations per type
- Average response time
- Error rates
- Token usage
- Cost per agent type

### Logging

All agent interactions logged with:
- User ID
- Workspace ID
- Agent type
- Input/output
- Timestamp
- Duration
- Errors

---

## 🚀 Best Practices

### Prompt Engineering

**Do**:
- ✅ Be specific about agent role and capabilities
- ✅ Include clear workflow steps
- ✅ Provide example responses
- ✅ Define error handling procedures
- ✅ Use consistent formatting

**Don't**:
- ❌ Make prompts too generic
- ❌ Include outdated information
- ❌ Forget to test changes
- ❌ Remove critical instructions
- ❌ Exceed reasonable length (>10,000 chars)

### Prompt Updates

1. **Test First**: Test prompt changes in development
2. **Incremental**: Make small, incremental changes
3. **Document**: Document why changes were made
4. **Monitor**: Monitor agent performance after updates
5. **Rollback**: Keep previous versions for rollback

### Performance

- Keep prompts focused and concise
- Use tools efficiently (avoid redundant calls)
- Implement proper error handling
- Cache frequently used data
- Monitor token usage

---

## 🔄 Future Enhancements

### Planned Features

1. **Version History**: Track prompt changes over time
2. **A/B Testing**: Test different prompts with same agent
3. **Prompt Templates**: Pre-built templates for common patterns
4. **Analytics Dashboard**: Agent performance metrics
5. **Prompt Validation**: Automatic validation of prompt quality
6. **Export/Import**: Backup and restore prompts
7. **Multi-Language**: Support for multiple languages
8. **Custom Tools**: Allow admins to add custom tools

### Additional Agents

Potential future agents:
- Research Agent (market research, trends)
- Analytics Agent (data analysis, insights)
- Business Agent (quotes, orders, invoicing)
- Admin Agent (system management)
- Demo Agent (product demonstrations)

---

## 📚 Related Documentation

- **[ai-models-guide.md](ai-models-guide.md)** - AI models used by agents
- **[features-guide.md](features-guide.md)** - Platform features overview
- **[system-architecture.md](system-architecture.md)** - System architecture
- **[api-endpoints.md](api-endpoints.md)** - API reference

---

## 🆘 Troubleshooting

### Agent Not Responding

**Symptoms**: Agent doesn't respond or times out

**Solutions**:
1. Check Edge Function logs in Supabase
2. Verify agent status is 'active'
3. Check system_prompt is not null
4. Verify API keys are configured
5. Check rate limits

### Prompt Not Updating

**Symptoms**: Changes to prompt don't take effect

**Solutions**:
1. Verify save was successful (check toast notification)
2. Check updated_at timestamp changed
3. Clear browser cache
4. Restart Edge Function (if self-hosted)
5. Check database connection

### Permission Denied

**Symptoms**: User can't access agent or admin UI

**Solutions**:
1. Verify user has admin role
2. Check workspace membership
3. Verify AdminGuard is working
4. Check Supabase RLS policies
5. Review authentication logs

---

## 📞 Support

For agent-related issues:
- Check Edge Function logs: Supabase Dashboard → Edge Functions
- Review agent prompts: `/admin/agent-configs`
- Monitor errors: Sentry dashboard
- Contact: support@materialkaivision.com

---

**Last Updated**: November 21, 2025
**Version**: 1.0.0
**Status**: Production
**Maintainer**: Development Team

