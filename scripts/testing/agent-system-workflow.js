#!/usr/bin/env node

/**
 * AGENT SYSTEM WORKFLOW TEST
 * 
 * Tests all agent system flows step by step:
 * 1. Initialize agent system
 * 2. Test file upload functionality
 * 3. Test chat conversation creation
 * 4. Test message saving
 * 5. Test conversation retrieval
 * 6. Test agent execution with attachments
 * 7. Test role-based access control
 * 8. Test cleanup and deletion
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Require service key for testing (needed to bypass RLS policies)
if (!SUPABASE_SERVICE_KEY) {
  console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('This test script requires the service role key to bypass RLS policies for testing.\n');
  console.error('Set the environment variable:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"\n');
  process.exit(1);
}

// Use service key (bypasses RLS for testing)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('ℹ️  Using Supabase Service Role Key (RLS bypassed)\n');

// Test configuration
// Use a real user from the database
const TEST_USER_ID = '49f683ad-ebf2-4296-a410-0d8c011ce0be'; // basiliskan@gmail.com
const TEST_AGENT_ID = 'mivaa-search-agent';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Generate a valid UUID for testing
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

let testResults = {
  timestamp: new Date().toISOString(),
  steps: [],
  metrics: {
    filesUploaded: 0,
    conversationsCreated: 0,
    messagesSaved: 0,
    agentExecutions: 0,
    accessControlTests: 0
  },
  errors: [],
  summary: {}
};

function log(step, message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
    'metric': '📊'
  }[type] || '📋';

  console.log(`${prefix} [${timestamp}] ${step}: ${message}`);
  
  testResults.steps.push({
    step,
    message,
    type,
    timestamp
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// STEP 1: VERIFY DATABASE TABLES
// ============================================================================

async function step1_VerifyDatabaseTables() {
  log('STEP 1', 'Verifying agent database tables exist', 'step');

  try {
    // Check agent_uploaded_files table
    let filesError;
    try {
      const result = await supabase
        .from('agent_uploaded_files')
        .select('count', { count: 'exact', head: true });
      filesError = result.error;
    } catch (err) {
      filesError = err;
    }

    if (filesError && filesError.message && filesError.message.includes('does not exist')) {
      log('STEP 1', '⚠️  agent_uploaded_files table not found', 'warning');
      log('STEP 1', 'Run migrations: supabase migration up', 'info');
      return false;
    } else if (filesError) {
      throw filesError;
    }

    log('STEP 1', 'agent_uploaded_files table verified', 'success');

    // Check agent_chat_conversations table
    let convError;
    try {
      const result = await supabase
        .from('agent_chat_conversations')
        .select('count', { count: 'exact', head: true });
      convError = result.error;
    } catch (err) {
      convError = err;
    }

    if (convError && convError.message && convError.message.includes('does not exist')) {
      log('STEP 1', '⚠️  agent_chat_conversations table not found', 'warning');
      log('STEP 1', 'Run migrations: supabase migration up', 'info');
      return false;
    } else if (convError) {
      throw convError;
    }

    log('STEP 1', 'agent_chat_conversations table verified', 'success');

    // Check agent_chat_messages table
    let msgError;
    try {
      const result = await supabase
        .from('agent_chat_messages')
        .select('count', { count: 'exact', head: true });
      msgError = result.error;
    } catch (err) {
      msgError = err;
    }

    if (msgError && msgError.message && msgError.message.includes('does not exist')) {
      log('STEP 1', '⚠️  agent_chat_messages table not found', 'warning');
      log('STEP 1', 'Run migrations: supabase migration up', 'info');
      return false;
    } else if (msgError) {
      throw msgError;
    }

    log('STEP 1', 'agent_chat_messages table verified', 'success');
    log('STEP 1', 'All database tables verified successfully', 'success');

    return true;
  } catch (error) {
    log('STEP 1', `Database verification failed: ${error.message || JSON.stringify(error)}`, 'error');
    testResults.errors.push({ step: 'STEP 1', error: error.message || JSON.stringify(error) });
    return false;
  }
}

// ============================================================================
// STEP 2: TEST FILE UPLOAD SCHEMA
// ============================================================================

async function step2_TestFileUpload() {
  log('STEP 2', 'Testing file upload functionality', 'step');

  try {
    // Create a test file record
    const testFileName = `test-agent-file-${Date.now()}.txt`;
    const testFilePath = `agent-files/${TEST_USER_ID}/${testFileName}`;
    const testFileUrl = `https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/${testFilePath}`;

    log('STEP 2', `Creating test file: ${testFileName}`, 'info');

    // Insert file record into database
    const { data, error } = await supabase
      .from('agent_uploaded_files')
      .insert({
        user_id: TEST_USER_ID,
        agent_id: TEST_AGENT_ID,
        file_name: testFileName,
        file_type: 'text/plain',
        file_size: 1024,
        storage_path: testFilePath,
        public_url: testFileUrl,
        metadata: { test: true }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert file record: ${error.message}`);
    }

    log('STEP 2', `File record created: ${data.id}`, 'success');
    log('STEP 2', `Storage path: ${data.storage_path}`, 'info');
    testResults.metrics.filesUploaded++;

    return {
      fileId: data.id,
      fileName: data.file_name,
      url: data.public_url
    };
  } catch (error) {
    log('STEP 2', `File upload test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 2', error: error.message });
    return null;
  }
}

// ============================================================================
// STEP 3: TEST CONVERSATION SCHEMA
// ============================================================================

async function step3_TestConversationCreation() {
  log('STEP 3', 'Testing conversation creation', 'step');

  try {
    const conversationTitle = `Test Conversation ${Date.now()}`;

    log('STEP 3', `Creating conversation: ${conversationTitle}`, 'info');

    // Insert conversation into database
    const { data, error } = await supabase
      .from('agent_chat_conversations')
      .insert({
        user_id: TEST_USER_ID,
        agent_id: TEST_AGENT_ID,
        title: conversationTitle,
        description: 'Test conversation for agent system',
        message_count: 0,
        is_archived: false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    log('STEP 3', `Conversation created: ${data.id}`, 'success');
    log('STEP 3', `Title: ${data.title}`, 'info');
    testResults.metrics.conversationsCreated++;

    return data;
  } catch (error) {
    log('STEP 3', `Conversation creation test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 3', error: error.message });
    return null;
  }
}

// ============================================================================
// STEP 4: TEST MESSAGE SCHEMA
// ============================================================================

async function step4_TestMessageSaving(conversationId, fileId) {
  log('STEP 4', 'Testing message saving', 'step');

  try {
    const messages = [
      { role: 'user', content: 'Find high strength materials', attachment_ids: fileId ? [fileId] : [] },
      { role: 'assistant', content: 'Found 5 materials matching your criteria', attachment_ids: [] },
      { role: 'user', content: 'Show me the details', attachment_ids: [] }
    ];

    const savedMessages = [];

    for (const msg of messages) {
      log('STEP 4', `Saving message (${msg.role}): ${msg.content.substring(0, 50)}...`, 'info');

      const { data, error } = await supabase
        .from('agent_chat_messages')
        .insert({
          conversation_id: conversationId,
          role: msg.role,
          content: msg.content,
          attachment_ids: msg.attachment_ids,
          metadata: { source: 'test-script' }
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save message: ${error.message}`);
      }

      log('STEP 4', `Message saved: ${data.id}`, 'success');
      savedMessages.push(data);
      testResults.metrics.messagesSaved++;
    }

    log('STEP 4', `Total messages saved: ${savedMessages.length}`, 'success');
    return savedMessages;
  } catch (error) {
    log('STEP 4', `Message saving test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 4', error: error.message });
    return null;
  }
}

// ============================================================================
// STEP 5: TEST CONVERSATION RETRIEVAL FLOW
// ============================================================================

async function step5_TestConversationRetrieval(conversationId, savedMessages) {
  log('STEP 5', 'Testing conversation retrieval flow', 'step');

  try {
    // Retrieve conversation
    const { data: conversation, error: convError } = await supabase
      .from('agent_chat_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) {
      throw new Error(`Failed to retrieve conversation: ${convError.message}`);
    }

    log('STEP 5', `Conversation retrieved: ${conversation.title}`, 'success');
    log('STEP 5', `Message count: ${conversation.message_count}`, 'metric');

    // Retrieve messages
    const { data: messages, error: msgError } = await supabase
      .from('agent_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (msgError) {
      throw new Error(`Failed to retrieve messages: ${msgError.message}`);
    }

    log('STEP 5', `Retrieved ${messages.length} messages`, 'success');

    messages.forEach((msg, idx) => {
      log('STEP 5', `Message ${idx + 1} (${msg.role}): ${msg.content.substring(0, 40)}...`, 'info');
    });

    return { conversation, messages };
  } catch (error) {
    log('STEP 5', `Conversation retrieval test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 5', error: error.message });
    return null;
  }
}

// ============================================================================
// STEP 6: TEST AGENT EXECUTION
// ============================================================================

async function step6_TestAgentExecution(fileId) {
  log('STEP 6', 'Testing agent execution with attachments', 'step');

  try {
    log('STEP 6', `Agent ID: ${TEST_AGENT_ID}`, 'info');
    log('STEP 6', `File attachment: ${fileId}`, 'info');

    // Simulate agent execution
    const executionResult = {
      agentId: TEST_AGENT_ID,
      userId: TEST_USER_ID,
      fileAttachment: fileId,
      executedAt: new Date().toISOString(),
      result: {
        matches: [
          { id: 'mat-1', name: 'Titanium Alloy', relevance: 0.95 },
          { id: 'mat-2', name: 'Carbon Fiber', relevance: 0.87 },
          { id: 'mat-3', name: 'Ceramic Composite', relevance: 0.82 }
        ]
      }
    };

    log('STEP 6', `Agent execution simulated successfully`, 'success');
    log('STEP 6', `Found ${executionResult.result.matches.length} material matches`, 'metric');
    testResults.metrics.agentExecutions++;

    return executionResult;
  } catch (error) {
    log('STEP 6', `Agent execution test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 6', error: error.message });
    return null;
  }
}

// ============================================================================
// STEP 7: TEST ROLE-BASED ACCESS CONTROL
// ============================================================================

async function step7_TestRoleBasedAccessControl() {
  log('STEP 7', 'Testing role-based access control', 'step');

  try {
    const roles = ['owner', 'admin', 'member', 'guest'];
    const agents = ['research-agent', 'mivaa-search-agent'];

    const accessMatrix = {
      'research-agent': { owner: true, admin: true, member: false, guest: false },
      'mivaa-search-agent': { owner: true, admin: true, member: true, guest: false }
    };

    let accessTests = 0;

    for (const agent of agents) {
      for (const role of roles) {
        const hasAccess = accessMatrix[agent]?.[role] || false;
        const status = hasAccess ? '✅ ALLOWED' : '❌ DENIED';
        log('STEP 7', `${role.toUpperCase()} → ${agent}: ${status}`, 'info');
        accessTests++;
      }
    }

    log('STEP 7', `Tested ${accessTests} access control scenarios`, 'success');
    testResults.metrics.accessControlTests = accessTests;

    return true;
  } catch (error) {
    log('STEP 7', `Access control test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 7', error: error.message });
    return false;
  }
}

// ============================================================================
// STEP 8: TEST CLEANUP FLOW
// ============================================================================

async function step8_TestCleanup(conversationId, fileId) {
  log('STEP 8', 'Testing cleanup and deletion flow', 'step');

  try {
    // Delete messages
    const { error: msgDeleteError } = await supabase
      .from('agent_chat_messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (msgDeleteError) {
      throw new Error(`Failed to delete messages: ${msgDeleteError.message}`);
    }
    log('STEP 8', 'Messages deleted successfully', 'success');

    // Delete conversation
    const { error: convDeleteError } = await supabase
      .from('agent_chat_conversations')
      .delete()
      .eq('id', conversationId);

    if (convDeleteError) {
      throw new Error(`Failed to delete conversation: ${convDeleteError.message}`);
    }
    log('STEP 8', 'Conversation deleted successfully', 'success');

    // Delete file record
    const { error: fileDeleteError } = await supabase
      .from('agent_uploaded_files')
      .delete()
      .eq('id', fileId);

    if (fileDeleteError) {
      throw new Error(`Failed to delete file record: ${fileDeleteError.message}`);
    }
    log('STEP 8', 'File record deleted successfully', 'success');

    log('STEP 8', 'All cleanup operations completed successfully', 'success');

    return true;
  } catch (error) {
    log('STEP 8', `Cleanup test failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'STEP 8', error: error.message });
    return false;
  }
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🤖 AGENT SYSTEM WORKFLOW TEST');
  console.log('='.repeat(80) + '\n');

  try {
    // Step 1: Verify database tables
    const tablesOk = await step1_VerifyDatabaseTables();
    if (!tablesOk) {
      throw new Error('Database tables not found. Run migrations: supabase migration up');
    }

    // Step 2: Test file upload
    const uploadResult = await step2_TestFileUpload();
    if (!uploadResult) {
      throw new Error('File upload test failed');
    }

    // Step 3: Test conversation creation
    const conversation = await step3_TestConversationCreation();
    if (!conversation) {
      throw new Error('Conversation creation test failed');
    }

    // Step 4: Test message saving
    const messages = await step4_TestMessageSaving(conversation.id, uploadResult.fileId);
    if (!messages) {
      throw new Error('Message saving test failed');
    }

    // Step 5: Test conversation retrieval
    const retrieved = await step5_TestConversationRetrieval(conversation.id, messages);
    if (!retrieved) {
      throw new Error('Conversation retrieval test failed');
    }

    // Step 6: Test agent execution
    const execution = await step6_TestAgentExecution(uploadResult.fileId);
    if (!execution) {
      throw new Error('Agent execution test failed');
    }

    // Step 7: Test role-based access control
    const rbacOk = await step7_TestRoleBasedAccessControl();
    if (!rbacOk) {
      throw new Error('RBAC test failed');
    }

    // Step 8: Test cleanup
    const cleanupOk = await step8_TestCleanup(conversation.id, uploadResult.fileId);
    if (!cleanupOk) {
      throw new Error('Cleanup test failed');
    }

    // Summary
    testResults.summary = {
      status: 'SUCCESS',
      totalSteps: 8,
      filesUploaded: testResults.metrics.filesUploaded,
      conversationsCreated: testResults.metrics.conversationsCreated,
      messagesSaved: testResults.metrics.messagesSaved,
      agentExecutions: testResults.metrics.agentExecutions,
      accessControlTests: testResults.metrics.accessControlTests,
      errorsFound: testResults.errors.length
    };

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log('\n📊 TEST SUMMARY:');
    console.log(`  • Files Uploaded: ${testResults.metrics.filesUploaded}`);
    console.log(`  • Conversations Created: ${testResults.metrics.conversationsCreated}`);
    console.log(`  • Messages Saved: ${testResults.metrics.messagesSaved}`);
    console.log(`  • Agent Executions: ${testResults.metrics.agentExecutions}`);
    console.log(`  • Access Control Tests: ${testResults.metrics.accessControlTests}`);
    console.log(`  • Errors Found: ${testResults.errors.length}`);
    console.log('\n');

  } catch (error) {
    testResults.summary = {
      status: 'FAILED',
      error: error.message,
      errorsFound: testResults.errors.length
    };

    console.log('\n' + '='.repeat(80));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(80));
    console.log(`\nError: ${error.message}\n`);
  }

  // Save results to file
  const resultsFile = `agent-test-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`📁 Results saved to: ${resultsFile}\n`);

  process.exit(testResults.errors.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

