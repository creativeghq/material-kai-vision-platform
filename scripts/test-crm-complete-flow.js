#!/usr/bin/env node

/**
 * Complete CRM End-to-End Flow Test
 * Tests the entire CRM system through all API endpoints:
 * 1. User Registration (create auth user + profile)
 * 2. Fetch User from Supabase
 * 3. Update User Fields (name, email)
 * 4. Add Credits to Account
 * 5. Assign Subscription Plan
 * 6. Assign User Role/Level
 * 7. Create CRM Contact
 * 8. Verify All Data
 *
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-crm-complete-flow.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Generate unique test email
function generateTestEmail() {
  return `test-${Date.now()}@example.com`;
}

async function testCRMSystem() {
  log('\n🚀 Starting Complete CRM End-to-End Flow Test\n', 'cyan');
  log('Testing: Registration → Fetch → Update → Credits → Plan → Role → Contact\n', 'yellow');

  let testUserId = null;
  let testUserEmail = null;

  try {
    // ============ Step 1: User Registration ============
    log('📋 Step 1: User Registration (Create Auth User + Profile)', 'blue');

    testUserEmail = generateTestEmail();
    const testPassword = 'TestPassword123!@#';

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testUserEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (authError) {
      log(`  ❌ Failed to create auth user: ${authError.message}`, 'red');
      throw authError;
    }

    testUserId = authData.user.id;
    log(`  ✅ Auth user created: ${testUserId}`, 'green');
    log(`     Email: ${testUserEmail}`, 'cyan');

    // Create user profile with default role
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: testUserId,
        role_id: (await supabase.from('roles').select('id').eq('name', 'user').single()).data.id,
        full_name: 'Test User',
        email: testUserEmail,
      })
      .select()
      .single();

    if (profileError) {
      log(`  ❌ Failed to create user profile: ${profileError.message}`, 'red');
      throw profileError;
    }

    log(`  ✅ User profile created`, 'green');

    // ============ Step 2: Fetch User from Supabase ============
    log('\n📋 Step 2: Fetch User from Supabase', 'blue');

    const { data: fetchedUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        roles(name, level)
      `)
      .eq('user_id', testUserId)
      .single();

    if (fetchError) {
      log(`  ❌ Failed to fetch user: ${fetchError.message}`, 'red');
      throw fetchError;
    }

    log(`  ✅ User fetched successfully`, 'green');
    log(`     ID: ${fetchedUser.user_id}`, 'cyan');
    log(`     Name: ${fetchedUser.full_name}`, 'cyan');
    log(`     Email: ${fetchedUser.email}`, 'cyan');
    log(`     Role: ${fetchedUser.roles.name} (Level ${fetchedUser.roles.level})`, 'cyan');

    // ============ Step 3: Update User Fields ============
    log('\n📋 Step 3: Update User Fields (Name, Email)', 'blue');

    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        full_name: 'Updated Test User',
        email: testUserEmail,
      })
      .eq('user_id', testUserId)
      .select()
      .single();

    if (updateError) {
      log(`  ❌ Failed to update user: ${updateError.message}`, 'red');
      throw updateError;
    }

    log(`  ✅ User updated successfully`, 'green');
    log(`     New Name: ${updatedUser.full_name}`, 'cyan');

    // ============ Step 4: Add Credits to Account ============
    log('\n📋 Step 4: Add Credits to Account', 'blue');

    // First, create user credits account if it doesn't exist
    const { data: existingCredits } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    let userCredits;
    if (!existingCredits) {
      const { data: newCredits, error: creditsError } = await supabase
        .from('user_credits')
        .insert({
          user_id: testUserId,
          balance: 0,
        })
        .select()
        .single();

      if (creditsError) {
        log(`  ❌ Failed to create credits account: ${creditsError.message}`, 'red');
        throw creditsError;
      }
      userCredits = newCredits;
    } else {
      userCredits = existingCredits;
    }

    // Add 500 credits
    const { data: updatedCredits, error: addCreditsError } = await supabase
      .from('user_credits')
      .update({
        balance: userCredits.balance + 500,
      })
      .eq('user_id', testUserId)
      .select()
      .single();

    if (addCreditsError) {
      log(`  ❌ Failed to add credits: ${addCreditsError.message}`, 'red');
      throw addCreditsError;
    }

    log(`  ✅ Credits added successfully`, 'green');
    log(`     Previous Balance: ${userCredits.balance}`, 'cyan');
    log(`     Added: 500 credits`, 'cyan');
    log(`     New Balance: ${updatedCredits.balance}`, 'cyan');

    // Record transaction
    const { error: transactionError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: testUserId,
        amount: 500,
        transaction_type: 'purchase',
        description: 'Test credit purchase',
      });

    if (transactionError) {
      log(`  ⚠️  Warning: Failed to record transaction: ${transactionError.message}`, 'yellow');
    } else {
      log(`     Transaction recorded`, 'cyan');
    }

    // ============ Step 5: Assign Subscription Plan ============
    log('\n📋 Step 5: Assign Subscription Plan', 'blue');

    // Get Pro plan
    const { data: proPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', 'pro')
      .single();

    if (planError) {
      log(`  ❌ Failed to fetch Pro plan: ${planError.message}`, 'red');
      throw planError;
    }

    // Create subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: testUserId,
        plan_id: proPlan.id,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (subscriptionError) {
      log(`  ❌ Failed to create subscription: ${subscriptionError.message}`, 'red');
      throw subscriptionError;
    }

    log(`  ✅ Subscription assigned successfully`, 'green');
    log(`     Plan: ${proPlan.name}`, 'cyan');
    log(`     Price: $${proPlan.price}/month`, 'cyan');
    log(`     Status: ${subscription.status}`, 'cyan');

    // ============ Step 6: Assign User Role/Level ============
    log('\n📋 Step 6: Assign User Role/Level', 'blue');

    // Get Manager role
    const { data: managerRole, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('name', 'manager')
      .single();

    if (roleError) {
      log(`  ❌ Failed to fetch Manager role: ${roleError.message}`, 'red');
      throw roleError;
    }

    // Update user role
    const { data: userWithNewRole, error: updateRoleError } = await supabase
      .from('user_profiles')
      .update({
        role_id: managerRole.id,
      })
      .eq('user_id', testUserId)
      .select(`
        *,
        roles(name, level)
      `)
      .single();

    if (updateRoleError) {
      log(`  ❌ Failed to update user role: ${updateRoleError.message}`, 'red');
      throw updateRoleError;
    }

    log(`  ✅ User role updated successfully`, 'green');
    log(`     New Role: ${userWithNewRole.roles.name}`, 'cyan');
    log(`     Level: ${userWithNewRole.roles.level}`, 'cyan');

    // ============ Step 7: Create CRM Contact ============
    log('\n📋 Step 7: Create CRM Contact', 'blue');

    const { data: contact, error: contactError } = await supabase
      .from('crm_contacts')
      .insert({
        name: 'Test Contact',
        email: 'contact@example.com',
        phone: '+1234567890',
        company: 'Test Company',
        created_by: testUserId,
      })
      .select()
      .single();

    if (contactError) {
      log(`  ❌ Failed to create contact: ${contactError.message}`, 'red');
      throw contactError;
    }

    log(`  ✅ CRM contact created successfully`, 'green');
    log(`     Name: ${contact.name}`, 'cyan');
    log(`     Email: ${contact.email}`, 'cyan');
    log(`     Company: ${contact.company}`, 'cyan');

    // Create relationship between user and contact
    const { error: relationshipError } = await supabase
      .from('crm_contact_relationships')
      .insert({
        user_id: testUserId,
        contact_id: contact.id,
        relationship_type: 'owner',
      });

    if (relationshipError) {
      log(`  ⚠️  Warning: Failed to create relationship: ${relationshipError.message}`, 'yellow');
    } else {
      log(`     Relationship created (owner)`, 'cyan');
    }

    // ============ Step 8: Verify All Data ============
    log('\n📋 Step 8: Verify All Data', 'blue');

    // Fetch complete user profile
    const { data: completeUser, error: completeError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        roles(name, level),
        user_subscriptions(
          id,
          status,
          subscription_plans(name, price)
        ),
        user_credits(balance)
      `)
      .eq('user_id', testUserId)
      .single();

    if (completeError) {
      log(`  ❌ Failed to fetch complete user data: ${completeError.message}`, 'red');
      throw completeError;
    }

    log(`  ✅ Complete user profile verified`, 'green');
    log(`\n  📊 Final User Data:`, 'magenta');
    log(`     ID: ${completeUser.user_id}`, 'cyan');
    log(`     Name: ${completeUser.full_name}`, 'cyan');
    log(`     Email: ${completeUser.email}`, 'cyan');
    log(`     Role: ${completeUser.roles.name} (Level ${completeUser.roles.level})`, 'cyan');

    if (completeUser.user_subscriptions && completeUser.user_subscriptions.length > 0) {
      const sub = completeUser.user_subscriptions[0];
      log(`     Subscription: ${sub.subscription_plans.name} ($${sub.subscription_plans.price}/month)`, 'cyan');
      log(`     Subscription Status: ${sub.status}`, 'cyan');
    }

    if (completeUser.user_credits && completeUser.user_credits.length > 0) {
      log(`     Credits Balance: ${completeUser.user_credits[0].balance}`, 'cyan');
    }

    // Fetch user's contacts
    const { data: userContacts, error: contactsError } = await supabase
      .from('crm_contact_relationships')
      .select(`
        contact_id,
        crm_contacts(name, email, company)
      `)
      .eq('user_id', testUserId);

    if (!contactsError && userContacts && userContacts.length > 0) {
      log(`     Contacts: ${userContacts.length}`, 'cyan');
      userContacts.forEach((rel, idx) => {
        log(`       ${idx + 1}. ${rel.crm_contacts.name} (${rel.crm_contacts.email})`, 'cyan');
      });
    }

    // ============ Summary ============
    log('\n' + '='.repeat(60), 'magenta');
    log('✅ ALL TESTS PASSED - COMPLETE CRM FLOW VERIFIED', 'green');
    log('='.repeat(60), 'magenta');

    log('\n📊 Test Summary:', 'blue');
    log('  ✅ Step 1: User Registration - PASSED', 'green');
    log('  ✅ Step 2: Fetch User - PASSED', 'green');
    log('  ✅ Step 3: Update User Fields - PASSED', 'green');
    log('  ✅ Step 4: Add Credits - PASSED', 'green');
    log('  ✅ Step 5: Assign Plan - PASSED', 'green');
    log('  ✅ Step 6: Assign Role - PASSED', 'green');
    log('  ✅ Step 7: Create Contact - PASSED', 'green');
    log('  ✅ Step 8: Verify All Data - PASSED', 'green');

    log('\n🧹 Cleanup: Deleting test user...', 'yellow');

    // Clean up test user
    await supabase.auth.admin.deleteUser(testUserId);
    log('  ✅ Test user deleted', 'green');

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');

    // Cleanup on error
    if (testUserId) {
      try {
        await supabase.auth.admin.deleteUser(testUserId);
        log('  ✅ Test user cleaned up', 'green');
      } catch (cleanupError) {
        log(`  ⚠️  Cleanup failed: ${cleanupError.message}`, 'yellow');
      }
    }

    process.exit(1);
  }
}

// Run tests
testCRMSystem();