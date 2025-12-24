// Debug utility to test CORS issues in the browser
export async function debugCORSIssue() {
  console.log('🔍 CORS Debug - Environment Check');

  // Check environment variables
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('  VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.error('  VITE_SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Missing');
    return {
      success: false,
      error: 'Missing Supabase environment variables. Please check your .env file.'
    };
  }

  console.log('Environment Variables:');
  console.log('  VITE_SUPABASE_URL:', supabaseUrl);
  console.log(
    '  VITE_SUPABASE_ANON_KEY:',
    supabaseKey.substring(0, 50) + '...',
  );
  console.log('  Current Origin:', window.location.origin);
  console.log('  User Agent:', navigator.userAgent);

  const url = `${supabaseUrl}/functions/v1/mivaa-gateway`;
  console.log('  Target URL:', url);

  // Test 1: OPTIONS request
  try {
    console.log('\n🔍 Test 1: OPTIONS Request');
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: window.location.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });

    console.log(
      '  Status:',
      optionsResponse.status,
      optionsResponse.statusText,
    );
    console.log('  CORS Headers:');
    for (const [key, value] of optionsResponse.headers.entries()) {
      if (key.toLowerCase().includes('access-control')) {
        console.log('    ' + key + ':', value);
      }
    }

    if (!optionsResponse.ok) {
      console.log('  ❌ OPTIONS failed');
      return { success: false, error: 'OPTIONS request failed' };
    }
  } catch (error) {
    console.log('  ❌ OPTIONS Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `OPTIONS error: ${errorMessage}` };
  }

  // Test 2: Actual POST request
  try {
    console.log('\n🔍 Test 2: POST Request');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {},
      }),
    });

    console.log('  Status:', response.status, response.statusText);
    console.log('  Response Headers:');
    for (const [key, value] of response.headers.entries()) {
      if (
        key.toLowerCase().includes('access-control') ||
        key.toLowerCase().includes('content-type')
      ) {
        console.log('    ' + key + ':', value);
      }
    }

    if (response.ok) {
      const data = await response.json();
      console.log('  ✅ Success:', data);
      return { success: true, data };
    } else {
      const text = await response.text();
      console.log('  ❌ Error Response:', text);
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
  } catch (error) {
    console.log('  ❌ POST Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      '  Error Type:',
      error instanceof Error ? error.constructor.name : typeof error,
    );
    console.log('  Error Message:', errorMessage);

    if (errorMessage.includes('CORS')) {
      console.log('  🚨 CORS Error Detected');
      console.log('  This suggests the browser is blocking the request');
      console.log(
        '  Even though our tests show the server has proper CORS headers',
      );
    }

    return { success: false, error: `POST error: ${errorMessage}` };
  }
}

// Test function that can be called from browser console
(window as any).debugCORS = debugCORSIssue;

// Auto-run on load for debugging
if (typeof window !== 'undefined') {
  console.log('🔧 CORS Debug utility loaded. Call debugCORS() to test.');
}
