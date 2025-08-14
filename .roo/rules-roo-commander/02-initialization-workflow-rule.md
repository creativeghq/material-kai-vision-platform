+++
id = "ROO-CMD-RULE-INIT-V7" # Incremented version
title = "Roo Commander: Rule - Initial Request Processing & Mode Management (Decision Tree)" # Updated title
context_type = "rules"
scope = "Initial user interaction handling, presenting structured starting options (dynamically loaded from decision tree prompt) and routing to specific KB procedures" # Updated scope
target_audience = ["roo-commander"]
granularity = "procedure"
status = "active"
last_updated = "2025-05-05" # Use current date
tags = ["rules", "workflow", "initialization", "onboarding", "intent", "options", "kb-routing", "roo-commander", "mode-management", "dynamic-prompt", "decision-tree"] # Added tags
related_context = [
    "01-operational-principles.md",
    ".ruru/modes/roo-commander/kb/prompts/initial-options-prompt.md", # Source of options
    ".ruru/modes/roo-commander/kb/initial-actions/action-mapping.md", # Mapping file
    # Key delegate modes (referenced by KB procedures or direct actions)
    "manager-onboarding",
    "dev-git",
    "core-architect",
    "manager-product",
    "agent-research",
    "prime-coordinator",
    "dev-fixer",
    "util-refactor",
    "util-writer",
    "util-workflow-manager" # Maps to 4.3
    ]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Defines the entry point for user interaction and routes to specific procedures"
+++

# Rule: Initial Request Processing (Workspace Complexity Aware & Auto Session Management)

This rule governs how you handle the **first user message** in a session. It incorporates workspace complexity awareness for conditional KB access and intelligent session management detection to automatically create sessions when appropriate.

**Procedure:**

1.  **Workspace Complexity Assessment:**
    *   Determine current workspace complexity level (as defined in Rule `12-workspace-complexity-detection.md`):
        *   **Level 0-1 (Minimal/Basic):** Use simplified workflows, avoid KB access unless critical.
        *   **Level 2-3 (Standard/Enterprise):** Full KB infrastructure available, use as designed.

2.  **Session Management Detection:**
    *   Analyze the user's request for complexity indicators that suggest session creation would be beneficial:
        *   **High Complexity Indicators:** Multi-step goals, project work, "implement", "build", "create", "fix complex issue", mentions of multiple files/components.
        *   **Low Complexity Indicators:** Simple questions, single file edits, quick lookups, "help", "explain".
    *   **Auto Session Logic:** If Level 2-3 workspace AND high complexity indicators detected, automatically suggest session creation in Step 2B.

3.  **Analyze Initial User Request:**
    *   Check for explicit mode switch requests ("switch to `[mode-slug]`").
    *   Briefly analyze keywords if the user states a goal directly.
    *   Assess complexity indicators for session management (Step 2).

4.  **Determine Response Path:**

    *   **A. Direct Mode Request:**
        *   If user explicitly requests switching to a specific mode: Confirm understanding and use the `switch_mode` tool. Log action (Rule `08`). **End this workflow.**

    *   **B. Direct Goal Stated (High Confidence - Non-Onboarding):**
        *   If the user's first message clearly states a goal that confidently maps to a specific action *other than onboarding/setup* (e.g., "fix bug 123", "refactor `userService.js`"):
            1.  Acknowledge the goal.
            2.  **Session Management Check:** If Level 2-3 workspace AND high complexity indicators detected, include session creation option in the followup question.
            3.  Propose the most relevant specialist mode using the `ask_followup_question` tool with suggestions:
                *   "Yes, use [Proposed Mode]" (+ "with session log" if applicable)
                *   "No, show me the main starting options"
                *   "Create session log for this work" (if not already included)
            4.  If "Yes", proceed to standard delegation (Rule `03`). If session requested, follow Rule `11-session-management-impl.md`. Log action. **End this workflow.**
            5.  If "No", proceed to **Path C**.

    *   **C. All Other Cases (Default Path):**
        *   Includes: Vague requests ("hi", "hello"), requests for help/options, requests initially mentioning "new project" or "onboard existing", or user selecting "No" in Path B.
        *   **Action:** Present the **Standard Initial Options (Decision Tree)** with workspace complexity optimization.
            1.  **Conditional KB Access:**
                *   **Level 2-3:** Use the `read_file` tool to get the content of `.ruru/modes/roo-commander/kb/prompts/initial-options-prompt.md`.
                *   **Level 0-1:** Use simplified built-in options instead of KB lookup. Provide basic options like: "1. 🚀 Start New Project", "2. 💻 Work on Code", "3. 📚 Get Help", "4. 🔧 Fix Issue".
            2.  Parse the options (from KB or built-in) and extract top-level categories.
            3.  Use the `ask_followup_question` tool, providing the parsed question and the extracted top-level categories as suggestions.
            4.  Await user's selection of a top-level category. Proceed to Step 5.

5.  **Handle User Selection (from Initial Options):**

    *   **If a top-level category (e.g., "1", "2") was selected:**
        1.  **Conditional KB Access:**
            *   **Level 2-3:** Use `read_file` again on `.ruru/modes/roo-commander/kb/prompts/initial-options-prompt.md` (or use cached content if available). Extract the sub-options corresponding to the chosen category.
            *   **Level 0-1:** Use simplified sub-options based on the category. For example, if "Work on Code" was selected, offer: "2.1 Fix Bug", "2.2 Add Feature", "2.3 Refactor Code", "2.4 Review Code".
        2.  Use the `ask_followup_question` tool again, asking the user to choose from these specific sub-options.
        3.  Await user's selection of a sub-option. Proceed to Step 6.

    *   **(Alternative Implementation Note):** Depending on UI capabilities, the full tree might be presented initially. If so, skip the intermediate step and proceed directly to Step 6 based on the user's specific selection (e.g., "1.1", "4.2"). This rule describes the logical flow, assuming a potential two-step interaction.

6.  **Route to Action/Procedure (Based on Final Selection):**
    *   Once the user selects a *specific, final option* (e.g., "1.1", "2.3", "4.2", "5.4"):
        1.  Identify the selected option number (e.g., `1.1`, `2.3`).
        2.  Log the chosen starting path (Rule `08`).
        3.  **Conditional Action Mapping:**
            *   **Level 2-3:** Use the `read_file` tool to load the content of the mapping file: `.ruru/modes/roo-commander/kb/initial-actions/action-mapping.md`. Parse the mapping file to find the entry corresponding to the selected option number. Extract the associated KB procedure path or direct action.
            *   **Level 0-1:** Use simplified action mapping based on the selected option. Map common selections to appropriate specialist modes (e.g., "Fix Bug" → `dev-fixer`, "Add Feature" → `dev-core-web`, "Refactor Code" → `util-refactor`).
        4.  **Execute Action/Procedure:**
            *   If a KB path was found (Level 2-3): Execute the detailed procedure defined in that KB file.
            *   If a direct action or simplified mapping: Perform that action using the appropriate tool (e.g., `switch_mode` or `new_task`).
            *   **Session Management:** If the action involves complex work and Level 2-3 workspace, consider prompting for session creation before delegation.
        5.  Follow the steps within the chosen KB procedure or subsequent workflow, including any user interaction or delegation it defines. **End this initialization workflow** upon completion of the KB procedure or delegated workflow.

**Key Objective:** To provide clear, structured starting options (when needed) while optimizing for workspace complexity, automatically detecting when session management would be beneficial, and ensuring graceful degradation for simpler workspaces while maintaining full functionality for enterprise environments.