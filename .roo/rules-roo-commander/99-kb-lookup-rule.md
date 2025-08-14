+++
id = "ROO-CMD-RULE-KB-LOOKUP-V2" # Updated ID
title = "Roo Commander: Rule - KB Lookup Trigger"
context_type = "rules"
scope = "Mode-specific knowledge base access conditions"
target_audience = ["roo-commander"]
granularity = "procedure"
status = "active"
last_updated = "2025-04-21" # Assuming today's date
tags = ["rules", "kb-lookup", "knowledge-base", "context", "reference", "roo-commander"]
related_context = [
    ".ruru/modes/roo-commander/kb/",
    ".ruru/modes/roo-commander/kb/README.md",
    # Links to rules that might *trigger* a KB lookup
    "01-operational-principles.md",
    "03-delegation-procedure-rule.md",
    "05-error-handling-rule.md",
    "06-documentation-adr-rule.md",
    "08-workflow-process-creation-rule.md"
    ]
+++

# Rule: KB Lookup Trigger (Workspace Complexity Aware)

This rule defines the specific situations when you **MUST** consult the detailed Knowledge Base (KB) located in `.ruru/modes/roo-commander/kb/`. In most common operational scenarios, the procedures defined in rules `02` through `12` should be sufficient.

**Workspace Complexity Assessment:**

Before any KB lookup, assess the current workspace complexity level (as defined in Rule `12-workspace-complexity-detection.md`):

*   **Level 0-1 (Minimal/Basic):** KB infrastructure may not exist. Prioritize using standard operational rules and graceful degradation.
*   **Level 2-3 (Standard/Enterprise):** Full KB infrastructure available. Use KB as designed for complex procedures.

**Consult the KB When:**

1.  **Explicitly Directed:** Another rule explicitly references a specific KB document for detailed steps or information (e.g., "consult KB `04-delegation-mdtm.md` for detailed steps").
    *   **Optimization:** For Level 0-1 workspaces, attempt to use simplified procedures from standard rules before KB lookup. Only access KB if the standard rule procedure fails or is insufficient.

2.  **Novel/Complex Procedures:** You encounter a task requiring a detailed procedure that is *not* adequately covered by the standard operational rules (`02` through `12`). Examples include:
    *   Executing the detailed steps within the MDTM workflow (delegation rule points here).
    *   Handling complex or unusual error scenarios (error handling rule points here).
    *   Following detailed safety protocols beyond basic checks (safety rule points here).
    *   Understanding the nuanced use of logging tools (`write_to_file` vs `append` vs `insert`) for specific log types (logging rule points here).
    *   **Optimization:** For Level 0-1 workspaces, use simplified fallback procedures when KB is unavailable. For Level 2-3, proceed with full KB consultation.

3.  **Reference Lookups:** You need to access large reference lists or detailed indices, such as:
    *   The full summary of available modes (`kb-available-modes-summary.md`).
    *   The index of standard processes (`10-standard-processes-index.md`).
    *   The index of standard workflows (`11-standard-workflows-index.md`).
    *   **Optimization:** For Level 0-1 workspaces, use basic mode selection from loaded rules instead of comprehensive KB references.

**Procedure for KB Lookup:**

1.  **Workspace Complexity Check:** Determine current workspace complexity level. If Level 0-1 and the KB lookup is for optimization rather than critical functionality, consider using simplified alternatives.

2.  **Identify Target Document:** Determine the specific KB document needed based on the directing rule or the nature of the complex/novel task. Use the KB README (`.ruru/modes/roo-commander/kb/README.md`) for guidance if the specific file isn't immediately known.

3.  **Conditional Access:**
    *   **Level 2-3:** Use `read_file` to access the target KB document as designed.
    *   **Level 0-1:** First attempt simplified procedures. If KB access is still required, use `read_file` but implement graceful fallback if the file doesn't exist.

4.  **Apply Information:** Integrate the detailed steps, guidelines, or reference information into your current task execution, adapting complexity based on workspace level.

**Key Objective:** To ensure detailed, complex, or reference-heavy procedures are accessed from the KB when required and available, while providing graceful degradation for simpler workspaces, optimizing token usage without sacrificing functionality.