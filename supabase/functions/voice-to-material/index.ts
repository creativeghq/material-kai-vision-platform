import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface VoiceToMaterialRequest {
  audio_data?: string; // Base64 encoded audio data
  audio_url?: string; // URL to audio file
  audio_format?: 'mp3' | 'wav' | 'ogg' | 'webm' | 'm4a';
  language?: string; // Language code (e.g., 'en', 'es', 'fr')
  processing_options?: {
    transcription_model?: 'whisper-1' | 'whisper-large';
    enable_speaker_detection?: boolean;
    enable_sentiment_analysis?: boolean;
    enable_keyword_extraction?: boolean;
    material_focus?: string[]; // Focus on specific material types
  };
  output_format?: 'structured' | 'summary' | 'detailed';
  user_id?: string;
}

interface TranscriptionSegment {
  start_time: number;
  end_time: number;
  text: string;
  confidence: number;
  speaker_id?: string;
  sentiment?: {
    polarity: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
}

interface MaterialMention {
  material_name: string;
  material_type: string;
  confidence: number;
  context: string;
  timestamp: number;
  properties_mentioned: string[];
  applications_mentioned: string[];
}

interface VoiceToMaterialResult {
  transcription: {
    full_text: string;
    segments: TranscriptionSegment[];
    language_detected: string;
    duration_seconds: number;
    word_count: number;
  };
  material_analysis: {
    materials_identified: MaterialMention[];
    material_categories: Record<string, number>;
    key_topics: string[];
    technical_terms: string[];
    confidence_score: number;
  };
  audio_analysis: {
    speaker_count: number;
    audio_quality: 'excellent' | 'good' | 'fair' | 'poor';
    background_noise_level: 'low' | 'medium' | 'high';
    speech_rate: number; // words per minute
    pause_analysis: {
      total_pauses: number;
      avg_pause_duration: number;
      longest_pause: number;
    };
  };
  insights: {
    material_recommendations: {
      material: string;
      reason: string;
      confidence: number;
    }[];
    knowledge_gaps: string[];
    follow_up_questions: string[];
    related_research_topics: string[];
  };
  metadata: {
    processing_time_ms: number;
    audio_duration_ms: number;
    transcription_model: string;
    analysis_timestamp: string;
  };
}

// OpenAI API configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

async function transcribeAudio(audioData: Uint8Array, format: string, language?: string): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    // Create form data for OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioData as BlobPart], { type: `audio/${format}` });
    formData.append('file', audioBlob, `audio.${format}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    if (language) {
      formData.append('language', language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Whisper API error: ${response.status} - ${error}`);
    }

    const transcriptionData = await response.json();
    return transcriptionData;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}

async function analyzeMaterialContent(text: string, processingOptions: any): Promise<any> {
  // Material keywords and patterns
  const materialKeywords = {
    metals: ['steel', 'aluminum', 'copper', 'titanium', 'iron', 'brass', 'bronze', 'nickel', 'zinc'],
    polymers: ['plastic', 'polymer', 'polyethylene', 'polypropylene', 'PVC', 'nylon', 'acrylic', 'silicone'],
    ceramics: ['ceramic', 'porcelain', 'alumina', 'zirconia', 'silicon carbide', 'glass'],
    composites: ['carbon fiber', 'fiberglass', 'composite', 'laminate', 'reinforced'],
    textiles: ['cotton', 'wool', 'silk', 'polyester', 'nylon', 'fabric', 'textile', 'fiber'],
    wood: ['wood', 'timber', 'oak', 'pine', 'maple', 'bamboo', 'plywood'],
    concrete: ['concrete', 'cement', 'mortar', 'aggregate', 'rebar'],
    electronic: ['semiconductor', 'silicon', 'gallium', 'germanium', 'conductor', 'insulator'],
  };

  const propertyKeywords = [
    'strength', 'hardness', 'flexibility', 'durability', 'conductivity', 'resistance',
    'density', 'weight', 'temperature', 'corrosion', 'wear', 'fatigue', 'elastic',
    'thermal', 'electrical', 'magnetic', 'optical', 'chemical', 'mechanical',
  ];

  const applicationKeywords = [
    'automotive', 'aerospace', 'construction', 'electronics', 'medical', 'packaging',
    'furniture', 'clothing', 'sports', 'marine', 'industrial', 'consumer',
  ];

  const materialsIdentified: MaterialMention[] = [];
  const materialCategories: Record<string, number> = {};
  const keyTopics: string[] = [];
  const technicalTerms: string[] = [];

  // Analyze text for material mentions
  const words = text.toLowerCase().split(/\s+/);
  const sentences = text.split(/[.!?]+/);

  // Find material mentions
  Object.entries(materialKeywords).forEach(([category, keywords]) => {
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = text.match(regex);

      if (matches) {
        materialCategories[category] = (materialCategories[category] || 0) + matches.length;

        // Find context for each mention
        sentences.forEach((sentence, index) => {
          if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
            const propertiesMentioned = propertyKeywords.filter(prop =>
              sentence.toLowerCase().includes(prop),
            );

            const applicationsMentioned = applicationKeywords.filter(app =>
              sentence.toLowerCase().includes(app),
            );

            materialsIdentified.push({
              material_name: keyword,
              material_type: category,
              confidence: 0.8 + (propertiesMentioned.length * 0.05),
              context: sentence.trim(),
              timestamp: index * 5, // Approximate timestamp
              properties_mentioned: propertiesMentioned,
              applications_mentioned: applicationsMentioned,
            });
          }
        });
      }
    });
  });

  // Extract key topics
  const topicPatterns = [
    /material\s+selection/gi,
    /performance\s+testing/gi,
    /quality\s+control/gi,
    /manufacturing\s+process/gi,
    /cost\s+analysis/gi,
    /sustainability/gi,
    /recycling/gi,
    /environmental\s+impact/gi,
  ];

  topicPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      keyTopics.push(...matches.map(match => match.toLowerCase()));
    }
  });

  // Extract technical terms
  const technicalPatterns = [
    /\b[A-Z]{2,}\b/g, // Acronyms
    /\d+\s*(MPa|GPa|kPa|PSI|°C|°F|K)/gi, // Units
    /ISO\s+\d+/gi, // Standards
    /ASTM\s+[A-Z]\d+/gi, // ASTM standards
  ];

  technicalPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      technicalTerms.push(...matches);
    }
  });

  const confidenceScore = Math.min(
    0.5 + (materialsIdentified.length * 0.1) + (keyTopics.length * 0.05),
    1.0,
  );

  return {
    materials_identified: materialsIdentified.slice(0, 20), // Limit results
    material_categories: materialCategories,
    key_topics: [...new Set(keyTopics)].slice(0, 10),
    technical_terms: [...new Set(technicalTerms)].slice(0, 15),
    confidence_score: confidenceScore,
  };
}

function analyzeAudioQuality(segments: TranscriptionSegment[]): any {
  // Simulate audio quality analysis based on transcription confidence
  const avgConfidence = segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length;

  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (avgConfidence > 0.9) quality = 'excellent';
  else if (avgConfidence > 0.8) quality = 'good';
  else if (avgConfidence > 0.6) quality = 'fair';
  else quality = 'poor';

  // Calculate speech rate
  const totalWords = segments.reduce((sum, seg) => sum + seg.text.split(' ').length, 0);
  const totalDuration = segments.length > 0 ? segments[segments.length - 1].end_time : 0;
  const speechRate = totalDuration > 0 ? (totalWords / totalDuration) * 60 : 0;

  // Analyze pauses
  const pauses: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    const pauseDuration = segments[i].start_time - segments[i - 1].end_time;
    if (pauseDuration > 0.5) { // Pauses longer than 0.5 seconds
      pauses.push(pauseDuration);
    }
  }

  return {
    speaker_count: 1, // Simplified for demo
    audio_quality: quality,
    background_noise_level: avgConfidence > 0.8 ? 'low' : avgConfidence > 0.6 ? 'medium' : 'high',
    speech_rate: Math.round(speechRate),
    pause_analysis: {
      total_pauses: pauses.length,
      avg_pause_duration: pauses.length > 0 ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0,
      longest_pause: pauses.length > 0 ? Math.max(...pauses) : 0,
    },
  };
}

function generateInsights(materialAnalysis: any, transcription: any): any {
  const recommendations: Array<{material: string, reason: string, confidence: number}> = [];
  const knowledgeGaps: string[] = [];
  const followUpQuestions: string[] = [];
  const relatedTopics: string[] = [];

  // Generate material recommendations
  Object.entries(materialAnalysis.material_categories).forEach(([category, count]) => {
    if ((count as number) > 2) {
      recommendations.push({
        material: `Advanced ${category}`,
        reason: `High interest in ${category} materials detected`,
        confidence: 0.8,
      });
    }
  });

  // Identify knowledge gaps
  if (materialAnalysis.materials_identified.length < 3) {
    knowledgeGaps.push('Limited material variety discussed');
  }

  if (materialAnalysis.technical_terms.length < 5) {
    knowledgeGaps.push('Few technical specifications mentioned');
  }

  // Generate follow-up questions
  followUpQuestions.push(
    'What specific performance requirements are most critical?',
    'Have you considered environmental impact and sustainability?',
    'What is the target cost range for this application?',
    'Are there any regulatory standards that must be met?',
  );

  // Related research topics
  relatedTopics.push(
    'Material lifecycle assessment',
    'Cost-performance optimization',
    'Sustainable material alternatives',
    'Quality testing methodologies',
    'Supply chain considerations',
  );

  return {
    material_recommendations: recommendations.slice(0, 5),
    knowledge_gaps: knowledgeGaps,
    follow_up_questions: followUpQuestions.slice(0, 4),
    related_research_topics: relatedTopics.slice(0, 5),
  };
}

async function processVoiceToMaterial(request: VoiceToMaterialRequest): Promise<VoiceToMaterialResult> {
  const startTime = Date.now();

  try {
    console.log('Processing voice to material analysis');

    // Get audio data
    let audioData: Uint8Array;
    let audioFormat = request.audio_format || 'mp3';

    if (request.audio_data) {
      // Decode base64 audio data
      const binaryString = atob(request.audio_data);
      audioData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        audioData[i] = binaryString.charCodeAt(i);
      }
    } else if (request.audio_url) {
      // Fetch audio from URL
      const response = await fetch(request.audio_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      audioData = new Uint8Array(await response.arrayBuffer());
    } else {
      throw new Error('Either audio_data or audio_url must be provided');
    }

    // Transcribe audio using OpenAI Whisper
    const transcriptionData = await transcribeAudio(audioData, audioFormat, request.language);

    // Process transcription segments
    const segments: TranscriptionSegment[] = transcriptionData.segments?.map((seg: any) => ({
      start_time: seg.start,
      end_time: seg.end,
      text: seg.text,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.8,
      speaker_id: 'speaker_1', // Simplified for demo
    })) || [];

    // Analyze material content
    const materialAnalysis = await analyzeMaterialContent(
      transcriptionData.text,
      request.processing_options || {},
    );

    // Analyze audio quality
    const audioAnalysis = analyzeAudioQuality(segments);

    // Generate insights
    const insights = generateInsights(materialAnalysis, transcriptionData);

    const processingTime = Date.now() - startTime;

    const result: VoiceToMaterialResult = {
      transcription: {
        full_text: transcriptionData.text,
        segments: segments,
        language_detected: transcriptionData.language || request.language || 'en',
        duration_seconds: transcriptionData.duration || 0,
        word_count: transcriptionData.text.split(/\s+/).length,
      },
      material_analysis: materialAnalysis,
      audio_analysis: audioAnalysis,
      insights: insights,
      metadata: {
        processing_time_ms: processingTime,
        audio_duration_ms: (transcriptionData.duration || 0) * 1000,
        transcription_model: request.processing_options?.transcription_model || 'whisper-1',
        analysis_timestamp: new Date().toISOString(),
      },
    };

    // Store analysis results
    await supabase
      .from('voice_analysis_results')
      .insert({
        transcription_text: result.transcription.full_text,
        materials_identified: materialAnalysis.materials_identified,
        material_categories: materialAnalysis.material_categories,
        audio_duration: result.transcription.duration_seconds,
        processing_time_ms: processingTime,
        confidence_score: materialAnalysis.confidence_score,
        user_id: request.user_id,
        created_at: new Date().toISOString(),
      });

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'voice_to_material_analysis',
          event_data: {
            audio_duration: result.transcription.duration_seconds,
            word_count: result.transcription.word_count,
            materials_found: materialAnalysis.materials_identified.length,
            confidence_score: materialAnalysis.confidence_score,
            processing_time_ms: processingTime,
            language: result.transcription.language_detected,
          },
        });
    }

    return result;

  } catch (error) {
    console.error('Voice to material analysis error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: VoiceToMaterialRequest = await req.json();

    console.log('Processing voice to material request:', {
      has_audio_data: !!request.audio_data,
      has_audio_url: !!request.audio_url,
      audio_format: request.audio_format,
      language: request.language,
      processing_options: request.processing_options,
    });

    if (!request.audio_data && !request.audio_url) {
      return new Response(
        JSON.stringify({ error: 'Either audio_data or audio_url is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (request.audio_format && !['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(request.audio_format)) {
      return new Response(
        JSON.stringify({ error: 'Invalid audio_format. Must be one of: mp3, wav, ogg, webm, m4a' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processVoiceToMaterial(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Voice to material analysis error:', error);

    return new Response(
      JSON.stringify({
        error: 'Voice to material analysis failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
