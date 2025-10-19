# Agent System Documentation

**Last Updated**: 2025-01-04
**Version**: 1.0.0
**Status**: ✅ Production Ready

## 📋 Overview

The Material Kai Vision Platform includes a comprehensive agent system powered by PraisonAI with role-based access control (RBAC). The system provides specialized agents for different user roles with support for file uploads, chat history, and multi-modal processing.

## 🎯 Core Features

### 1. **Role-Based Access Control (RBAC)**
- Three-tier role hierarchy: Owner > Admin > Member
- Agent-level access policies
- Tool-level access policies
- Rate limiting and execution logging

### 2. **Two Specialized Agents**

#### Research Agent (Admin Only)
- **Access**: Admins and Owners only
- **Capabilities**:
  - Web search and information retrieval
  - Code analysis and review
  - Data extraction and processing
  - Deep research with source tracking
  - Confidence scoring for results
- **Tools**: web-search, code-analysis, data-extraction

#### MIVAA Search Agent (All Users)
- **Access**: All authenticated users (admin, member, owner)
- **Capabilities**:
  - Semantic search on material database
  - Vector search using embeddings
  - Hybrid search combining multiple methods
  - Material retrieval with relevance scoring
  - Property analysis and recommendations
- **Tools**: mivaa-search, material-retrieval, vector-search

### 3. **File Upload & Attachment Support**
- Upload files for agent processing
- Support for PDFs, images, documents
- Secure storage with user isolation
- File metadata tracking
- Attachment integration with conversations

### 4. **Chat History & Conversations**
- User-specific conversation storage
- Message history with timestamps
- Conversation archiving and deletion
- Attachment tracking in messages
- Privacy controls via Row Level Security

## 🔐 Security & Privacy

### Authentication
- JWT-based authentication via Supabase
- User session management
- Automatic token refresh

### Authorization
- Role-based access control
- User-specific data isolation
- Row Level Security (RLS) policies
- Tool-level permission enforcement

### Data Privacy
- Users can only access their own conversations
- Users can only view their own uploaded files
- Conversations are not visible to other users
- Automatic cleanup on user deletion

## 📡 API Endpoints

### Agent Management
```
GET    /api/agents                    - List accessible agents
GET    /api/agents/{agentId}          - Get agent details
POST   /api/agents/{agentId}/execute  - Execute agent
GET    /api/agents/tools/available    - List accessible tools
GET    /api/agents/execution-history  - View history (admin only)
```

### File Upload
```
POST   /api/agents/files/upload       - Upload a file
GET    /api/agents/{agentId}/files    - Get uploaded files
DELETE /api/agents/files/{fileId}     - Delete a file
```

### Chat History
```
POST   /api/agents/chat/conversations           - Create conversation
GET    /api/agents/chat/conversations           - Get user's conversations
GET    /api/agents/chat/conversations/{id}      - Get conversation details
POST   /api/agents/chat/messages                - Save message
PUT    /api/agents/chat/conversations/{id}      - Update conversation
DELETE /api/agents/chat/conversations/{id}      - Delete conversation
```

## 💻 Usage Examples

### Execute MIVAA Search Agent
```typescript
import { agentManager } from '@/services/agents';

const response = await agentManager.executeAgent({
  agentId: 'mivaa-search-agent',
  userId: 'user123',
  userRole: 'member',
  parameters: {
    query: 'high thermal conductivity materials',
    searchType: 'semantic',
    limit: 10
  },
  attachments: [
    {
      id: 'file-123',
      name: 'material-spec.pdf',
      url: 'https://...',
      type: 'application/pdf',
      size: 1024000
    }
  ]
});
```

### Create Chat Conversation
```typescript
import { agentChatHistoryService } from '@/services/agents';

const conversation = await agentChatHistoryService.createConversation({
  userId: 'user123',
  agentId: 'mivaa-search-agent',
  title: 'Material Analysis Session',
  description: 'Analyzing ceramic materials'
});
```

### Upload File
```typescript
import { agentFileUploadService } from '@/services/agents';

const result = await agentFileUploadService.uploadFile(file, {
  userId: 'user123',
  agentId: 'mivaa-search-agent'
});
```

### Save Chat Message
```typescript
const message = await agentChatHistoryService.saveMessage({
  conversationId: 'conv-123',
  role: 'user',
  content: 'Find materials with high strength',
  attachmentIds: ['file-123'],
  metadata: { source: 'web-ui' }
});
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│      Frontend Components             │
│  (Agent UI, Chat Interface)          │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│      REST API Endpoints              │
│  (src/api/agents.ts)                │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│      Agent Services                  │
│  (Manager, File Upload, Chat)        │
└────────────────┬────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼────────┐  ┌────▼──────────┐
│ Research Agent │  │ MIVAA Search  │
│  (Admin Only)  │  │  Agent (All)  │
└────────────────┘  └───────────────┘
        │                 │
└───────┬─────────────────┘
        │
┌───────▼──────────────────────────────┐
│  Access Control & Tool Management    │
│  (RBAC + Tool Access + Rate Limit)   │
└──────────────────────────────────────┘
        │
┌───────▼──────────────────────────────┐
│      Supabase Backend                │
│  (Database, Storage, Auth)           │
└──────────────────────────────────────┘
```

## 📊 Database Schema

### agent_chat_conversations
- `id` - Unique conversation ID
- `user_id` - Owner of conversation
- `agent_id` - Associated agent
- `title` - Conversation title
- `message_count` - Number of messages
- `is_archived` - Archive status
- `created_at`, `updated_at` - Timestamps

### agent_chat_messages
- `id` - Unique message ID
- `conversation_id` - Parent conversation
- `role` - Message role (user/assistant/system)
- `content` - Message content
- `attachment_ids` - Attached files
- `metadata` - Additional data
- `created_at` - Timestamp

### agent_uploaded_files
- `id` - Unique file ID
- `user_id` - File owner
- `agent_id` - Associated agent
- `file_name` - Original filename
- `file_type` - MIME type
- `storage_path` - Storage location
- `public_url` - Public access URL
- `created_at` - Upload timestamp

## 🔧 Configuration

### Adding New Agents
```typescript
agentAccessControl.registerAgentPolicy({
  agentId: 'custom-agent',
  agentName: 'Custom Agent',
  description: 'My custom agent',
  allowedRoles: ['admin'],
  toolAccess: [...]
});
```

### Adding New Tools
```typescript
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

## 🧪 Testing

```bash
# Run agent system tests
npm test -- agentSystem.test.ts

# Run specific test
npm test -- agentSystem.test.ts -t "should allow admin to access research agent"
```

## 📚 Related Documentation

- **[Integration Guide](./services/agents/INTEGRATION_GUIDE.md)** - Complete integration guide
- **[Quick Start](./QUICK_START_AGENTS.md)** - 5-minute setup guide
- **[API Documentation](./api-documentation.md)** - Full API reference
- **[Security & Authentication](./security-authentication.md)** - Security details

## 🚀 Deployment

### Prerequisites
- Supabase project with PostgreSQL
- Node.js 18+
- PraisonAI package installed

### Setup Steps
1. Run database migrations
2. Configure environment variables
3. Mount API routes in Express app
4. Initialize agent manager on startup
5. Deploy to production

## 📞 Support & Troubleshooting

### Common Issues

**Access Denied Error**
- Check user role matches agent requirements
- Verify role-based access control policies

**File Upload Failed**
- Check file size (max 50MB)
- Verify file type is allowed
- Ensure storage bucket exists

**Conversation Not Found**
- Verify conversation belongs to user
- Check conversation ID is correct
- Ensure user is authenticated

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-04 | Initial release with file upload and chat history |

---

**Status**: ✅ Production Ready
**Last Updated**: 2025-01-04
**Maintained By**: Development Team

