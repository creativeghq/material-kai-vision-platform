+++
# --- Basic Metadata ---
id = "ADR-REGISTRY"
title = "Architectural Decision Records Registry"
context_type = "registry"
scope = "Central registry of all architectural decisions for the material vision platform"
target_audience = ["all", "roo-commander", "architect", "lead-*"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-19"
tags = ["adr", "architecture", "registry", "decisions", "governance"]
related_context = [
    ".ruru/docs/adrs/",
    ".ruru/templates/toml-md/07_adr.md",
    ".roo/rules/01-standard-toml-md-format.md"
]
template_schema_doc = ".ruru/templates/toml-md/README.md"
relevance = "Critical: Central index for all architectural decisions"
+++

# Architectural Decision Records (ADR) Registry

This directory contains all Architectural Decision Records (ADRs) for the material vision platform. ADRs document important architectural decisions, their context, consequences, and implementation details.

## Purpose

ADRs serve to:
- **Document Decision Context**: Capture the circumstances and constraints that led to architectural decisions
- **Record Rationale**: Explain why specific approaches were chosen over alternatives
- **Track Consequences**: Document the positive and negative impacts of decisions
- **Enable Future Reference**: Provide context for future architectural changes
- **Facilitate Onboarding**: Help new team members understand system design choices

## ADR Format

All ADRs use the TOML+Markdown format with the following structure:
- **TOML Frontmatter**: Structured metadata for machine processing
- **Markdown Body**: Human-readable decision documentation
- **Standard Sections**: Status, Context, Decision, Consequences, Implementation

## Active ADRs

### Infrastructure & Configuration
| ID | Title | Status | Date | Impact |
|----|-------|--------|------|--------|
| [ADR-001](./ADR-001-api-configuration-architecture.md) | API Configuration Architecture Standardization | Accepted | 2025-07-19 | Critical |
| [ADR-002](./ADR-002-singleton-pattern-standardization.md) | Singleton Pattern Standardization | Accepted | 2025-07-19 | High |

### Service Architecture
| ID | Title | Status | Date | Impact |
|----|-------|--------|------|--------|
| ADR-003 | Service Layer Pattern Standardization | Proposed | TBD | High |
| ADR-004 | Factory Pattern Unification | Proposed | TBD | Medium |

### Data Management
| ID | Title | Status | Date | Impact |
|----|-------|--------|------|--------|
| ADR-005 | Configuration Schema Consolidation | Proposed | TBD | High |
| ADR-006 | Data Access Pattern Standardization | Proposed | TBD | Medium |

## ADR Lifecycle

### Status Values
- **Proposed**: Decision under consideration
- **Accepted**: Decision approved and being implemented
- **Implemented**: Decision fully implemented
- **Superseded**: Decision replaced by newer ADR
- **Deprecated**: Decision no longer applicable

### Decision Process
1. **Identify Need**: Architectural decision required
2. **Create ADR**: Document using standard template
3. **Review**: Technical review by relevant stakeholders
4. **Decide**: Accept, reject, or request modifications
5. **Implement**: Execute the decision
6. **Monitor**: Track consequences and effectiveness

## Usage Guidelines

### For Roo Commander
- Reference ADRs when making architectural decisions
- Ensure new decisions align with existing ADRs
- Create new ADRs for significant architectural changes
- Update ADR status as implementation progresses

### For Development Teams
- Consult relevant ADRs before making design decisions
- Follow patterns established in accepted ADRs
- Propose new ADRs for architectural changes
- Reference ADR IDs in code comments and documentation

### For Code Reviews
- Verify changes align with relevant ADRs
- Check for architectural consistency
- Suggest ADR updates when patterns evolve
- Ensure new patterns are documented

## Integration with Roo Commander

This registry is integrated with the Roo Commander system through:

### TOML Metadata
Each ADR includes structured metadata that enables:
- Automated discovery and indexing
- Impact assessment and dependency tracking
- Status monitoring and reporting
- Integration with MDTM workflows

### Related Context Links
ADRs reference:
- Implementation files and directories
- Related ADRs and dependencies
- Relevant rules and standards
- Template schemas and examples

### Workflow Integration
- **MDTM Tasks**: Reference relevant ADRs in task planning
- **Session Logging**: Log ADR creation and updates
- **Mode Coordination**: Share ADR context across specialist modes
- **Decision Tracking**: Link decisions to specific ADRs

## Templates and Standards

### Creating New ADRs
1. Use the ADR template: `.ruru/templates/toml-md/07_adr.md`
2. Follow TOML+MD format requirements
3. Include all required metadata fields
4. Use consistent numbering (ADR-XXX)
5. Update this registry with new entries

### Naming Convention
- File: `ADR-XXX-brief-description.md`
- ID: `ADR-XXX-BRIEF-DESCRIPTION`
- Title: `ADR-XXX: Descriptive Title`

### Required Sections
- **Status**: Current decision status
- **Context**: Background and constraints
- **Decision**: What was decided and why
- **Consequences**: Positive and negative impacts
- **Implementation**: How the decision will be executed

## Maintenance

### Regular Reviews
- Quarterly review of ADR status and relevance
- Update superseded or deprecated ADRs
- Assess implementation progress
- Identify gaps in architectural documentation

### Registry Updates
- Add new ADRs to the active list
- Update status changes
- Maintain cross-references
- Ensure metadata consistency

## References

- [ADR Template](.ruru/templates/toml-md/07_adr.md)
- [TOML+MD Format Standard](.roo/rules/01-standard-toml-md-format.md)
- [Architecture Documentation Guidelines](.ruru/docs/standards/)
- [Roo Commander Integration Guide](.ruru/modes/roo-commander/)

---

**Last Updated**: 2025-07-19  
**Maintained By**: Roo Commander System  
**Review Cycle**: Quarterly