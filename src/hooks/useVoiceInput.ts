/**
 * useVoiceInput Hook
 * Web Speech API integration for voice-to-text input
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVoiceInputOptions {
  onTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  toggleRecording: () => void;
  resetTranscript: () => void;
}

export const useVoiceInput = (options: UseVoiceInputOptions = {}): UseVoiceInputReturn => {
  const {
    onTranscript,
    onError,
    continuous = true,
    interimResults = true,
    language = 'en-US',
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<any>(null);

  // Check if Web Speech API is supported
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsRecording(true);
        setError(null);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript((prev) => prev + finalTranscript);
          if (onTranscript) {
            onTranscript(finalTranscript);
          }
        }

        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        const errorMessage = `Speech recognition error: ${event.error}`;
        setError(errorMessage);
        setIsRecording(false);
        if (onError) {
          onError(errorMessage);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [continuous, interimResults, language, onTranscript, onError]);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      const errorMsg = 'Speech recognition is not supported in this browser';
      setError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
      return;
    }

    if (recognitionRef.current && !isRecording) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        const errorMsg = 'Failed to start speech recognition';
        setError(errorMsg);
        if (onError) {
          onError(errorMsg);
        }
      }
    }
  }, [isSupported, isRecording, onError]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
    resetTranscript,
  };
};

