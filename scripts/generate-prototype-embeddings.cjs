/**
 * Generate 512D CLIP text embeddings for all prototype values
 * 
 * This script:
 * 1. Fetches all properties with prototype_descriptions from Supabase
 * 2. Generates 512D text embeddings using OpenAI API
 * 3. Stores embeddings in text_embedding_512 column
 */

const https = require('https');

// Configuration from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;

if (!SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: SUPABASE_SERVICE_ROLE_KEY, VITE_OPENAI_API_KEY');
  process.exit(1);
}

/**
 * Generate 512D text embedding using OpenAI
 */
async function generateEmbedding512D(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8191),
      encoding_format: 'float',
      dimensions: 512
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(body);
          resolve(response.data[0].embedding);
        } else {
          reject(new Error(`OpenAI API error: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Fetch properties with prototypes from Supabase
 */
async function fetchPropertiesWithPrototypes() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: '/rest/v1/material_properties?select=id,property_key,name,prototype_descriptions&prototype_descriptions=not.is.null',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    };

    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Supabase API error: ${res.statusCode} - ${body}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Update property with embedding
 */
async function updatePropertyEmbedding(propertyId, embedding) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text_embedding_512: `[${embedding.join(',')}]`,
      prototype_updated_at: new Date().toISOString()
    });

    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/material_properties?id=eq.${propertyId}`,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 204) {
        resolve();
      } else {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => reject(new Error(`Update failed: ${res.statusCode} - ${body}`)));
      }
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Generating CLIP embeddings for prototype values...\n');

  // Fetch properties
  const properties = await fetchPropertiesWithPrototypes();
  console.log(`   Found ${properties.length} properties with prototypes\n`);

  let successCount = 0;

  for (const prop of properties) {
    console.log(`📝 Processing: ${prop.name} (${prop.property_key})`);
    console.log(`   Prototype values: ${Object.keys(prop.prototype_descriptions).length}`);

    // Collect all text variations
    const allTexts = [];
    for (const [prototypeValue, variations] of Object.entries(prop.prototype_descriptions)) {
      allTexts.push(prototypeValue);
      allTexts.push(...variations);
    }

    console.log(`   Total text variations: ${allTexts.length}`);

    // Generate combined embedding
    const combinedText = allTexts.slice(0, 50).join(', ');
    console.log(`   Generating 512D embedding...`);

    try {
      const embedding = await generateEmbedding512D(combinedText);
      await updatePropertyEmbedding(prop.id, embedding);
      successCount++;
      console.log(`   ✅ Embedding generated and stored (${embedding.length}D)\n`);
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}\n`);
    }
  }

  console.log(`✅ Complete!`);
  console.log(`   Total embeddings generated: ${successCount}/${properties.length}`);
}

main().catch(console.error);

