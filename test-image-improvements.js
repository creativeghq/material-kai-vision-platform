/**
 * Test Script: Image Processing Improvements
 * 
 * Tests the following improvements:
 * 1. Semantic chunk linking for images
 * 2. Material property extraction
 * 3. Metadata extraction from chunks
 * 4. Image quality scoring
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testImageImprovements() {
  console.log('🧪 Testing Image Processing Improvements\n');

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ User not authenticated');
      return;
    }

    // Get workspace
    const { data: workspaceData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!workspaceData) {
      console.error('❌ No workspace found');
      return;
    }

    const workspaceId = workspaceData.workspace_id;
    console.log(`✅ Using workspace: ${workspaceId}\n`);

    // Test 1: Check image chunk relationships table
    console.log('📋 Test 1: Image Chunk Relationships Table');
    const { data: relationships, error: relError } = await supabase
      .from('image_chunk_relationships')
      .select('*')
      .limit(10);

    if (relError) {
      console.error('❌ Error querying relationships:', relError);
    } else {
      console.log(`✅ Found ${relationships?.length || 0} image-chunk relationships`);
      if (relationships && relationships.length > 0) {
        console.log(`   Sample: Image ${relationships[0].image_id.substring(0, 8)}... linked to ${relationships[0].chunk_id.substring(0, 8)}... (${Math.round(relationships[0].similarity_score * 100)}% match)`);
      }
    }

    // Test 2: Check for images with extracted metadata
    console.log('\n📋 Test 2: Images with Extracted Metadata');
    const { data: imagesWithMetadata } = await supabase
      .from('document_images')
      .select('id, caption, extracted_metadata, related_chunks_count')
      .eq('workspace_id', workspaceId)
      .not('extracted_metadata', 'is', null)
      .limit(5);

    if (imagesWithMetadata && imagesWithMetadata.length > 0) {
      console.log(`✅ Found ${imagesWithMetadata.length} images with extracted metadata`);
      imagesWithMetadata.forEach((img, idx) => {
        const metadata = img.extracted_metadata as any;
        console.log(`   Image ${idx + 1}: ${img.caption || 'Untitled'}`);
        console.log(`     - Related chunks: ${img.related_chunks_count || 0}`);
        if (metadata) {
          console.log(`     - Metadata keys: ${Object.keys(metadata).join(', ')}`);
        }
      });
    } else {
      console.log('⚠️  No images with extracted metadata found yet');
    }

    // Test 3: Check for images with material properties
    console.log('\n📋 Test 3: Images with Material Properties');
    const { data: imagesWithProperties } = await supabase
      .from('document_images')
      .select('id, caption, material_properties, quality_score')
      .eq('workspace_id', workspaceId)
      .not('material_properties', 'is', null)
      .limit(5);

    if (imagesWithProperties && imagesWithProperties.length > 0) {
      console.log(`✅ Found ${imagesWithProperties.length} images with material properties`);
      imagesWithProperties.forEach((img, idx) => {
        const props = img.material_properties as any;
        console.log(`   Image ${idx + 1}: ${img.caption || 'Untitled'}`);
        console.log(`     - Quality score: ${img.quality_score || 'N/A'}`);
        if (props) {
          const nonNullProps = Object.entries(props)
            .filter(([, v]) => v && v !== 'unknown')
            .map(([k]) => k);
          console.log(`     - Properties: ${nonNullProps.join(', ') || 'None extracted'}`);
        }
      });
    } else {
      console.log('⚠️  No images with material properties found yet');
    }

    // Test 4: Check specific image (24-25-133.jpg)
    console.log('\n📋 Test 4: Specific Image Analysis (24-25-133.jpg)');
    const { data: targetImage } = await supabase
      .from('document_images')
      .select('*')
      .eq('workspace_id', workspaceId)
      .ilike('caption', '%24-25-133%')
      .limit(1)
      .single();

    if (targetImage) {
      console.log(`✅ Found target image: ${targetImage.caption}`);
      console.log(`   - ID: ${targetImage.id}`);
      console.log(`   - Related chunks: ${targetImage.related_chunks_count || 0}`);
      console.log(`   - Quality score: ${targetImage.quality_score || 'N/A'}`);
      
      // Get related chunks
      const { data: relatedChunks } = await supabase
        .from('image_chunk_relationships')
        .select('chunk_id, similarity_score')
        .eq('image_id', targetImage.id)
        .order('similarity_score', { ascending: false });

      if (relatedChunks && relatedChunks.length > 0) {
        console.log(`   - Related chunks found: ${relatedChunks.length}`);
        relatedChunks.slice(0, 3).forEach((rel, idx) => {
          console.log(`     ${idx + 1}. Chunk ${rel.chunk_id.substring(0, 8)}... (${Math.round(rel.similarity_score * 100)}% match)`);
        });
      } else {
        console.log('   - No related chunks found');
      }

      // Check metadata
      if (targetImage.extracted_metadata) {
        const metadata = targetImage.extracted_metadata as any;
        console.log(`   - Extracted metadata: ${Object.keys(metadata).join(', ')}`);
      }

      // Check material properties
      if (targetImage.material_properties) {
        const props = targetImage.material_properties as any;
        const nonUnknown = Object.entries(props)
          .filter(([, v]) => v && v !== 'unknown')
          .map(([k, v]) => `${k}: ${v}`);
        console.log(`   - Material properties: ${nonUnknown.length > 0 ? nonUnknown.join(', ') : 'None extracted'}`);
      }
    } else {
      console.log('⚠️  Target image not found');
    }

    // Test 5: Statistics
    console.log('\n📊 Test 5: Overall Statistics');
    const { data: allImages } = await supabase
      .from('document_images')
      .select('id, related_chunks_count, quality_score, material_properties, extracted_metadata')
      .eq('workspace_id', workspaceId);

    if (allImages) {
      const withRelatedChunks = allImages.filter(img => (img.related_chunks_count || 0) > 0).length;
      const withMetadata = allImages.filter(img => img.extracted_metadata && Object.keys(img.extracted_metadata as any).length > 0).length;
      const withProperties = allImages.filter(img => img.material_properties && Object.keys(img.material_properties as any).length > 0).length;
      const avgQuality = allImages.reduce((sum, img) => sum + (img.quality_score || 0), 0) / allImages.length;

      console.log(`✅ Total images: ${allImages.length}`);
      console.log(`   - With related chunks: ${withRelatedChunks} (${Math.round(withRelatedChunks / allImages.length * 100)}%)`);
      console.log(`   - With extracted metadata: ${withMetadata} (${Math.round(withMetadata / allImages.length * 100)}%)`);
      console.log(`   - With material properties: ${withProperties} (${Math.round(withProperties / allImages.length * 100)}%)`);
      console.log(`   - Average quality score: ${avgQuality.toFixed(2)}`);
    }

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testImageImprovements();

