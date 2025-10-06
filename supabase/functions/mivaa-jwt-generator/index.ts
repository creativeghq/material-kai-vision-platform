import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface JWTPayload {
  sub?: string; // Subject (user ID)
  iss?: string; // Issuer
  aud?: string; // Audience
  exp?: number; // Expiration time
  iat?: number; // Issued at
  nbf?: number; // Not before
  jti?: string; // JWT ID
  // Custom claims for MIVAA
  api_key?: string;
  service?: string;
  permissions?: string[];
  user_id?: string;
  organization?: string;
}

// Base64 URL encode function
function base64UrlEncode(data: string): string {
  return btoa(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Create HMAC SHA256 signature
async function createSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = new Uint8Array(signature);
  const signatureString = String.fromCharCode(...signatureArray);
  
  return base64UrlEncode(signatureString);
}

// Generate JWT token
async function generateJWT(payload: JWTPayload, secret: string): Promise<string> {
  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  // Current timestamp
  const now = Math.floor(Date.now() / 1000);
  
  // Complete payload with standard claims
  const completePayload: JWTPayload = {
    iss: 'material-kai-vision-platform', // Issuer
    aud: 'mivaa-service', // Audience
    iat: now, // Issued at
    exp: now + (24 * 60 * 60), // Expires in 24 hours
    jti: crypto.randomUUID(), // JWT ID
    ...payload
  };
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  
  // Create signature
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = await createSignature(dataToSign, secret);
  
  // Return complete JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Verify JWT token
async function verifyJWT(token: string, secret: string): Promise<{ valid: boolean; payload?: JWTPayload; error?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = await createSignature(dataToSign, secret);
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Decode payload
    const payloadJson = atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const payload: JWTPayload = JSON.parse(payloadJson);
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true, payload };
    
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get JWT secret from environment
    const JWT_SECRET = Deno.env.get('MIVAA_JWT_SECRET') || 'default-secret-change-in-production';
    
    // Parse request
    const { action, payload = {} } = await req.json();
    
    console.log(`🔧 JWT Generator: ${action}`);

    switch (action) {
      case 'generate': {
        // Generate new JWT token
        const {
          user_id,
          api_key,
          service = 'mivaa',
          permissions = ['read', 'write'],
          organization = 'material-kai-vision-platform',
          custom_claims = {}
        } = payload;

        const jwtPayload: JWTPayload = {
          sub: user_id || 'system',
          api_key: api_key,
          service: service,
          permissions: permissions,
          user_id: user_id,
          organization: organization,
          ...custom_claims
        };

        const token = await generateJWT(jwtPayload, JWT_SECRET);
        
        // Log token generation
        try {
          await supabase
            .from('jwt_tokens_log')
            .insert({
              action: 'generate',
              user_id: user_id,
              service: service,
              expires_at: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
              created_at: new Date().toISOString()
            });
        } catch (logError) {
          console.warn('Failed to log JWT generation:', logError);
        }

        return new Response(JSON.stringify({
          success: true,
          data: {
            token: token,
            expires_in: 24 * 60 * 60, // 24 hours in seconds
            token_type: 'Bearer',
            payload: jwtPayload
          },
          metadata: {
            timestamp: new Date().toISOString(),
            action: 'generate',
            service: service
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'verify': {
        // Verify existing JWT token
        const { token } = payload;
        
        if (!token) {
          throw new Error('Token is required for verification');
        }

        const verification = await verifyJWT(token, JWT_SECRET);
        
        return new Response(JSON.stringify({
          success: verification.valid,
          data: {
            valid: verification.valid,
            payload: verification.payload,
            error: verification.error
          },
          metadata: {
            timestamp: new Date().toISOString(),
            action: 'verify'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'refresh': {
        // Refresh existing JWT token
        const { token } = payload;
        
        if (!token) {
          throw new Error('Token is required for refresh');
        }

        const verification = await verifyJWT(token, JWT_SECRET);
        
        if (!verification.valid) {
          throw new Error(`Cannot refresh invalid token: ${verification.error}`);
        }

        // Generate new token with same payload but updated timestamps
        const newPayload = {
          ...verification.payload,
          iat: undefined, // Will be set by generateJWT
          exp: undefined, // Will be set by generateJWT
          jti: undefined  // Will be set by generateJWT
        };

        const newToken = await generateJWT(newPayload, JWT_SECRET);
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            token: newToken,
            expires_in: 24 * 60 * 60,
            token_type: 'Bearer',
            payload: newPayload
          },
          metadata: {
            timestamp: new Date().toISOString(),
            action: 'refresh'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'mivaa_token': {
        // Generate specific token for MIVAA service
        const {
          user_id = 'material-kai-platform',
          api_key = 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e'
        } = payload;

        const mivaaPayload: JWTPayload = {
          sub: user_id,
          api_key: api_key,
          service: 'mivaa',
          permissions: ['material_recognition', 'semantic_search', 'pdf_processing'],
          user_id: user_id,
          organization: 'material-kai-vision-platform',
          scope: 'api:read api:write'
        };

        const token = await generateJWT(mivaaPayload, JWT_SECRET);
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            token: token,
            expires_in: 24 * 60 * 60,
            token_type: 'Bearer',
            usage: 'Set this as MIVAA_API_KEY in Supabase environment',
            payload: mivaaPayload
          },
          metadata: {
            timestamp: new Date().toISOString(),
            action: 'mivaa_token',
            service: 'mivaa'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('JWT Generator error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        type: 'jwt_generation_error',
        timestamp: new Date().toISOString(),
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
