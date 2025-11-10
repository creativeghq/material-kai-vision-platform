/**
 * Test script for DemoAgent
 * Run: node test-demo-agent.js
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc3MDI4NzAsImV4cCI6MjA0MzI3ODg3MH0.yqVLHddivizija_Uw-Uw9vYGxKqJZ5vZQxGxKqJZ5vZQxGxKqJZ5vZQxG';

async function testDemoAgent() {
  console.log('🧪 Testing DemoAgent...\n');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Return for me Cement Based tiles color grey' }
        ],
        agentId: 'demo'
      })
    });

    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('\n📦 Response Data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.log('\n❌ ERROR DETAILS:');
      console.log('Message:', data.error.message);
      console.log('Stack:', data.error.stack);
    } else {
      console.log('\n✅ SUCCESS!');
      console.log('Response:', data.text);
    }
  } catch (error) {
    console.error('\n💥 FETCH ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDemoAgent();

