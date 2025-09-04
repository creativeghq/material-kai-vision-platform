+++
id = "ROOPM-README-V1"
title = ".roopm Directory: Project Management Structure"
context_type = "documentation"
scope = "Explains the purpose and organization of the .roopm directory"
target_audience = ["all"]
granularity = "overview"
status = "active"
last_updated = "2025-08-30"
tags = ["documentation", "roopm", "project-management", "architecture", "reorganization"]
related_context = [
    ".roo/rules/11-session-management.md",
    ".roo/rules/04-mdtm-workflow-initiation.md",
    ".roo/rules/10-vertex-mcp-usage-guideline.md"
]
+++

# .roopm Directory: Project Management Structure

## Overview

The `.roopm` directory contains **project-specific** generated content and operational data that varies per project, separate from the core Roo system files in `.roo` and `.ruru`.

**Roopm** stands for **"Roo Project Management"** - this directory houses all the dynamic, project-specific workflow artifacts that are generated during development sessions.

## Directory Structure

```
.roopm/
├── sessions/           # Session logs and artifacts
├── tasks/             # MDTM task files
├── planning/          # Project planning documents
└── README.md          # This file
```

### Core Directories

#### **`sessions/`** - Session Management
- **Purpose**: Stores structured session logs with chronological activity tracking
- **Structure**: `SESSION-[Goal]-[TIMESTAMP]/`
  - `session_log.md` - TOML+Markdown session metadata and log entries
  - `artifacts/` - Contextual notes organized by type (notes/, learnings/, research/, etc.)
- **Path**: `.roopm/sessions/SESSION-[SanitizedGoal]-[YYMMDDHHMM]/`

#### **`tasks/`** - MDTM Task Management  
- **Purpose**: Houses Markdown-Driven Task Management (MDTM) files for structured delegation
- **Structure**: Organized by category (`FEATURE_*/`, `BUG_*/`, `REFACTOR_*/`, etc.)
- **Files**: `TASK-[MODE]-[YYYYMMDD-HHMMSS].md` with TOML frontmatter + Markdown checklist
- **Path**: `.roopm/tasks/[CATEGORY]/TASK-[MODE]-[TIMESTAMP].md`

#### **`planning/`** - Project Planning
- **Purpose**: Strategic planning documents, gap analyses, roadmaps
- **Content**: High-level project documentation, decision records, implementation plans
- **Path**: `.roopm/planning/[document-name].md`

## Architecture Philosophy

### **Separation of Concerns**
- **`.roo/`** & **`.ruru/`**: Core Roo system (modes, rules, templates) - **stays consistent across projects**
- **`.roopm/`**: Project-specific generated content - **varies per project, can be project-specific**

### **Benefits**
1. **Portability**: Core Roo system is independent of project data
2. **Scalability**: Multiple projects can have separate `.roopm` directories  
3. **Maintainability**: Core updates don't affect project artifacts
4. **Clarity**: Clear distinction between system and project content
5. **Version Control**: Can separate Roo system from project artifacts in VCS

## Integration with Core Rules

The following core Roo rules have been updated to use `.roopm` paths:

- **Session Management V7** ([`.roo/rules/11-session-management.md`](.roo/rules/11-session-management.md)): Uses `.roopm/sessions/`
- **MDTM Workflow** ([`.roo/rules/04-mdtm-workflow-initiation.md`](.roo/rules/04-mdtm-workflow-initiation.md)): Uses `.roopm/tasks/`
- **Vertex AI MCP Usage** ([`.roo/rules/10-vertex-mcp-usage-guideline.md`](.roo/rules/10-vertex-mcp-usage-guideline.md)): Uses `.roopm/sessions/*/artifacts/docs/vertex/`
- **Prime Coordinator Session Implementation** ([`.roo/rules-prime-coordinator/11-session-management-impl.md`](.roo/rules-prime-coordinator/11-session-management-impl.md)): Updated path references

## Usage Examples

### **Creating a Session**
```
.roopm/sessions/SESSION-BuildAuthFeature-2508301420/
├── session_log.md
└── artifacts/
    ├── notes/
    ├── learnings/ 
    ├── research/
    └── ...
```

### **Creating an MDTM Task**
```
.roopm/tasks/FEATURE_Authentication/TASK-REACT-20250830-1420.md
```

### **Planning Documents**
```
.roopm/planning/auth-system-architecture.md
.roopm/planning/phase2-implementation-plan.md
```

## Migration Notes

This reorganization moved the following from `.ruru/` to `.roopm/`:
- `sessions/` → `.roopm/sessions/`
- `tasks/` → `.roopm/tasks/`  
- `planning/` → `.roopm/planning/`

All path references in core rules have been systematically updated to reflect the new structure.

## Future Considerations

- **Multi-Project Support**: Future versions could support multiple `.roopm-[project-name]/` directories
- **Workspace Integration**: Consider integration with workspace-specific project management tools
- **Archival Strategy**: Define policies for archiving completed sessions and tasks