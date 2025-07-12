/**
 * Voice to Material Service
 * Connects to the voice-to-material edge function for voice recognition and material search
 */

import { supabase } from "@/integrations/supabase/client";

export interface VoiceToMaterialRequest {
  audio_data?: string; // base64 encoded audio
  audio_url?: string;
  language?: string;
  context?: 'search' | 'description' | 'properties' | 'general';
  user_id?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  processing_time_ms: number;
}

export interface MaterialSuggestion {
  material_id: string;
  material_name: string;
  confidence: number;
  reasoning: string;
  category: string;
  properties_match: Record<string, any>;
}

export interface VoiceToMaterialResult {
  success: boolean;
  request_id: string;
  transcription: TranscriptionResult;
  material_suggestions: MaterialSuggestion[];
  search_query: string;
  intent_analysis: {
    intent_type: 'search' | 'describe' | 'compare' | 'identify';
    confidence: number;
    extracted_properties: Record<string, any>;
    extracted_keywords: string[];
  };
  processing_time_ms: number;
}

class VoiceToMaterialService {
  
  /**
   * Process voice input and find matching materials
   */
  async processVoiceInput(request: VoiceToMaterialRequest): Promise<VoiceToMaterialResult> {
    try {
      console.log('Processing voice input for material search');

      const { data, error } = await supabase.functions.invoke('voice-to-material', {
        body: {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          ...request
        }
      });

      if (error) {
        console.error('Voice to material error:', error);
        throw new Error(`Voice processing failed: ${error.message}`);
      }

      return data as VoiceToMaterialResult;

    } catch (error) {
      console.error('Error in voice to material processing:', error);
      throw error;
    }
  }

  /**
   * Record and process voice input using Web Audio API
   */
  async recordAndProcess(
    duration: number = 5000, // 5 seconds default
    context: 'search' | 'description' | 'properties' | 'general' = 'search'
  ): Promise<VoiceToMaterialResult> {
    return new Promise(async (resolve, reject) => {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          }
        });

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        const audioChunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          try {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioData = await this.blobToBase64(audioBlob);
            
            const result = await this.processVoiceInput({
              audio_data: audioData,
              context: context,
              language: 'en'
            });

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };

        mediaRecorder.onerror = (event) => {
          stream.getTracks().forEach(track => track.stop());
          reject(new Error('Recording failed'));
        };

        // Start recording
        mediaRecorder.start();

        // Stop recording after specified duration
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, duration);

      } catch (error) {
        console.error('Error accessing microphone:', error);
        reject(new Error('Microphone access denied or not available'));
      }
    });
  }

  /**
   * Process uploaded audio file
   */
  async processAudioFile(file: File, context: string = 'search'): Promise<VoiceToMaterialResult> {
    try {
      const audioData = await this.fileToBase64(file);
      
      return this.processVoiceInput({
        audio_data: audioData,
        context: context as any,
        language: 'en'
      });
    } catch (error) {
      console.error('Error processing audio file:', error);
      throw error;
    }
  }

  /**
   * Get voice search history for user
   */
  async getVoiceSearchHistory(limit: number = 20): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('search_analytics')
        .select('*')
        .eq('query_text', 'voice_search')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];

    } catch (error) {
      console.error('Error getting voice search history:', error);
      throw error;
    }
  }

  /**
   * Convert File to base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  /**
   * Convert Blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  /**
   * Check microphone availability
   */
  async checkMicrophoneAvailability(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Error checking microphone availability:', error);
      return false;
    }
  }

  /**
   * Start continuous voice recognition (for real-time search)
   */
  startContinuousRecognition(
    onResult: (result: VoiceToMaterialResult) => void,
    onError: (error: Error) => void
  ): () => void {
    let isActive = true;
    let mediaRecorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;

    const startRecognition = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        const audioChunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          if (!isActive) return;

          try {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioData = await this.blobToBase64(audioBlob);
            
            const result = await this.processVoiceInput({
              audio_data: audioData,
              context: 'search',
              language: 'en'
            });

            onResult(result);
            
            // Restart recognition
            setTimeout(startRecognition, 100);
          } catch (error) {
            onError(error as Error);
          }
        };

        mediaRecorder.start();
        
        // Record in 3-second chunks
        setTimeout(() => {
          if (mediaRecorder && isActive) {
            mediaRecorder.stop();
          }
        }, 3000);

      } catch (error) {
        onError(error as Error);
      }
    };

    startRecognition();

    // Return stop function
    return () => {
      isActive = false;
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }
}

// Export singleton instance
export const voiceToMaterialService = new VoiceToMaterialService();
export { VoiceToMaterialService };