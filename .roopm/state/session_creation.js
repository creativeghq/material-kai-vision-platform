/**
 * Session Creation Workflows for Session Management V7 - Phase 2
 * 
 * This module implements the core session creation workflow logic that coordinator modes
 * will use to initiate new sessions. It provides comprehensive functionality for:
 * - Session initiation detection
 * - User goal capture workflows
 * - Session directory creation
 * - Session ID generation enhancement
 * - Integration with existing session utilities
 */

const fs = require('fs');
const path = require('path');
const { generateSessionID, setActiveSession, readSessionState } = require('./session_utils');

// Constants for session creation
const SESSION_LOG_TEMPLATE = '.ruru/templates/toml-md/19_mdtm_session.md';
const SESSION_SCAFFOLD_DIR = '.ruru/templates/session_artifact_scaffold';
const SESSIONS_BASE_DIR = '.ruru/sessions';

/**
 * Session initiation detection logic
 */

/**
 * Determines if a new session should be created based on current state and user interaction
 * @param {Object} context - Current context including user message, active session, etc.
 * @returns {Object} Detection result with recommendation and reasoning
 */
function shouldInitiateSession(context = {}) {
    const {
        userMessage = '',
        activeSessionId = null,
        lastUserInteraction = null,
        sessionHistory = [],
        coordinatorMode = 'unknown'
    } = context;

    const result = {
        shouldCreate: false,
        confidence: 0.0,
        reasoning: [],
        triggers: [],
        suggestedGoal: null
    };

    // Check if there's already an active session
    if (activeSessionId) {
        result.reasoning.push('Active session already exists');
        return result;
    }

    // Analyze user message for session-worthy indicators
    const sessionTriggers = analyzeMessageForSessionTriggers(userMessage);
    result.triggers = sessionTriggers.triggers;

    // Calculate confidence based on triggers
    let confidence = 0.0;
    const triggerWeights = {
        'complex_task': 0.4,
        'multi_step': 0.3,
        'project_goal': 0.4,
        'implementation_request': 0.3,
        'planning_request': 0.2,
        'session_keywords': 0.2,
        'long_message': 0.1,
        'multiple_requirements': 0.2
    };

    sessionTriggers.triggers.forEach(trigger => {
        confidence += triggerWeights[trigger] || 0.1;
    });

    // Boost confidence for certain coordinator modes
    if (['roo-commander', 'prime-coordinator'].includes(coordinatorMode)) {
        confidence += 0.1;
        result.reasoning.push('Coordinator mode benefits from session tracking');
    }

    // Check time since last session
    if (sessionHistory.length === 0) {
        confidence += 0.1;
        result.reasoning.push('No previous sessions - good candidate for first session');
    }

    // Determine if we should create a session
    result.confidence = Math.min(confidence, 1.0);
    result.shouldCreate = result.confidence >= 0.5;

    if (result.shouldCreate) {
        result.suggestedGoal = sessionTriggers.suggestedGoal;
        result.reasoning.push(`High confidence (${(result.confidence * 100).toFixed(1)}%) for session creation`);
    } else {
        result.reasoning.push(`Low confidence (${(result.confidence * 100).toFixed(1)}%) - simple task or insufficient complexity`);
    }

    return result;
}

/**
 * Analyzes user message for session creation triggers
 * @param {string} message - User message to analyze
 * @returns {Object} Analysis result with triggers and suggested goal
 */
function analyzeMessageForSessionTriggers(message) {
    const triggers = [];
    let suggestedGoal = null;

    if (!message || typeof message !== 'string') {
        return { triggers, suggestedGoal };
    }

    const lowerMessage = message.toLowerCase();

    // Complex task indicators
    const complexityKeywords = [
        'implement', 'create', 'build', 'develop', 'design', 'architect',
        'refactor', 'optimize', 'integrate', 'deploy', 'setup', 'configure'
    ];
    if (complexityKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('complex_task');
    }

    // Multi-step indicators
    const multiStepKeywords = [
        'step', 'phase', 'stage', 'first', 'then', 'next', 'after',
        'workflow', 'process', 'pipeline', 'sequence'
    ];
    if (multiStepKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('multi_step');
    }

    // Project/goal indicators
    const projectKeywords = [
        'project', 'application', 'system', 'platform', 'service',
        'feature', 'module', 'component', 'framework'
    ];
    if (projectKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('project_goal');
    }

    // Implementation requests
    const implementationKeywords = [
        'code', 'function', 'class', 'api', 'database', 'frontend',
        'backend', 'ui', 'interface', 'algorithm'
    ];
    if (implementationKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('implementation_request');
    }

    // Planning requests
    const planningKeywords = [
        'plan', 'strategy', 'approach', 'architecture', 'design',
        'structure', 'organize', 'outline'
    ];
    if (planningKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('planning_request');
    }

    // Explicit session keywords
    const sessionKeywords = ['session', 'track', 'log', 'record', 'document'];
    if (sessionKeywords.some(keyword => lowerMessage.includes(keyword))) {
        triggers.push('session_keywords');
    }

    // Message length indicator
    if (message.length > 200) {
        triggers.push('long_message');
    }

    // Multiple requirements (sentences with "and", "also", "additionally")
    const requirementIndicators = ['and', 'also', 'additionally', 'furthermore', 'moreover'];
    if (requirementIndicators.some(indicator => lowerMessage.includes(indicator))) {
        triggers.push('multiple_requirements');
    }

    // Extract suggested goal from message
    suggestedGoal = extractGoalFromMessage(message);

    return { triggers, suggestedGoal };
}

/**
 * Extracts a potential session goal from the user message
 * @param {string} message - User message
 * @returns {string|null} Suggested goal or null
 */
function extractGoalFromMessage(message) {
    if (!message || typeof message !== 'string') {
        return null;
    }

    // Try to extract goal from common patterns
    const goalPatterns = [
        /(?:create|build|implement|develop)\s+(?:a|an)?\s*([^.!?]+)/i,
        /(?:i want to|i need to|help me)\s+([^.!?]+)/i,
        /(?:project|goal|task):\s*([^.!?]+)/i
    ];

    for (const pattern of goalPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            let goal = match[1].trim();
            // Clean up and limit length
            goal = goal.replace(/\s+/g, ' ').slice(0, 100);
            if (goal.length > 10) {
                return goal;
            }
        }
    }

    // Fallback: use first sentence if reasonable length
    const firstSentence = message.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 10 && firstSentence.length <= 100) {
        return firstSentence;
    }

    return null;
}

/**
 * User goal capture workflow
 */

/**
 * Creates interactive prompts for capturing user session goals
 * @param {Object} options - Options for goal capture
 * @returns {Object} Prompt configuration for ask_followup_question tool
 */
function createGoalCapturePrompt(options = {}) {
    const {
        suggestedGoal = null,
        detectedTriggers = [],
        coordinatorMode = 'unknown'
    } = options;

    const prompt = {
        question: '',
        suggestions: []
    };

    // Customize question based on context
    if (suggestedGoal) {
        prompt.question = `I detected this might be a good candidate for session tracking. Would you like to start a new session for: "${suggestedGoal}"?`;
        
        prompt.suggestions = [
            `Yes, start session: "${suggestedGoal}"`,
            'Yes, but let me specify a different goal',
            'No, continue without session tracking'
        ];
    } else {
        prompt.question = 'This appears to be a complex task that would benefit from session tracking. What is your main goal for this interaction?';
        
        // Generate suggestions based on detected triggers
        const suggestions = generateGoalSuggestions(detectedTriggers);
        prompt.suggestions = [
            ...suggestions,
            'Skip session tracking for now'
        ];
    }

    return prompt;
}

/**
 * Generates goal suggestions based on detected triggers
 * @param {Array} triggers - Detected session triggers
 * @returns {Array} Array of suggested goals
 */
function generateGoalSuggestions(triggers) {
    const suggestions = [];

    if (triggers.includes('implementation_request')) {
        suggestions.push('Implement a new feature or component');
    }
    if (triggers.includes('project_goal')) {
        suggestions.push('Build a new project or application');
    }
    if (triggers.includes('planning_request')) {
        suggestions.push('Plan and design system architecture');
    }
    if (triggers.includes('complex_task')) {
        suggestions.push('Complete a complex development task');
    }

    // Fallback suggestions
    if (suggestions.length === 0) {
        suggestions.push(
            'Develop and implement solution',
            'Research and plan approach',
            'Build and test functionality'
        );
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Validates and sanitizes user-provided session goals
 * @param {string} goal - User-provided goal
 * @returns {Object} Validation result
 */
function validateSessionGoal(goal) {
    const result = {
        isValid: false,
        sanitizedGoal: '',
        errors: []
    };

    if (!goal || typeof goal !== 'string') {
        result.errors.push('Goal must be a non-empty string');
        return result;
    }

    const trimmedGoal = goal.trim();

    // Length validation
    if (trimmedGoal.length < 5) {
        result.errors.push('Goal must be at least 5 characters long');
    }
    if (trimmedGoal.length > 200) {
        result.errors.push('Goal must be less than 200 characters');
    }

    // Content validation
    if (!/[a-zA-Z]/.test(trimmedGoal)) {
        result.errors.push('Goal must contain at least some letters');
    }

    // Sanitize goal
    let sanitized = trimmedGoal
        .replace(/[^\w\s\-_.]/g, '') // Remove special chars except basic ones
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    if (result.errors.length === 0) {
        result.isValid = true;
        result.sanitizedGoal = sanitized;
    }

    return result;
}

/**
 * Session directory creation logic
 */

/**
 * Creates a complete session directory structure with all required files
 * @param {Object} sessionConfig - Session configuration
 * @returns {Promise<Object>} Creation result
 */
async function createSessionDirectory(sessionConfig) {
    const {
        sessionId,
        goal,
        coordinatorMode = 'unknown',
        useScaffold = true
    } = sessionConfig;

    const result = {
        success: false,
        sessionPath: '',
        createdFiles: [],
        errors: []
    };

    try {
        // Validate inputs
        if (!sessionId || !goal) {
            result.errors.push('Session ID and goal are required');
            return result;
        }

        // Create session directory path
        const sessionPath = path.join(SESSIONS_BASE_DIR, sessionId);
        result.sessionPath = sessionPath;

        // Check if directory already exists
        if (fs.existsSync(sessionPath)) {
            result.errors.push(`Session directory already exists: ${sessionPath}`);
            return result;
        }

        // Create main session directory
        fs.mkdirSync(sessionPath, { recursive: true });
        result.createdFiles.push(sessionPath);

        // Create artifacts directory and structure
        const artifactsPath = path.join(sessionPath, 'artifacts');
        
        if (useScaffold && fs.existsSync(SESSION_SCAFFOLD_DIR)) {
            // Use scaffold copy method (preferred)
            await copyScaffoldStructure(SESSION_SCAFFOLD_DIR, artifactsPath);
            result.createdFiles.push(`${artifactsPath} (from scaffold)`);
        } else {
            // Use manual creation method (fallback)
            await createArtifactStructureManually(artifactsPath);
            result.createdFiles.push(`${artifactsPath} (manual creation)`);
        }

        // Create session log file
        const sessionLogPath = await createSessionLogFile(sessionPath, sessionConfig);
        result.createdFiles.push(sessionLogPath);

        result.success = true;

    } catch (error) {
        result.errors.push(`Failed to create session directory: ${error.message}`);
    }

    return result;
}

/**
 * Copies the session scaffold structure to the target artifacts directory
 * @param {string} scaffoldDir - Source scaffold directory
 * @param {string} targetDir - Target artifacts directory
 * @returns {Promise<void>}
 */
async function copyScaffoldStructure(scaffoldDir, targetDir) {
    return new Promise((resolve, reject) => {
        try {
            // Create target directory
            fs.mkdirSync(targetDir, { recursive: true });

            // Copy all contents from scaffold
            const copyRecursive = (src, dest) => {
                const stats = fs.statSync(src);
                
                if (stats.isDirectory()) {
                    fs.mkdirSync(dest, { recursive: true });
                    const items = fs.readdirSync(src);
                    
                    for (const item of items) {
                        copyRecursive(
                            path.join(src, item),
                            path.join(dest, item)
                        );
                    }
                } else {
                    fs.copyFileSync(src, dest);
                }
            };

            copyRecursive(scaffoldDir, targetDir);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Creates artifact directory structure manually (fallback method)
 * @param {string} artifactsPath - Path to artifacts directory
 * @returns {Promise<void>}
 */
async function createArtifactStructureManually(artifactsPath) {
    const subdirectories = [
        'notes', 'learnings', 'environment', 'docs', 'research',
        'blockers', 'questions', 'snippets', 'feedback', 'features',
        'context', 'deferred'
    ];

    // Create all subdirectories
    for (const subdir of subdirectories) {
        const subdirPath = path.join(artifactsPath, subdir);
        fs.mkdirSync(subdirPath, { recursive: true });

        // Create README.md for each subdirectory
        const readmePath = path.join(subdirPath, 'README.md');
        const readmeContent = `# ${subdir.charAt(0).toUpperCase() + subdir.slice(1)}\n\nThis directory contains ${subdir} artifacts for the current session.\n`;
        fs.writeFileSync(readmePath, readmeContent);
    }
}

/**
 * Creates the session log file from template
 * @param {string} sessionPath - Session directory path
 * @param {Object} sessionConfig - Session configuration
 * @returns {Promise<string>} Path to created session log file
 */
async function createSessionLogFile(sessionPath, sessionConfig) {
    const {
        sessionId,
        goal,
        coordinatorMode = 'unknown'
    } = sessionConfig;

    const sessionLogPath = path.join(sessionPath, 'session_log.md');

    // Read template
    let templateContent = '';
    if (fs.existsSync(SESSION_LOG_TEMPLATE)) {
        templateContent = fs.readFileSync(SESSION_LOG_TEMPLATE, 'utf8');
    } else {
        // Fallback template if file doesn't exist
        templateContent = createFallbackSessionLogTemplate();
    }

    // Replace template placeholders
    const now = new Date();
    const timestamp = now.toISOString();

    const populatedContent = templateContent
        .replace(/id = ""/g, `id = "${sessionId}"`)
        .replace(/title = ""/g, `title = "${goal}"`)
        .replace(/start_time = ""/g, `start_time = "${timestamp}"`)
        .replace(/coordinator = ""/g, `coordinator = "${coordinatorMode}"`)
        .replace(/\[YYYY-MM-DD HH:MM:SS\]/g, `[${now.toISOString().slice(0, 19).replace('T', ' ')}]`)
        .replace(/\[coordinator_id\]/g, coordinatorMode)
        .replace(/\[Goal Text\]/g, goal);

    // Write session log file
    fs.writeFileSync(sessionLogPath, populatedContent);

    return sessionLogPath;
}

/**
 * Creates a fallback session log template if the template file doesn't exist
 * @returns {string} Fallback template content
 */
function createFallbackSessionLogTemplate() {
    return `+++
# --- Session Metadata ---
id = "" # Unique RooComSessionID for the session
title = "" # User-defined goal for the session
status = "🟢 Active" # Current status
start_time = "" # Timestamp when the session log was created
end_time = "" # Timestamp when the session was completed/paused
coordinator = "" # ID of the Coordinator mode that initiated the session
related_tasks = []
related_artifacts = []
tags = ["session", "log", "v7"]
+++

# Session Log V7

## Log Entries

- [YYYY-MM-DD HH:MM:SS] Session initiated by \`[coordinator_id]\` with goal: "[Goal Text]"
`;
}

/**
 * Session ID generation enhancement
 */

/**
 * Enhanced session ID generation with improved goal sanitization and collision avoidance
 * @param {string} goal - Session goal
 * @param {Object} options - Generation options
 * @returns {string} Generated session ID
 */
function generateEnhancedSessionID(goal, options = {}) {
    const {
        maxGoalLength = 30,
        includeRandomSuffix = false,
        avoidCollisions = true
    } = options;

    // Enhanced goal sanitization
    const sanitizedGoal = sanitizeGoalForSessionID(goal, maxGoalLength);
    
    // Generate base ID using existing utility
    let sessionId = generateSessionID(sanitizedGoal);

    // Add random suffix if requested
    if (includeRandomSuffix) {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        sessionId += `-${randomSuffix}`;
    }

    // Check for collisions and resolve if needed
    if (avoidCollisions) {
        sessionId = resolveSessionIdCollision(sessionId);
    }

    return sessionId;
}

/**
 * Enhanced goal sanitization for session ID generation
 * @param {string} goal - Original goal
 * @param {number} maxLength - Maximum length for sanitized goal
 * @returns {string} Sanitized goal
 */
function sanitizeGoalForSessionID(goal, maxLength = 30) {
    if (!goal || typeof goal !== 'string') {
        return 'general';
    }

    let sanitized = goal
        .toLowerCase()
        .trim()
        // Replace common words with shorter versions
        .replace(/\bimplement\b/g, 'impl')
        .replace(/\bapplication\b/g, 'app')
        .replace(/\bcomponent\b/g, 'comp')
        .replace(/\bfunction\b/g, 'func')
        .replace(/\bdatabase\b/g, 'db')
        .replace(/\binterface\b/g, 'ui')
        // Remove articles and common words
        .replace(/\b(a|an|the|and|or|but|in|on|at|to|for|of|with|by)\b/g, '')
        // Replace special characters and spaces
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    // Ensure minimum length
    if (sanitized.length < 3) {
        sanitized = 'task';
    }

    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
        // Try to break at word boundary
        const lastUnderscore = sanitized.lastIndexOf('_');
        if (lastUnderscore > maxLength * 0.7) {
            sanitized = sanitized.substring(0, lastUnderscore);
        }
    }

    return sanitized;
}

/**
 * Resolves session ID collisions by checking existing sessions
 * @param {string} baseSessionId - Base session ID
 * @returns {string} Unique session ID
 */
function resolveSessionIdCollision(baseSessionId) {
    const sessionPath = path.join(SESSIONS_BASE_DIR, baseSessionId);
    
    if (!fs.existsSync(sessionPath)) {
        return baseSessionId; // No collision
    }

    // Find next available ID with suffix
    let counter = 1;
    let uniqueId;
    
    do {
        uniqueId = `${baseSessionId}-${counter}`;
        counter++;
    } while (fs.existsSync(path.join(SESSIONS_BASE_DIR, uniqueId)) && counter < 100);

    if (counter >= 100) {
        // Fallback to timestamp-based suffix
        const timestamp = Date.now().toString(36);
        uniqueId = `${baseSessionId}-${timestamp}`;
    }

    return uniqueId;
}

/**
 * Main session creation workflow
 */

/**
 * Complete session creation workflow that ties everything together
 * @param {Object} context - Full context for session creation
 * @returns {Promise<Object>} Complete session creation result
 */
async function createNewSession(context) {
    const {
        goal,
        coordinatorMode = 'unknown',
        userConfirmed = false,
        options = {}
    } = context;

    const result = {
        success: false,
        sessionId: null,
        sessionPath: null,
        errors: [],
        warnings: [],
        createdFiles: []
    };

    try {
        // Validate goal
        const goalValidation = validateSessionGoal(goal);
        if (!goalValidation.isValid) {
            result.errors.push(...goalValidation.errors);
            return result;
        }

        // Generate enhanced session ID
        const sessionId = generateEnhancedSessionID(goalValidation.sanitizedGoal, {
            avoidCollisions: true,
            includeRandomSuffix: options.includeRandomSuffix || false
        });

        // Create session directory structure
        const creationResult = await createSessionDirectory({
            sessionId,
            goal: goalValidation.sanitizedGoal,
            coordinatorMode,
            useScaffold: options.useScaffold !== false
        });

        if (!creationResult.success) {
            result.errors.push(...creationResult.errors);
            return result;
        }

        // Update session state
        const stateUpdateSuccess = setActiveSession(sessionId);
        if (!stateUpdateSuccess) {
            result.warnings.push('Failed to update session state file');
        }

        // Success!
        result.success = true;
        result.sessionId = sessionId;
        result.sessionPath = creationResult.sessionPath;
        result.createdFiles = creationResult.createdFiles;

    } catch (error) {
        result.errors.push(`Session creation failed: ${error.message}`);
    }

    return result;
}

/**
 * Utility functions for integration
 */

/**
 * Gets current session creation status and recommendations
 * @param {Object} context - Current context
 * @returns {Object} Status and recommendations
 */
function getSessionCreationStatus(context = {}) {
    const state = readSessionState();
    const detection = shouldInitiateSession(context);
    
    return {
        hasActiveSession: !!state.active_session_id,
        activeSessionId: state.active_session_id,
        sessionHistory: state.session_history,
        recommendation: detection,
        canCreateSession: !state.active_session_id
    };
}

/**
 * Validates session creation prerequisites
 * @param {Object} context - Context to validate
 * @returns {Object} Validation result
 */
function validateSessionCreationPrerequisites(context = {}) {
    const result = {
        isValid: true,
        errors: [],
        warnings: []
    };

    // Check if sessions directory exists
    if (!fs.existsSync(SESSIONS_BASE_DIR)) {
        try {
            fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
            result.warnings.push('Created sessions directory');
        } catch (error) {
            result.errors.push(`Cannot create sessions directory: ${error.message}`);
            result.isValid = false;
        }
    }

    // Check template availability
    if (!fs.existsSync(SESSION_LOG_TEMPLATE)) {
        result.warnings.push('Session log template not found - will use fallback');
    }

    if (!fs.existsSync(SESSION_SCAFFOLD_DIR)) {
        result.warnings.push('Session scaffold not found - will use manual creation');
    }

    // Check for active session
    const state = readSessionState();
    if (state.active_session_id) {
        result.errors.push('Cannot create session - another session is already active');
        result.isValid = false;
    }

    return result;
}

// Export all functions
module.exports = {
    // Session initiation detection
    shouldInitiateSession,
    analyzeMessageForSessionTriggers,
    extractGoalFromMessage,
    
    // User goal capture
    createGoalCapturePrompt,
    generateGoalSuggestions,
    validateSessionGoal,
    
    // Session directory creation
    createSessionDirectory,
    copyScaffoldStructure,
    createArtifactStructureManually,
    createSessionLogFile,
    
    // Session ID generation
    generateEnhancedSessionID,
    sanitizeGoalForSessionID,
    resolveSessionIdCollision,
    
    // Main workflow
    createNewSession,
    
    // Utility functions
    getSessionCreationStatus,
    validateSessionCreationPrerequisites
};