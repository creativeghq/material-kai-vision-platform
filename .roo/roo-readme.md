
# Roo Commander System: Complete User Guide

**Version:** 1.0  
**Last Updated:** August 30, 2025  
**Architecture:** `.roo` + `.ruru` + `.roopm` (Three-Tier System)

---

## 🎯 What is Roo Commander?

Roo Commander is an advanced AI development coordination system that provides structured workflows, persistent memory, session tracking, and intelligent task delegation. It operates through specialized AI modes that coordinate development tasks, manage project state, and maintain comprehensive documentation.

---

## 📁 System Architecture Overview

### **Three-Tier Directory Structure**

```
.roo/                    # 🔧 Core Rules & Configuration
├── rules/               # Workspace-wide behavioral rules
└── rules-*/             # Mode-specific rules

.ruru/                   # 🏗️ Core Roo System 
├── modes/               # AI mode definitions and knowledge bases
├── templates/           # Document templates (TOML+Markdown)
├── workflows/           # Reusable workflow templates  
├── processes/           # Standard Operating Procedures (SOPs)
└── scripts/             # Build and automation scripts

.roopm/                  # 📊 Project Management (NEW)
├── sessions/            # Session logs and artifacts
├── tasks/               # MDTM task files
├── planning/            # Project planning documents
├── context/             # Project-specific context data
├── decisions/           # Architectural Decision Records (ADRs)
├── docs/                # Generated documentation
└── state/               # Project state and memory data
```

---

## 🧠 Core System Components

### **1. AI Modes System**

**Location:** [`.ruru/modes/`](.ruru/modes/)

Roo Commander operates through **80+ specialized AI modes**, each with specific expertise:

#### **Coordinator Modes** (High-Level Management)
- **🚜 Prime Coordinator** (`prime-coordinator`) - Power-user interface for direct task management
- **👑 Roo Commander** (`roo-commander`) - Highest-level project coordinator
- **🏗️ Orchestrator** (`orchestrator`) - Complex multi-step project management

#### **Lead Modes** (Domain Leadership) 
- **🖥️ Frontend Lead** (`lead-frontend`) - Frontend development coordination
- **⚙️ Backend Lead** (`lead-backend`) - Server-side development coordination
- **🗄️ Database Lead** (`lead-db`) - Data persistence management
- **🚀 DevOps Lead** (`lead-devops`) - Infrastructure and deployment

#### **Framework Specialists**
- **🚀 Next.js Developer** (`framework-nextjs`) - React/Next.js applications
- **⚛️ React Specialist** (`dev-react`) - React component development
- **🐘 PHP/Laravel Developer** (`framework-laravel`) - PHP web applications
- **🐍 Django Developer** (`framework-django`) - Python web frameworks

#### **Cloud & Database Specialists**
- **🦸 Supabase Developer** (`baas-supabase`) - Supabase integration and management
- **🔥 Firebase Developer** (`baas-firebase`) - Firebase services
- **☁️ AWS Architect** (`cloud-aws`) - Amazon Web Services
- **🐘 PostgreSQL Specialist** (`data-postgres`) - Database design and optimization

#### **Testing & Quality**
- **🎭 E2E Testing Specialist** (`test-e2e`) - End-to-end testing
- **🔗 Integration Tester** (`test-integration`) - System integration testing
- **👀 Code Reviewer** (`util-reviewer`) - Code quality assurance

**Mode Structure:**
```
.ruru/modes/[mode-slug]/
├── [mode-slug].mode.md     # Mode definition with TOML metadata
├── kb/                     # Knowledge base articles
├── context/                # Mode-specific context files
└── prompts/                # Specialized prompts
```

### **2. Rules System**

**Location:** [`.roo/rules/`](.roo/rules/) and [`.roo/rules-*/`](.roo/rules-prime-coordinator/)

Rules define how modes behave and interact:

#### **Workspace Rules** (Apply to All Modes)
- **User Preferences** ([`00-user-preferences.md`](.roo/rules/00-user-preferences.md)) - User settings and memory storage
- **TOML+Markdown Format** ([`01-standard-toml-md-format.md`](.roo/rules/01-standard-toml-md-format.md)) - Document structure standard
- **Session Management V7** ([`11-session-management.md`](.roo/rules/11-session-management.md)) - Session tracking workflow
- **MDTM Workflow** ([`04-mdtm-workflow-initiation.md`](.roo/rules/04-mdtm-workflow-initiation.md)) - Task delegation system

#### **Mode-Specific Rules**
- **Prime Coordinator Rules** ([`.roo/rules-prime-coordinator/`](.roo/rules-prime-coordinator/)) - Power-user workflows
- **Commander Rules** ([`.roo/rules-roo-commander/`](.roo/rules-roo-commander/)) - High-level coordination

---

## 💾 Memory & Persistent Storage

### **Primary Memory File**
**Location:** [`.roo/rules/00-user-preferences.md`](.roo/rules/00-user-preferences.md)

This file stores **persistent memory** using TOML format:

```toml
+++
# User Information
user_name = "YourName"
skills = ["react", "typescript", "supabase"]

# Roo Usage Preferences  
[roo_usage_preferences]
preferred_modes = ["framework-nextjs", "baas-supabase"]
verbosity_level = "normal"
preferred_language = "en"
supabase_mcp_first = true    # 🔑 MEMORY: Always use Supabase MCP tools first
mcp_github_install_declined = false
+++
```

### **Memory Creation & Updates**
- **Automatic:** The system reads preferences automatically 
- **Manual Updates:** Edit [`.roo/rules/00-user-preferences.md`](.roo/rules/00-user-preferences.md) to add/modify memory
- **No Commands Required:** Memory is persistent across all interactions

### **Additional Memory Storage**
- **Project Context:** [`.roopm/context/`](.roopm/context/) - Project-specific context data
- **Decision Records:** [`.roopm/decisions/`](.roopm/decisions/) - Architectural decisions  
- **Session Artifacts:** [`.roopm/sessions/*/artifacts/`](.roopm/sessions/) - Rich contextual notes

---

## 📝 Session Management System

### **What are Sessions?**
Sessions provide **structured tracking** of user interactions focused on achieving specific goals. They create comprehensive logs and artifacts for complex work.

### **Session Structure**
```
.roopm/sessions/SESSION-[Goal]-[YYMMDDHHMM]/
├── session_log.md           # 📋 Main session log (TOML+Markdown)
└── artifacts/               # 📁 Rich contextual information
    ├── notes/              # General notes and decisions
    ├── learnings/          # Key insights and discoveries  
    ├── environment/        # Environment setup details
    ├── research/           # Research findings
    ├── features/           # Feature specifications
    ├── context/            # Additional context
    └── docs/               # Generated documentation
```

### **How to Start a Session**

#### **⚠️ Current Bug: Session Prompting**
**Issue:** Prime Coordinator doesn't automatically prompt for sessions due to its "power-user" design philosophy that minimizes questions.
**Workaround:** Use manual session requests (Option 2 below) or switch to `roo-commander` mode for automatic prompting.

#### **Option 1: Coordinator Will Prompt You** 
When using `roo-commander` (NOT `prime-coordinator`), it will automatically ask:

*"Would you like to create a session log for this work?"*
- **"Create log with goal: [Suggested Goal]"** ← Recommended for complex work
- **"Create log (no goal)"** ← Basic tracking
- **"Proceed without log (default)"** ← No session tracking

#### **Option 2: Manual Request** (Works with All Modes)
Simply ask: *"Create a session for [your goal]"*

#### **Option 3: Switch to Commander Mode**
Request: *"Switch to roo-commander mode"* → Automatic session prompting will work

#### **No Commands Required**
- Sessions are created automatically when requested
- All logging happens in the background
- Artifacts are organized automatically

### **Session Benefits & Project Memory**
- **Traceability:** Complete record of decisions and actions
- **Context Preservation:** Rich artifacts for future reference
- **Continuity:** Resume complex work across multiple interactions
- **Collaboration:** Clear handoffs between different AI specialists
- **🧠 Project Memory:** Sessions serve as **project memory** - engineering decisions are automatically preserved in artifacts

---

## 📂 Artifacts System (Project Memory)

### **What are Artifacts?**
Artifacts are **structured knowledge files** that capture important information discovered or decided during work. They serve as the **project's persistent memory** beyond individual sessions.

### **Artifact Types & Storage Locations**

#### **🧠 Engineering Decisions** 
**Location:** [`.roopm/decisions/`](.roopm/decisions/) (ADRs - Architectural Decision Records)

Store long-term technical decisions:
```markdown
# Example: .roopm/decisions/ADR-001-auth-system-choice.md
+++
id = "ADR-001"
title = "Authentication System Selection"
status = "accepted"
date = "2025-08-30"
+++

# Decision: Use Clerk for Authentication

## Context
We need user authentication for the platform...

## Decision
We will use Clerk authentication system.

## Rationale
- Simplifies implementation
- Handles user management
- Integrates well with our React stack
```

#### **📝 Session Artifacts** (Temporary → Permanent)
**Location:** [`.roopm/sessions/[ID]/artifacts/`](.roopm/sessions/)

**Rich contextual notes created during sessions:**
- **`notes/`** - General decisions and observations
- **`learnings/`** - Technical discoveries and insights
- **`environment/`** - Setup and configuration details
- **`research/`** - Investigation findings
- **`features/`** - Feature specifications and requirements
- **`context/`** - Important project context
- **`docs/`** - Generated documentation

#### **🎯 Project Context** (Long-Term)
**Location:** [`.roopm/context/`](.roopm/context/)

**Persistent project knowledge:**
```markdown
# Example: .roopm/context/auth-system-preferences.md
+++
title = "Authentication System Preferences"
project = "material-kai-vision-platform"
updated = "2025-08-30"
+++

# Project Authentication Standards

## Chosen System: Clerk
- **Rationale:** Simplicity, React integration
- **Implementation:** Use @clerk/nextjs package
- **User Management:** Clerk dashboard
- **Customization:** Custom login flows in /auth/
```

### **Creating Project Memory**

#### **Automatic Artifact Creation**
During sessions, simply mention important discoveries:
```
User: "I found that the optimal batch size for PDF processing is 50 documents"
→ System automatically creates: 
   .roopm/sessions/[ID]/artifacts/learnings/LEARNING-pdf_batch_optimization-[timestamp].md
```

#### **Manual Decision Recording**
Request explicit decision documentation:
```
User: "Document the decision to use PostgreSQL for the main database"
→ System creates:
   .roopm/decisions/ADR-[number]-database-choice.md
```

#### **Project Context Creation**
Establish persistent project preferences:
```
User: "Remember that this project always uses TypeScript for React components"
→ System creates:
   .roopm/context/typescript-standards.md
```

### **Retrieving Project Memory**

#### **Automatic Context Loading**
Modes automatically read relevant context:
```
User: "Add authentication to the user profile page"
→ Mode automatically finds:
   - .roopm/context/auth-system-preferences.md
   - .roopm/decisions/ADR-001-auth-system-choice.md
→ Uses Clerk as the chosen auth system
```

#### **Manual Reference**
Ask for specific context:
```
User: "What authentication system did we decide to use?"
→ Mode searches .roopm/decisions/ and .roopm/context/
→ Returns: "Based on ADR-001, you chose Clerk authentication"
```

#### **Session Artifact Reference**
```
User: "Find the learning about PDF batch processing from our last session"
→ Mode searches .roopm/sessions/*/artifacts/learnings/
→ Returns: "Found LEARNING-pdf_batch_optimization.md: optimal batch size is 50 documents"
```

### **Artifact Lifecycle Management**

#### **Session → Permanent Migration**
Important session artifacts can become permanent:
```
# During session: discovers important pattern
→ Creates: .roopm/sessions/[ID]/artifacts/learnings/LEARNING-react_optimization.md

# Later: promote to permanent context
→ Move to: .roopm/context/react-optimization-standards.md
→ Reference in: .roopm/decisions/ADR-[N]-react-patterns.md
```

#### **Cross-Session References**
Artifacts automatically link related content:
```markdown
# In session_log.md TOML frontmatter:
related_artifacts = [
  "artifacts/notes/NOTE-database_design-20250830.md",
  "artifacts/learnings/LEARNING-api_performance-20250830.md"
]

# References link to decisions:
"See ADR-003 for database choice rationale"
```

---

## 🔄 MDTM (Markdown-Driven Task Management)

### **What is MDTM?**
MDTM is Roo's structured task delegation system using **TOML+Markdown** files to track complex, multi-step work.

### **MDTM Structure**
```
.roopm/tasks/[CATEGORY]/TASK-[MODE]-[TIMESTAMP].md
```

**Example:** [`.roopm/tasks/FEATURE_Authentication/TASK-REACT-20250830-1455.md`](.roopm/tasks/)

### **MDTM File Format**
```markdown
+++
id = "TASK-REACT-20250830-1455"
title = "Implement User Authentication"
status = "🟡 To Do"
type = "🌟 Feature"
assigned_to = "dev-react"
coordinator = "prime-coordinator"
tags = ["authentication", "react", "frontend"]
+++

# Task Description
Implement complete user authentication system...

## Acceptance Criteria
- [ ] Login form with validation
- [ ] Signup functionality  
- [ ] Session management
- [ ] Route protection

## Checklist
- [ ] 📋 Create login component
- [ ] 🔒 Implement authentication logic
- [ ] 🛡️ Add route guards
- [ ] ✅ Write tests
```

### **When MDTM is Used**
- Complex multi-step tasks
- High-risk changes (core logic, security)
- Tasks requiring detailed progress tracking
- Clear handoffs between specialists

### **How MDTM Works**
1. **Coordinator** creates MDTM task file in [`.roopm/tasks/`](.roopm/tasks/)
2. **Specialist** receives task, reads file, executes work
3. **Progress Tracking:** Specialist updates checkboxes (`- [ ]` → `- [✅]`)
4. **Status Updates:** Task status changes (`🟡 To Do` → `🟢 Done`)
5. **Completion:** Specialist reports back to coordinator

---

## 🔧 Mode Operation & Delegation

### **How Modes Work**

#### **Mode Activation**
- **Automatic:** Based on request analysis (React → `dev-react`, Database → `data-specialist`)
- **Manual:** Request specific mode: *"Switch to React specialist"* or *"Use Next.js developer"*

#### **Mode Communication**
- **Delegation:** Higher-level modes delegate to specialists via `new_task`
- **Reporting:** Specialists report completion via `attempt_completion`
- **Escalation:** Complex issues get escalated to lead/coordinator modes

### **Calling Sections & Artifacts**

#### **Creating Session Artifacts**
Session artifacts are created automatically during sessions:

```markdown
# In session, mention needing to save important info:
"I discovered the API rate limit is 100 requests/minute"

# System automatically creates:
.roopm/sessions/SESSION-[ID]/artifacts/learnings/LEARNING-api_rate_limit-[timestamp].md
```

#### **Referencing Artifacts**
- **In Chat:** *"Check the learning about API limits from this session"*
- **File Path:** Reference directly: `artifacts/learnings/LEARNING-api_rate_limit-*.md`
- **Session Log:** All artifacts are linked in the session's `related_artifacts` array

### **Mode Selection Guide**

#### **For Development Tasks:**
- **Frontend:** → `lead-frontend` → `dev-react`/`framework-nextjs`
- **Backend:** → `lead-backend` → `dev-api`/`framework-django`
- **Database:** → `lead-db` → `data-specialist`/`baas-supabase`
- **Full-Stack:** → `orchestrator` → multiple specialists

#### **For Problem-Solving:**
- **Bugs:** → `dev-fixer` or `debug`
- **Architecture:** → `core-architect` or `lead-*`
- **Complex Issues:** → `dev-solver`

#### **For Quality & Testing:**
- **Code Review:** → `util-reviewer` 
- **Testing:** → `test-e2e`/`test-integration`
- **Second Opinion:** → `util-second-opinion`

---

## 🗂️ .roopm Project Management Guide

### **Directory Purposes**

#### **📋 Sessions** ([`.roopm/sessions/`](.roopm/sessions/))
- **Purpose:** Track user interactions and maintain context
- **Contents:** Session logs and rich artifacts
- **Auto-Created:** When user opts for session tracking
- **Structure:** `SESSION-[Goal]-[YYMMDDHHMM]/`

#### **📌 Tasks** ([`.roopm/tasks/`](.roopm/tasks/))
- **Purpose:** MDTM task files for complex work delegation  
- **Contents:** Structured task definitions with checklists
- **Auto-Created:** When coordinators delegate complex tasks
- **Organization:** By category (`FEATURE_*/`, `BUG_*/`, `REFACTOR_*/`)

#### **📈 Planning** ([`.roopm/planning/`](.roopm/planning/))
- **Purpose:** High-level project planning and strategy
- **Contents:** Project roadmaps, requirements, specifications
- **Manual/Auto:** Created by architect/manager modes or user request

#### **🧠 Context** ([`.roopm/context/`](.roopm/context/))
- **Purpose:** Project-specific contextual information
- **Contents:** Important project knowledge, technical constraints
- **Created:** When modes need to store project-specific context

#### **🏛️ Decisions** ([`.roopm/decisions/`](.roopm/decisions/))
- **Purpose:** Architectural Decision Records (ADRs)
- **Contents:** Important technical decisions with rationale
- **Created:** When significant architectural choices are made

#### **📚 Docs** ([`.roopm/docs/`](.roopm/docs/))
- **Purpose:** Project documentation and AI-generated content
- **Contents:** API docs, user guides, analysis reports
- **Auto-Created:** By documentation modes or research activities

#### **💾 State** ([`.roopm/state/`](.roopm/state/))
- **Purpose:** Project state tracking and coordination data
- **Contents:** Build states, deployment status, progress tracking
- **Managed:** By DevOps and project management modes

### **User Interaction with .roopm**

#### **Viewing Project Management Data**
```bash
# Check current sessions
ls .roopm/sessions/

# View active tasks  
ls .roopm/tasks/

# Review recent decisions
ls .roopm/decisions/
```

#### **Manual Creation** (Optional)
Most `.roopm` content is created automatically, but you can manually create:

```bash
# Create planning document
# (Use a mode like architect or manager-project)
"Create a project roadmap for the authentication system"

# Request a decision record
"Document the decision to use Supabase for authentication"

# Manual session
"Start a session for refactoring the API layer"
```

---

## 🎛️ How to Use Roo Commander

### **Basic Interaction Patterns**

#### **1. Simple Development Tasks**
```
User: "Add a login form to the React app"
→ System selects: dev-react
→ Direct delegation (no MDTM needed)
→ Specialist implements and reports back
```

#### **2. Complex Features (MDTM)**
```
User: "Build a complete user management system"
→ roo-commander analyzes complexity
→ Creates MDTM task file in .roopm/tasks/
→ Delegates to lead-frontend
→ Lead breaks down into sub-tasks
→ Multiple specialists work on components
→ Progress tracked in MDTM file
```

#### **3. Research & Analysis**
```
User: "Research best practices for React state management"
→ agent-research mode activated
→ Uses MCP tools for external research
→ Creates artifacts in .roopm/sessions/[ID]/artifacts/research/
→ Provides comprehensive summary
```

### **Session Management Commands**

#### **Starting Sessions**
- **Request:** *"Create a session for implementing the dashboard"*
- **Response:** System will prompt for confirmation and goal refinement

#### **Continuing Sessions** 
- **Command:** *"Continue session SESSION-Dashboard-2508301455"*
- **Automatic:** Recent sessions can be resumed automatically

#### **Viewing Session Data**
```bash
# List all sessions
ls .roopm/sessions/

# View specific session
cat .roopm/sessions/SESSION-Dashboard-2508301455/session_log.md

# Check session artifacts
ls .roopm/sessions/SESSION-Dashboard-2508301455/artifacts/
```

### **Memory Management**

#### **Viewing Current Memory**
Check [`.roo/rules/00-user-preferences.md`](.roo/rules/00-user-preferences.md):

```toml
[roo_usage_preferences]
preferred_modes = ["framework-nextjs", "baas-supabase"]
supabase_mcp_first = true  # Persistent memory rule
```

#### **Adding Memory Rules**
Request: *"Remember that we always use TypeScript for React components"*
→ System adds this preference to user-preferences.md

#### **MCP Tool Preferences**
Current memory rules:
- **`supabase_mcp_first = true`** - Always use Supabase MCP tools before direct database access
- **`mcp_github_install_declined = false`** - GitHub MCP server preference

---

## 🔌 MCP (Model Context Protocol) Integration

### **Connected MCP Servers**

#### **📚 Context7** (`context7`)
- **Purpose:** Retrieve up-to-date library documentation
- **Tools:** `resolve-library-id`, `get-library-docs`
- **Usage:** *"Get React documentation"* → Uses Context7 automatically

#### **🦸 Supabase** (`supabase`)
- **Purpose:** Complete Supabase project management
- **Tools:** `list_projects`, `execute_sql`, `apply_migration`, `get_anon_key`
- **Memory Rule:** When `supabase_mcp_first = true`, always use MCP tools before direct SQL

#### **🧬 Repomix** (`repomix`)
- **Purpose:** Package repositories for LLM analysis
- **Tools:** `pack_codebase`, `pack_remote_repository`, `grep_repomix_output`
- **Delegation:** Automatically routed to `spec-repomix` mode

### **MCP Tool Usage**
The `use_mcp_tool` is available system-wide:

```markdown
# Example: Get Supabase project info
Mode uses: use_mcp_tool 
- server_name: "supabase"
- tool_name: "list_projects"  
- arguments: {}
```

**Memory Integration:** The `supabase_mcp_first = true` preference ensures Supabase modes automatically use MCP tools instead of manual SQL.

---

## 📄 Document Templates & Standards

### **TOML+Markdown Format**
**Location:** [`.ruru/templates/toml-md/`](.ruru/templates/toml-md/)

All structured documents use TOML frontmatter + Markdown content:

```markdown
+++
# TOML metadata block
id = "unique-identifier"
title = "Document Title"
status = "active"
tags = ["keyword1", "keyword2"]
+++

# Markdown Content
Your document content here...
```

### **Available Templates**
- **MDTM Tasks:** [`01_mdtm_feature.md`](.ruru/templates/toml-md/01_mdtm_feature.md), [`02_mdtm_bug.md`](.ruru/templates/toml-md/02_mdtm_bug.md)
- **ADRs:** [`07_adr.md`](.ruru/templates/toml-md/07_adr.md)
- **Session Logs:** [`19_mdtm_session.md`](.ruru/templates/toml-md/19_mdtm_session.md)
- **Rules:** [`16_ai_rule.README.md`](.ruru/templates/toml-md/16_ai_rule.README.md)

---

## 🛠️ Build & Automation System

### **Build Scripts**
**Location:** [`.ruru/scripts/`](.ruru/scripts/)

#### **Key Build Scripts**
- **[`build_roomodes.js`](.ruru/scripts/build_roomodes.js)** - Generates mode configuration files
- **[`build_mode_summary.js`](.ruru/scripts/build_mode_summary.js)** - Creates mode selection guides
- **[`run_collection_builds.js`](.ruru/scripts/run_collection_builds.js)** - Batch processing

#### **Running Builds**
```bash
# Regenerate mode configurations (after editing modes)
node .ruru/scripts/build_roomodes.js

# Update mode selection data
node .ruru/scripts/build_mode_summary.js
```

#### **Auto-Generated Files**
- **`.roomodes*`** files are auto-generated - **DO NOT EDIT DIRECTLY**
- Always use build scripts instead of manual editing
- System will warn you if you try to edit generated files

---

## 🚀 Common Workflows & Use Cases

### **1. Feature Development**
```
1. User: "Build a user dashboard with charts"
2. roo-commander creates MDTM task
3. Delegates to lead-frontend  
4. Lead-frontend breaks into sub-tasks:
   - UI components (dev-react)
   - Chart integration (design-d3)
   - API integration (dev-api)
5. Progress tracked in .roopm/tasks/FEATURE_Dashboard/
6. Session artifacts in .roopm/sessions/ (if session active)
```

### **2. Bug Investigation**
```
1. User: "The login form isn't working properly" 
2. System routes to debug mode
3. Debug mode investigates, creates artifacts:
   - .roopm/sessions/[ID]/artifacts/notes/NOTE-login_issue_analysis.md
4. Once identified, delegates to appropriate specialist
5. All investigation details preserved in session
```

### **3. Architecture Planning**
```
1. User: "Plan the database schema for our e-commerce system"
2. Routes to core-architect or lead-db
3. Creates planning documents in .roopm/planning/
4. Generates ADRs in .roopm/decisions/
5. All decisions and rationale documented for future reference
```

### **4. Research & Documentation**
```
1. User: "Research React 18 concurrent features"
2. agent-research mode activated
3. Uses MCP tools for external research
4. Creates comprehensive artifacts:
   - .roopm/sessions/[ID]/artifacts/research/RESEARCH-react18_concurrent.md
5. Generates documentation in .roopm/docs/
```

---

## 🏗️ Workflows & Processes System

### **Reusable Workflows**
**Location:** [`.ruru/workflows/`](.ruru/workflows/)

Pre-defined, reusable procedures for common tasks:
- Setup workflows (project initialization)
- Deployment workflows  
- Testing workflows
- Code review workflows

### **Standard Operating Procedures**
**Location:** [`.ruru/processes/`](.ruru/processes/)

Detailed SOPs for complex procedures:
- Security audit procedures
- Performance optimization processes
- Database migration procedures

### **Creating New Workflows**
Request: *"Create a workflow for setting up new React projects"*
→ System creates structured workflow in [`.ruru/workflows/`](.ruru/workflows/)

---

## 📊 Monitoring & Tracking

### **Progress Tracking**
- **MDTM Tasks:** Real-time checkbox updates in task files
- **Session Logs:** Chronological event logging
- **Status Fields:** TOML metadata tracking (To Do → In Progress → Done)

### **Viewing Progress**
```bash
# Check active tasks
find .roopm/tasks/ -name "*.md" -exec grep -l "🟡 To Do\|🔄 In Progress" {} \;

# View session activity
ls -la .roopm/sessions/

# Check recent artifacts
find .roopm/sessions/ -name "*.md" -newer .roopm/sessions/*/session_log.md
```

### **System Health**
- **Generated Files:** Use `node .ruru/scripts/build_roomodes.js` to regenerate if needed
- **Broken References:** System validates all paths are workspace-relative
- **Consistency:** TOML+Markdown format ensures structured data integrity

---

## 🔍 Advanced Features

### **Context Management**
- **Smart Context:** Modes automatically load relevant project context
- **Cross-Reference:** Sessions link to related tasks via `related_tasks` arrays
- **Artifact Linking:** Session logs reference all created artifacts

### **MCP Integration Benefits**
- **Live Documentation:** Always current library docs via Context7
- **Database Management:** Direct Supabase project management
- **Code Analysis:** Repository packaging for LLM understanding

### **Quality Assurance**
- **Automatic Logging:** All significant events logged in sessions
- **Confirmation Workflows:** Safety checks for risky operations  
- **Validation:** Templates ensure proper document structure
- **Backup:** Project-specific data separated from core system

---

## 🚨 Important Notes & Best Practices

### **Data Safety**
- **Generated Files:** Never edit `.roomodes*` files directly
- **Backups:** Core system (`.roo/`, `.ruru/`) separate from project data (`.roopm/`)
- **Confirmation:** System asks for confirmation on risky operations

### **Performance Optimization**
- **Context Window:** Complex tasks broken into manageable chunks
- **Delegation:** Work distributed to appropriate specialists
- **Artifact Storage:** Session-aware file organization prevents clutter

### **Troubleshooting**
```bash
# Regenerate mode configurations
node .ruru/scripts/build_roomodes.js

# Check system integrity
ls .roo/rules/ .ruru/modes/ .roopm/

# Validate templates
ls .ruru/templates/toml-md/
```

---

## 📞 Getting Help

### **System Information**
- **Architecture:** This document ([`.roo/roo-readme.md`](.roo/roo-readme.md))
-
- **Project Status:** [`.roopm/README.md`](.roopm/README.md)
- **Templates:** [`.ruru/templates/toml-md/README.md`](.ruru/templates/toml-md/README.md)

### **Common Requests**
- **"Start a session for [goal]"** - Begin tracked work
- **"Create a task for [complex work]"** - MDTM delegation  
- **"Switch to [mode] mode"** - Manual mode selection
- **"Remember that [preference]"** - Add to persistent memory
- **"Continue session [ID]"** - Resume previous work
- **"Document the decision to use [technology]"** - Create ADR
- **"What did we decide about [topic]?"** - Query project memory

### **Mode Recommendations**
- **Complex Projects:** Start with `roo-commander` or `orchestrator`
- **Quick Tasks:** Use `prime-coordinator` for direct management  
- **Specific Domains:** Request appropriate specialist directly
- **Research:** Use `agent-research` for investigation work
- **Session Tracking:** Use `roo-commander` for automatic session prompting

---

## 🐛 Known Issues & Solutions

### **Session Prompting Bug**
**Issue:** Prime Coordinator doesn't automatically prompt for session creation
**Root Cause:** Prime Coordinator's "power-user" design philosophy minimizes questions
**Solutions:**
1. **Switch to roo-commander:** `"Switch to roo-commander mode"` - Will automatically prompt for sessions
2. **Manual request:** `"Create a session for [goal]"` - Works with any mode
3. **Direct session creation:** `"Start session tracking for this work"` - Explicit request

### **Bug Fix in Progress**
The session prompting should work automatically for complex tasks, but Prime Coordinator's rules override this behavior. The system needs a configuration update to balance power-user efficiency with session tracking benefits.

---

*The Roo Commander system provides comprehensive project management, intelligent delegation, persistent memory, and structured workflows. All components work together to create a powerful development coordination environment that scales from simple tasks to complex multi-stage projects.*
- **Project Status:** [`.roopm/README.md`](.roopm/README.md)
- **Templates:** [`.ruru/templates/toml-md/README.md`](.ruru/templates/toml-md/README.md)

### **Common Requests**
- **"Start a session for [goal]"** - Begin tracked work
- **"Create a task for [complex work]"** - MDTM delegation  
- **"Switch to [mode] mode"** - Manual mode selection
- **"Remember that [preference]"** - Add to persistent memory
- **"Continue session [ID]"** - Resume previous work
- **"Document the decision to use [technology]"** - Create ADR
- **"What did we decide about [topic]?"** - Query project memory

### **Mode Recommendations**
- **Complex Projects:** Start with `roo-commander` or `orchestrator`
- **Quick Tasks:** Use `prime-coordinator` for direct management  
- **Specific Domains:** Request appropriate specialist directly
- **Research:** Use `agent-research` for investigation work
- **Session Tracking:** Use `roo-commander` for automatic session prompting

---

## 🐛 Known Issues & Solutions

### **Session Prompting Bug**
**Issue:** Prime Coordinator doesn't automatically prompt for session creation
**Root Cause:** Prime Coordinator's "power-user" design philosophy minimizes questions per Rule `01-operational-principles.md` point 5: "Ask clarifying questions only if instructions are critically ambiguous"
**Solutions:**
1. **Switch to roo-commander:** `"Switch to roo-commander mode"` - Will automatically prompt for sessions
2. **Manual request:** `"Create a session for [goal]"` - Works with any mode
3. **Direct session creation:** `"Start session tracking for this work"` - Explicit request

### **Bug Fix Status**  
This is a design conflict between Prime Coordinator's efficiency-focused approach and comprehensive session tracking. The session prompting works correctly in `roo-commander` mode but is suppressed in `prime-coordinator` to maintain its streamlined workflow philosophy.