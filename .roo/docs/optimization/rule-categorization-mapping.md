+++
id = "RULE-CATEGORIZATION-MAPPING-V1"
title = "Rule Categorization Mapping for Conditional Loading"
context_type = "documentation"
scope = "Complete mapping of existing rules to workspace complexity levels for token optimization"
target_audience = ["system-implementers", "roo-commander", "prime-coordinator"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-03"
tags = ["optimization", "rules", "categorization", "conditional-loading", "token-reduction", "mapping"]
related_context = [
    ".roo/rules/12-workspace-complexity-detection.md",
    ".roo/rules/13-conditional-rule-loading.md",
    ".ruru/docs/optimization/token-optimization-analysis.md"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Provides the detailed mapping for implementing conditional rule loading"
+++

# Rule Categorization Mapping for Conditional Loading

## Overview

This document provides the comprehensive mapping of all existing rules in the `.roo/` directory to their appropriate workspace complexity levels. This mapping is used by the conditional rule loading system to achieve 70-80% token reduction for minimal workspaces while maintaining full functionality for enterprise environments.

## Complexity Level Definitions

- **Level 0 (Minimal):** No `.ruru/` directory - Basic project files only (~1,500 tokens)
- **Level 1 (Basic):** `.ruru/` exists but minimal structure (~3,000 tokens)  
- **Level 2 (Standard):** Full `.ruru/` structure with modes, templates, docs (~5,000 tokens)
- **Level 3 (Enterprise):** Complete infrastructure including sessions, KB, workflows (current load)

## Rule Categorization by Complexity Level

### Level 0 - Minimal Workspace (Core Essentials - 9 Rules)

**Universal Core Rules:**
- `.roo/rules/00-user-preferences.md` - User configuration and preferences
- `.roo/rules/01-standard-toml-md-format.md` - Basic document format standards
- `.roo/rules/03-standard-tool-use-xml-syntax.md` - Tool invocation syntax
- `.roo/rules/05-os-aware-commands.md` - OS-specific command generation
- `.roo/rules/12-workspace-complexity-detection.md` - Workspace detection logic
- `.roo/rules/13-conditional-rule-loading.md` - Conditional loading mechanism

**Roo Commander Essentials:**
- `.roo/rules-roo-commander/01-operational-principles.md` - Core coordination principles
- `.roo/rules-roo-commander/03-delegation-simplified.md` - Basic task delegation
- `.roo/rules-roo-commander/05-error-handling-rule.md` - Basic error handling

**Rationale:** Provides minimal coordination, tool use, and error handling capabilities for basic project work without Roo infrastructure.

### Level 1 - Basic Roo Workspace (Level 0 + 7 Additional Rules)

**Additional Workflow Rules:**
- `.roo/rules/06-iterative-execution-policy.md` - Task iteration and chunking
- `.roo/rules-roo-commander/02-initialization-workflow-rule.md` - User interaction workflows
- `.roo/rules-roo-commander/06-documentation-adr-simplified.md` - Basic documentation oversight
- `.roo/rules-roo-commander/10-meta-discussion-tool-output-handling.md` - Safe tool discussion
- `.roo/rules-roo-commander/12-abstraction-principle.md` - Rule organization principles
- `.roo/rules-roo-commander/13-path-relativity-guideline.md` - Path consistency guidelines
- `.roo/rules-roo-commander/99-kb-lookup-rule.md` - Knowledge base access triggers

**Rationale:** Adds basic workflow management, documentation capabilities, and safe interaction patterns for workspaces with minimal Roo infrastructure.

### Level 2 - Standard Roo Workspace (Level 1 + 4 Core + Stack-Specific Rules)

**Additional Core Rules:**
- `.roo/rules/04-mdtm-workflow-initiation.md` - Full task management system
- `.roo/rules/10-vertex-mcp-usage-guideline.md` - MCP tool usage standards
- `.roo/rules-roo-commander/03b-complex-delegation-planning.md` - Advanced delegation planning
- `.roo/rules-roo-commander/09-repomix-delegation-guideline.md` - Specialized tool delegation

**Stack-Specific Rules (Selected Based on Stack Profile):**

*Frontend Development:*
- `.roo/rules-dev-react/` - React development rules (if React detected)
- `.roo/rules-framework-nextjs/` - Next.js framework rules (if Next.js detected)
- `.roo/rules-framework-vue/` - Vue.js framework rules (if Vue detected)
- `.roo/rules-framework-angular/` - Angular framework rules (if Angular detected)
- `.roo/rules-design-tailwind/` - Tailwind CSS rules (if Tailwind detected)
- `.roo/rules-design-mui/` - Material UI rules (if MUI detected)

*Backend Development:*
- `.roo/rules-dev-python/` - Python development rules (if Python detected)
- `.roo/rules-framework-django/` - Django framework rules (if Django detected)
- `.roo/rules-framework-flask/` - Flask framework rules (if Flask detected)
- `.roo/rules-dev-java/` - Java development rules (if Java detected)
- `.roo/rules-framework-spring/` - Spring framework rules (if Spring detected)
- `.roo/rules-dev-golang/` - Go development rules (if Go detected)

*Database & Data:*
- `.roo/rules-data-specialist/` - General database rules (if databases detected)
- `.roo/rules-data-mongo/` - MongoDB rules (if MongoDB detected)
- `.roo/rules-data-mysql/` - MySQL rules (if MySQL detected)
- `.roo/rules-baas-supabase/` - Supabase rules (if Supabase detected)
- `.roo/rules-baas-firebase/` - Firebase rules (if Firebase detected)

**Rationale:** Provides full task management and delegation capabilities plus technology-specific expertise based on detected stack components.

### Level 3 - Enterprise Roo Workspace (All Rules Loaded)

**Additional Session Management:**
- `.roo/rules/11-session-management.md` - Complete session workflow
- `.roo/rules-roo-commander/05-session-intent-handling.md` - Session intent recognition
- `.roo/rules-roo-commander/11-session-management-impl.md` - Session implementation

**All Specialist Mode Rules:**

*Agent Modes:*
- `.roo/rules-agent-context-condenser/` - Context summarization
- `.roo/rules-agent-context-discovery/` - Workspace exploration
- `.roo/rules-agent-context-resolver/` - Documentation analysis
- `.roo/rules-agent-file-repair/` - File corruption repair
- `.roo/rules-agent-mcp-manager/` - MCP server management
- `.roo/rules-agent-mode-manager/` - Mode management
- `.roo/rules-agent-research/` - Research and information gathering
- `.roo/rules-agent-session-summarizer/` - Session summarization

*Authentication Specialists:*
- `.roo/rules-auth-clerk/` - Clerk authentication
- `.roo/rules-auth-firebase/` - Firebase authentication
- `.roo/rules-auth-supabase/` - Supabase authentication

*Cloud Platform Specialists:*
- `.roo/rules-cloud-aws/` - AWS architecture and services
- `.roo/rules-cloud-azure/` - Azure architecture and services
- `.roo/rules-cloud-gcp/` - Google Cloud Platform services

*CMS Specialists:*
- `.roo/rules-cms-directus/` - Directus CMS
- `.roo/rules-cms-wordpress/` - WordPress development

*Design & UI Specialists:*
- `.roo/rules-design-animejs/` - Animation library
- `.roo/rules-design-antd/` - Ant Design components
- `.roo/rules-design-bootstrap/` - Bootstrap framework
- `.roo/rules-design-d3/` - D3.js data visualization
- `.roo/rules-design-diagramer/` - Diagram creation
- `.roo/rules-design-one-shot/` - Rapid web design
- `.roo/rules-design-shadcn/` - Shadcn UI components
- `.roo/rules-design-threejs/` - Three.js 3D graphics
- `.roo/rules-design-ui/` - General UI design

*Development Specialists:*
- `.roo/rules-dev-api/` - API development
- `.roo/rules-dev-core-web/` - Core web development
- `.roo/rules-dev-eslint/` - Code linting and quality
- `.roo/rules-dev-fixer/` - Bug fixing
- `.roo/rules-dev-git/` - Git version control
- `.roo/rules-dev-kotlin/` - Kotlin development
- `.roo/rules-dev-ruby/` - Ruby development
- `.roo/rules-dev-rust/` - Rust development
- `.roo/rules-dev-solidity/` - Blockchain development
- `.roo/rules-dev-solver/` - Complex problem solving

*Edge Computing:*
- `.roo/rules-edge-workers/` - Cloudflare Workers

*Infrastructure Specialists:*
- `.roo/rules-infra-compose/` - Docker Compose
- `.roo/rules-infra-specialist/` - General infrastructure

*Lead Coordination Modes:*
- `.roo/rules-lead-backend/` - Backend coordination
- `.roo/rules-lead-db/` - Database coordination
- `.roo/rules-lead-design/` - Design coordination
- `.roo/rules-lead-devops/` - DevOps coordination
- `.roo/rules-lead-frontend/` - Frontend coordination
- `.roo/rules-lead-qa/` - Quality assurance coordination
- `.roo/rules-lead-security/` - Security coordination

*Management Modes:*
- `.roo/rules-manager-onboarding/` - Project onboarding
- `.roo/rules-manager-product/` - Product management
- `.roo/rules-manager-project/` - Project management

*Prime Coordination:*
- `.roo/rules-prime-coordinator/` - High-level coordination
- `.roo/rules-prime-dev/` - Configuration editing
- `.roo/rules-prime-txt/` - Documentation editing

*Specialized Tools:*
- `.roo/rules-spec-bun/` - Bun runtime
- `.roo/rules-spec-crawl4ai/` - Web crawling
- `.roo/rules-spec-firecrawl/` - Advanced web crawling
- `.roo/rules-spec-huggingface/` - AI/ML models
- `.roo/rules-spec-npm/` - NPM package management
- `.roo/rules-spec-openai/` - OpenAI integration
- `.roo/rules-spec-repomix/` - Repository packaging

*Testing Specialists:*
- `.roo/rules-test-e2e/` - End-to-end testing
- `.roo/rules-test-integration/` - Integration testing

*Utility Specialists:*
- `.roo/rules-util-accessibility/` - Accessibility compliance
- `.roo/rules-util-jquery/` - jQuery development
- `.roo/rules-util-junior-dev/` - Junior developer support
- `.roo/rules-util-mode-maintainer/` - Mode maintenance
- `.roo/rules-util-performance/` - Performance optimization
- `.roo/rules-util-refactor/` - Code refactoring
- `.roo/rules-util-reviewer/` - Code review
- `.roo/rules-util-second-opinion/` - Independent evaluation
- `.roo/rules-util-senior-dev/` - Senior development
- `.roo/rules-util-typescript/` - TypeScript development
- `.roo/rules-util-vite/` - Vite build tool
- `.roo/rules-util-workflow-manager/` - Workflow management
- `.roo/rules-util-writer/` - Technical writing

*Advanced Specialists:*
- `.roo/rules-sre-veteran/` - Site reliability engineering
- `.roo/rules-security-specialist/` - Security expertise
- `.roo/rules-performance-specialist/` - Performance engineering
- `.roo/rules-policy-enforcer/` - Governance and compliance

**Rationale:** Provides complete enterprise functionality with all specialist capabilities, session management, and advanced features for complex development environments.

## Implementation Notes

### Stack Detection Logic

For Level 2+ workspaces, additional rules are loaded based on detected technology stack:

1. **File Extension Analysis:** Scan for `.js`, `.ts`, `.py`, `.java`, `.go`, etc.
2. **Package File Analysis:** Check `package.json`, `requirements.txt`, `pom.xml`, `go.mod`
3. **Framework Detection:** Look for framework-specific files and configurations
4. **Database Detection:** Check for database configuration files and connection strings

### Rule Loading Priority

1. **Core Rules:** Always loaded first for the appropriate level
2. **Stack-Specific Rules:** Loaded based on detected technologies
3. **User Preferences:** Override rules based on user-specified preferences
4. **Fallback Rules:** Load conservative rule set if detection fails

### Token Count Estimates

- **Level 0:** ~1,500 tokens (9 rules × ~165 tokens average)
- **Level 1:** ~3,000 tokens (16 rules × ~190 tokens average)
- **Level 2:** ~5,000 tokens (25-30 rules × ~170 tokens average)
- **Level 3:** ~8,000-12,000 tokens (100+ rules × ~80-120 tokens average)

### Performance Considerations

- **Caching:** Rule content should be cached per session to avoid repeated loading
- **Lazy Loading:** Stack-specific rules can be loaded on-demand when technologies are detected
- **Incremental Loading:** Rules can be added during a session if workspace complexity increases

## Validation and Testing

### Test Scenarios

1. **Minimal Project:** Empty directory with basic files
2. **Simple React App:** Basic React project with minimal dependencies
3. **Full-Stack Application:** Complex project with multiple technologies
4. **Enterprise Workspace:** Complete Roo infrastructure with all features

### Success Metrics

- **Token Reduction:** Achieve target reductions for each level
- **Functionality Preservation:** Ensure no loss of required capabilities
- **Performance Impact:** Measure loading time improvements
- **User Experience:** Validate that reduced rule sets don't impact usability

## Future Enhancements

### Dynamic Rule Loading

- **Context-Aware Loading:** Load rules based on current task context
- **Usage Pattern Learning:** Adapt rule loading based on user behavior
- **Intelligent Caching:** Predict and pre-load likely needed rules

### Advanced Optimization

- **Rule Consolidation:** Merge similar rules to reduce redundancy
- **Micro-Rules:** Break large rules into smaller, more targeted components
- **Conditional Sections:** Load only relevant sections of large rules

This categorization system provides the foundation for achieving massive token reductions while maintaining appropriate functionality across different workspace types.