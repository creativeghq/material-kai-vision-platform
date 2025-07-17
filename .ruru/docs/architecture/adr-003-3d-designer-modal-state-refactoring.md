+++
id = "ADR-003-3D-DESIGNER-MODAL-STATE-REFACTORING"
title = "ADR-003: 3D Designer Modal and State Management Refactoring"
context_type = "adr"
scope = "Architectural decision for fixing critical 3D Designer implementation issues"
target_audience = ["core-architect", "lead-frontend", "dev-react", "design-ui"]
granularity = "detailed"
status = "proposed"
last_updated = "2025-07-17"
tags = ["adr", "3d-designer", "modal-management", "state-management", "design-system", "architecture"]
related_context = [
    ".ruru/docs/architecture/3d-designer-improvement-plan.md",
    "src/components/3D/Designer3DPage.tsx",
    "src/components/3D/GenerationWorkflowModal.tsx",
    "src/components/3D/ImageModal.tsx"
]
template_schema_doc = ".ruru/templates/toml-md/07_adr.README.md"
relevance = "Critical: Defines architectural approach for 3D Designer fixes"
+++

# ADR-003: 3D Designer Modal and State Management Refactoring

## Status
**Proposed** - Awaiting implementation

## Context

The current 3D Designer implementation has several critical architectural issues that severely impact user experience:

1. **Modal Styling Inconsistencies**: Modal components use hardcoded styling that violates the design system, creating visual inconsistencies and poor user experience.

2. **State Management Issues**: The application experiences a "black page" bug after model generation completion, where the UI fails to refresh properly and becomes unresponsive.

3. **Model Filtering Logic Problems**: The current implementation artificially separates models into text-to-image and image-to-image categories, contradicting user requirements and limiting functionality.

4. **Poor Error Handling**: Inadequate error handling and response processing from Supabase edge functions leads to poor user feedback and failed generations.

5. **Missing Model Validation**: Models without proper image support are still shown and can be triggered, leading to failed generations.

### Technical Analysis

From the codebase analysis:

- [`GenerationWorkflowModal.tsx`](src/components/3D/GenerationWorkflowModal.tsx:320) uses hardcoded `bg-gray-50` and `border-gray-200` classes
- [`Designer3DPage.tsx`](src/components/3D/Designer3DPage.tsx:177-183) has improper completion handling that doesn't update UI state
- [`Designer3DPage.tsx`](src/components/3D/Designer3DPage.tsx:51-76) artificially separates models by type against user requirements
- [`supabase/functions/crewai-3d-generation/index.ts`](supabase/functions/crewai-3d-generation/index.ts:1602-1713) has complex error scenarios not properly communicated to frontend

## Decision

We will implement a comprehensive refactoring of the 3D Designer architecture with the following key decisions:

### 1. Design System Compliance for Modals

**Decision**: Standardize all modal components to use design system tokens exclusively.

**Rationale**: 
- Ensures visual consistency across the application
- Maintains proper theming support (dark/light modes)
- Reduces maintenance overhead by eliminating hardcoded styles
- Improves accessibility and user experience

**Implementation**:
- Replace all hardcoded color classes (`bg-gray-50`, `border-gray-200`, etc.) with design system tokens
- Use semantic color tokens (`bg-background`, `border-border`, `text-foreground`)
- Implement proper theme-aware styling using CSS variables
- Ensure consistent spacing using design system spacing tokens

### 2. Unified State Management Architecture

**Decision**: Implement a centralized state management pattern for 3D generation workflow.

**Rationale**:
- Eliminates the black page bug by ensuring proper state synchronization
- Provides clear data flow and state transitions
- Enables better error handling and recovery
- Improves maintainability and debugging

**Implementation**:
- Create a custom hook (`use3DGenerationState`) to manage generation workflow state
- Implement proper state cleanup on modal close/completion
- Add state synchronization between modal and main page components
- Use React's `useReducer` for complex state transitions
- Implement proper loading states and UI transitions

### 3. Simplified Model Management

**Decision**: Remove artificial model type separation and implement capability-based filtering.

**Rationale**:
- Aligns with user requirements (no separation between text-to-image and image-to-image)
- Simplifies the codebase and reduces complexity
- Enables more flexible model usage patterns
- Improves user experience by showing all available models

**Implementation**:
- Remove `modelType` categorization from frontend components
- Implement dynamic model filtering based on actual capabilities
- Update backend model configuration to support unified model handling
- Add runtime validation for model requirements (image availability, etc.)

### 4. Enhanced Error Handling and Validation

**Decision**: Implement comprehensive error handling with user-friendly feedback.

**Rationale**:
- Improves user experience by providing clear error messages
- Reduces support burden by preventing common failure scenarios
- Enables better debugging and monitoring
- Provides graceful degradation for edge cases

**Implementation**:
- Add pre-generation validation for model requirements
- Implement detailed error messages for different failure scenarios
- Add retry mechanisms for transient failures
- Improve Supabase error response handling and user feedback

### 5. Component Architecture Restructuring

**Decision**: Restructure modal components using composition patterns.

**Rationale**:
- Improves code reusability and maintainability
- Enables better testing and isolation of concerns
- Provides clearer separation of responsibilities
- Facilitates future feature additions

**Implementation**:
- Extract common modal functionality into reusable components
- Implement proper prop interfaces and TypeScript types
- Use compound component patterns for complex modal interactions
- Add proper accessibility attributes and keyboard navigation

## Consequences

### Positive Consequences

1. **Improved User Experience**: 
   - Eliminates the black page bug
   - Provides consistent visual design
   - Offers better error feedback and recovery

2. **Enhanced Maintainability**:
   - Cleaner, more organized codebase
   - Better separation of concerns
   - Improved testability

3. **Design System Compliance**:
   - Consistent theming across all modals
   - Proper accessibility support
   - Reduced design debt

4. **Simplified Model Management**:
   - More intuitive user interface
   - Reduced complexity in model handling
   - Better alignment with user requirements

### Negative Consequences

1. **Implementation Effort**:
   - Significant refactoring required across multiple components
   - Need for comprehensive testing of new state management
   - Potential for temporary instability during transition

2. **Breaking Changes**:
   - Existing modal styling will change
   - Model filtering behavior will be different
   - May require user communication about changes

3. **Risk of Regression**:
   - Complex state management changes could introduce new bugs
   - Need for thorough testing across different scenarios

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. Create design system compliant modal base components
2. Implement centralized state management hook
3. Update modal styling to use design system tokens

### Phase 2: Core Functionality (Week 2)
1. Refactor state management in main Designer3D component
2. Implement unified model filtering logic
3. Add comprehensive error handling

### Phase 3: Enhancement (Week 3)
1. Add advanced validation and user feedback
2. Implement performance optimizations
3. Add comprehensive testing coverage

## Monitoring and Success Criteria

### Success Metrics
1. **Zero black page occurrences** after generation completion
2. **100% design system compliance** in all modal components
3. **Unified model presentation** without artificial type separation
4. **Comprehensive error handling** with user-friendly messages
5. **Improved performance** in generation workflow

### Monitoring
1. User experience metrics and feedback
2. Error rate monitoring for generation workflows
3. Performance metrics for modal interactions
4. Design system compliance audits

## Alternatives Considered

### Alternative 1: Incremental Fixes
**Rejected**: Would not address the fundamental architectural issues and would result in continued technical debt.

### Alternative 2: Complete Rewrite
**Rejected**: Too risky and time-consuming. The current architecture can be improved with targeted refactoring.

### Alternative 3: Third-party State Management
**Rejected**: Adds unnecessary complexity for the scope of this component. React's built-in state management is sufficient.

## References

- [3D Designer Improvement Plan](.ruru/docs/architecture/3d-designer-improvement-plan.md)
- [Design System Documentation](src/components/ui/)
- [React State Management Best Practices](https://react.dev/learn/managing-state)
- [Modal Accessibility Guidelines](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)