/**
 * Phase 3: Test Response Quality Metrics
 * 
 * Tests response quality evaluation including coherence, hallucination detection,
 * source attribution, and factual consistency
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Calculate coherence score
function calculateCoherence(text) {
  if (!text) return 0;

  const sentences = text.match(/[.!?]+/g) || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const avgWordsPerSentence = words.length / Math.max(1, sentences.length);

  let coherenceScore = 0.5;

  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25) {
    coherenceScore += 0.3;
  }

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 1) {
    coherenceScore += 0.2;
  }

  const transitionWords = ['therefore', 'however', 'moreover', 'furthermore', 'consequently', 'thus'];
  const hasTransitions = transitionWords.some(word => text.toLowerCase().includes(word));
  if (hasTransitions) {
    coherenceScore += 0.1;
  }

  return Math.min(coherenceScore, 1);
}

// Detect hallucinations
function detectHallucinations(responseText, sourceChunks) {
  if (!responseText || sourceChunks.length === 0) return 0.5;

  const responseWords = new Set(responseText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const sourceWords = new Set();

  for (const chunk of sourceChunks) {
    chunk.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) sourceWords.add(w);
    });
  }

  let coverage = 0;
  for (const word of responseWords) {
    if (sourceWords.has(word)) coverage++;
  }

  const coverageRatio = responseWords.size > 0 ? coverage / responseWords.size : 0;
  return Math.max(0, 1 - coverageRatio);
}

// Validate source attribution
function validateSourceAttribution(responseText) {
  const citationPatterns = [
    /\[source[:\s]*\d+\]/gi,
    /\(source[:\s]*\d+\)/gi,
    /according to/gi,
    /based on/gi,
    /from the document/gi,
  ];

  let citationCount = 0;
  for (const pattern of citationPatterns) {
    const matches = responseText.match(pattern);
    if (matches) citationCount += matches.length;
  }

  let attributionScore = 0.3;
  if (citationCount > 0) {
    attributionScore += Math.min(0.7, citationCount * 0.2);
  }

  return Math.min(attributionScore, 1);
}

// Check factual consistency
function checkFactualConsistency(responseText) {
  const contradictionPatterns = [
    /however.*(?:contradicts|conflicts|disagrees)/gi,
    /but.*(?:actually|in fact|really)/gi,
    /despite.*(?:claims|states|says)/gi,
  ];

  let contradictionCount = 0;
  for (const pattern of contradictionPatterns) {
    const matches = responseText.match(pattern);
    if (matches) contradictionCount += matches.length;
  }

  const consistency = 1 - (contradictionCount * 0.1);
  return Math.max(0, Math.min(consistency, 1));
}

async function testResponseQuality() {
  try {
    console.log('📝 Phase 3: Testing Response Quality Metrics\n');

    // Test responses
    const testResponses = [
      {
        query: 'What are the material properties?',
        response: 'According to the document, the material has excellent durability. The fabric is resistant to wear and tear. Furthermore, it maintains its color over time. Based on the specifications, the material is suitable for high-traffic areas.',
        sources: ['The material has excellent durability', 'The fabric is resistant to wear and tear', 'The material is suitable for high-traffic areas'],
      },
      {
        query: 'What colors are available?',
        response: 'The available colors include red, blue, and green. However, the document states that only blue and green are in stock. The red color is currently unavailable.',
        sources: ['The available colors include red, blue, and green', 'Only blue and green are in stock'],
      },
      {
        query: 'What is the price?',
        response: 'xyz123 price information not found in sources',
        sources: ['Price: $50 per unit', 'Bulk discount available'],
      },
    ];

    console.log('📈 Evaluating response quality:\n');

    let totalCoherence = 0;
    let totalHallucination = 0;
    let totalAttribution = 0;
    let totalConsistency = 0;

    for (let i = 0; i < testResponses.length; i++) {
      const test = testResponses[i];
      const responseId = `test-response-${i + 1}`;

      const coherence = calculateCoherence(test.response);
      const hallucination = detectHallucinations(test.response, test.sources);
      const attribution = validateSourceAttribution(test.response);
      const consistency = checkFactualConsistency(test.response);

      const overallScore = (
        coherence * 0.25 +
        (1 - hallucination) * 0.35 +
        attribution * 0.20 +
        consistency * 0.20
      );

      let assessment = 'Excellent';
      if (overallScore < 0.9) assessment = 'Very Good';
      if (overallScore < 0.8) assessment = 'Good';
      if (overallScore < 0.7) assessment = 'Fair';
      if (overallScore < 0.6) assessment = 'Poor';

      console.log(`${i + 1}. Query: "${test.query}"`);
      console.log(`   Response: "${test.response.substring(0, 60)}..."`);
      console.log(`   Coherence: ${(coherence * 100).toFixed(1)}%`);
      console.log(`   Hallucination: ${(hallucination * 100).toFixed(1)}%`);
      console.log(`   Attribution: ${(attribution * 100).toFixed(1)}%`);
      console.log(`   Consistency: ${(consistency * 100).toFixed(1)}%`);
      console.log(`   Overall Score: ${(overallScore * 100).toFixed(1)}% (${assessment})\n`);

      // Store metrics
      const { error: insertError } = await supabase
        .from('response_quality_metrics')
        .insert({
          response_id: responseId,
          query: test.query,
          response_text: test.response,
          coherence_score: coherence,
          hallucination_score: hallucination,
          source_attribution_score: attribution,
          factual_consistency_score: consistency,
          overall_quality_score: overallScore,
          quality_assessment: assessment,
          issues_detected: [],
        });

      if (insertError) {
        console.error(`   ❌ Error storing metrics: ${insertError.message}`);
      } else {
        console.log(`   ✅ Metrics stored\n`);
      }

      totalCoherence += coherence;
      totalHallucination += hallucination;
      totalAttribution += attribution;
      totalConsistency += consistency;
    }

    // Calculate averages
    const count = testResponses.length;
    console.log('📊 Average Metrics Across All Responses:');
    console.log(`   Average Coherence: ${((totalCoherence / count) * 100).toFixed(1)}%`);
    console.log(`   Average Hallucination: ${((totalHallucination / count) * 100).toFixed(1)}%`);
    console.log(`   Average Attribution: ${((totalAttribution / count) * 100).toFixed(1)}%`);
    console.log(`   Average Consistency: ${((totalConsistency / count) * 100).toFixed(1)}%\n`);

    // Get stored metrics
    console.log('📋 Retrieving stored metrics from database...');
    const { data: storedMetrics, error: fetchError } = await supabase
      .from('response_quality_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!fetchError && storedMetrics) {
      console.log(`✅ Retrieved ${storedMetrics.length} metric records\n`);
    }

    console.log('✅ Phase 3 Response Quality Test Complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testResponseQuality();

