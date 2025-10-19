# Agent System API Reference

**Last Updated**: 2025-01-04
**Version**: 1.0.0

## 🔑 Authentication

All endpoints require JWT authentication via `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## 📋 Agent Management Endpoints

### List Accessible Agents

```http
GET /api/agents
```

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "mivaa-search-agent",
      "name": "MIVAA Search Agent",
      "description": "Search materials in database",
      "accessible": true,
      "tools": ["mivaa-search", "material-retrieval"]
    }
  ]
}
```

### Get Agent Details

```http
GET /api/agents/{agentId}
```

**Parameters:**
- `agentId` (string, required) - Agent identifier

**Response:**
```json
{
  "success": true,
  "agent": {
    "id": "mivaa-search-agent",
    "name": "MIVAA Search Agent",
    "description": "Search materials in database",
    "allowedRoles": ["owner", "admin", "member"],
    "tools": [
      {
        "id": "mivaa-search",
        "name": "MIVAA Search",
        "description": "Search materials",
        "allowedRoles": ["owner", "admin", "member"]
      }
    ]
  }
}
```

### Execute Agent

```http
POST /api/agents/{agentId}/execute
Content-Type: application/json

{
  "parameters": {
    "query": "high strength materials",
    "limit": 10
  },
  "attachments": [
    {
      "id": "file-123",
      "name": "spec.pdf",
      "url": "https://...",
      "type": "application/pdf",
      "size": 1024000
    }
  ]
}
```

**Parameters:**
- `agentId` (string, required) - Agent identifier
- `parameters` (object, required) - Agent-specific parameters
- `attachments` (array, optional) - File attachments

**Response:**
```json
{
  "success": true,
  "agentId": "mivaa-search-agent",
  "result": {
    "matches": [
      {
        "id": "mat-123",
        "name": "Titanium Alloy",
        "properties": {
          "strength": 900,
          "density": 4.5
        },
        "relevance": 0.95
      }
    ]
  },
  "executionTime": 245,
  "timestamp": "2025-01-04T10:30:00Z"
}
```

### Get Execution History

```http
GET /api/agents/execution-history?limit=100
```

**Query Parameters:**
- `limit` (number, optional) - Max results (default: 100)

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "agentId": "mivaa-search-agent",
      "userId": "user-123",
      "timestamp": "2025-01-04T10:30:00Z",
      "executionTime": 245,
      "success": true
    }
  ]
}
```

## 📁 File Upload Endpoints

### Upload File

```http
POST /api/agents/files/upload
Content-Type: multipart/form-data

file: <binary>
agentId: mivaa-search-agent
```

**Parameters:**
- `file` (file, required) - File to upload
- `agentId` (string, required) - Associated agent

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "file-123",
    "name": "material-spec.pdf",
    "type": "application/pdf",
    "size": 1024000,
    "url": "https://storage.example.com/file-123",
    "storagePath": "agent-uploads/user-123/agent-id/file.pdf",
    "uploadedAt": "2025-01-04T10:30:00Z",
    "userId": "user-123",
    "agentId": "mivaa-search-agent"
  }
}
```

### Get Agent Files

```http
GET /api/agents/{agentId}/files
```

**Parameters:**
- `agentId` (string, required) - Agent identifier

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "id": "file-123",
      "name": "material-spec.pdf",
      "type": "application/pdf",
      "size": 1024000,
      "url": "https://storage.example.com/file-123",
      "uploadedAt": "2025-01-04T10:30:00Z"
    }
  ]
}
```

### Delete File

```http
DELETE /api/agents/files/{fileId}
```

**Parameters:**
- `fileId` (string, required) - File identifier

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

## 💬 Chat History Endpoints

### Create Conversation

```http
POST /api/agents/chat/conversations
Content-Type: application/json

{
  "agentId": "mivaa-search-agent",
  "title": "Material Analysis",
  "description": "Analyzing ceramic materials"
}
```

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv-123",
    "userId": "user-123",
    "agentId": "mivaa-search-agent",
    "title": "Material Analysis",
    "description": "Analyzing ceramic materials",
    "messageCount": 0,
    "lastMessageAt": null,
    "createdAt": "2025-01-04T10:30:00Z",
    "updatedAt": "2025-01-04T10:30:00Z",
    "isArchived": false
  }
}
```

### Get Conversations

```http
GET /api/agents/chat/conversations?agentId=mivaa-search-agent
```

**Query Parameters:**
- `agentId` (string, optional) - Filter by agent

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv-123",
      "agentId": "mivaa-search-agent",
      "title": "Material Analysis",
      "messageCount": 5,
      "lastMessageAt": "2025-01-04T10:35:00Z",
      "createdAt": "2025-01-04T10:30:00Z",
      "isArchived": false
    }
  ]
}
```

### Get Conversation Details

```http
GET /api/agents/chat/conversations/{conversationId}?limit=50
```

**Parameters:**
- `conversationId` (string, required) - Conversation identifier

**Query Parameters:**
- `limit` (number, optional) - Max messages (default: 50)

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv-123",
    "title": "Material Analysis",
    "messageCount": 5
  },
  "messages": [
    {
      "id": "msg-1",
      "conversationId": "conv-123",
      "role": "user",
      "content": "Find high strength materials",
      "attachments": [],
      "createdAt": "2025-01-04T10:30:00Z"
    },
    {
      "id": "msg-2",
      "conversationId": "conv-123",
      "role": "assistant",
      "content": "Found 5 materials matching criteria",
      "createdAt": "2025-01-04T10:30:30Z"
    }
  ]
}
```

### Save Message

```http
POST /api/agents/chat/messages
Content-Type: application/json

{
  "conversationId": "conv-123",
  "role": "user",
  "content": "Find materials with high thermal conductivity",
  "attachmentIds": ["file-123"],
  "metadata": {
    "source": "web-ui",
    "version": "1.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "msg-123",
    "conversationId": "conv-123",
    "role": "user",
    "content": "Find materials with high thermal conductivity",
    "attachments": ["file-123"],
    "createdAt": "2025-01-04T10:30:00Z"
  }
}
```

### Update Conversation

```http
PUT /api/agents/chat/conversations/{conversationId}
Content-Type: application/json

{
  "title": "Updated Title"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Conversation updated"
}
```

### Delete Conversation

```http
DELETE /api/agents/chat/conversations/{conversationId}
```

**Response:**
```json
{
  "success": true,
  "message": "Conversation deleted"
}
```

## ❌ Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required fields: userId, agentId"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "User not authenticated"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "User role 'member' cannot access agent 'research-agent'"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Conversation not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to execute agent"
}
```

## 📊 Rate Limiting

Rate limits are applied per tool and user:

| Tool | Limit | Window |
|------|-------|--------|
| mivaa-search | 60 | 1 minute |
| material-retrieval | 30 | 1 minute |
| web-search | 20 | 1 minute |
| code-analysis | 10 | 1 minute |

## 🔄 Pagination

List endpoints support pagination:

```http
GET /api/agents/chat/conversations?limit=20&offset=0
```

---

**Version**: 1.0.0
**Last Updated**: 2025-01-04

