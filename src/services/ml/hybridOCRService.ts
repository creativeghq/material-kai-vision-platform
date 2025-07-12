import { OCRService, OCRResult, OCROptions } from './ocrService';
import { ServerMLService } from './serverMLService';
import { MLResult } from './types';
import { DeviceDetector } from './deviceDetector';
import { huggingFaceService } from './huggingFaceService';

export interface HybridOCROptions extends OCROptions {
  forceServerProcessing?: boolean;
  forceClientProcessing?: boolean;
  documentType?: 'certificate' | 'label' | 'specification' | 'general';
  materialContext?: string;
  maxFileSize?: number; // MB
}

export interface HybridOCRResult extends OCRResult {
  processingMethod: 'client' | 'server' | 'hybrid';
  fallbackUsed?: boolean;
  recommendation?: string;
  structuredData?: any;
  documentType?: string;
}

export class HybridOCRService {
  private static readonly MAX_CLIENT_FILE_SIZE = 5; // MB
  private static readonly MIN_SERVER_FILE_SIZE = 0.5; // MB

  static async processOCR(
    imageFile: File,
    options: HybridOCROptions = {}
  ): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      console.log('HybridOCR: Starting OCR processing', {
        fileName: imageFile.name,
        fileSize: `${(imageFile.size / 1024 / 1024).toFixed(2)}MB`,
        options
      });

      // Determine processing strategy
      const strategy = this.determineProcessingStrategy(imageFile, options);
      console.log('HybridOCR: Processing strategy:', strategy);

      let result: MLResult;
      
      switch (strategy.method) {
        case 'client':
          result = await this.processOnClient(imageFile, options);
          break;
        case 'server':
          result = await this.processOnServer(imageFile, options);
          break;
        case 'hybrid':
          result = await this.processHybrid(imageFile, options);
          break;
        default:
          throw new Error(`Unknown processing method: ${strategy.method}`);
      }

      if (result.success && result.data) {
        (result.data as HybridOCRResult).processingMethod = strategy.method;
        (result.data as HybridOCRResult).recommendation = strategy.reason;
      }

      const totalTime = performance.now() - startTime;
      console.log(`HybridOCR: Completed in ${totalTime.toFixed(2)}ms using ${strategy.method}`);
      
      return {
        ...result,
        processingTime: totalTime
      };

    } catch (error) {
      console.error('HybridOCR: Processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed',
        processingTime: performance.now() - startTime
      };
    }
  }

  private static determineProcessingStrategy(
    file: File,
    options: HybridOCROptions
  ): { method: 'client' | 'server' | 'hybrid'; reason: string } {
    const fileSizeMB = file.size / 1024 / 1024;
    const deviceInfo = DeviceDetector.getDeviceInfo();
    
    // Force flags override everything
    if (options.forceServerProcessing) {
      return { method: 'server', reason: 'Server processing forced by user' };
    }
    
    if (options.forceClientProcessing) {
      return { method: 'client', reason: 'Client processing forced by user' };
    }

    // Document type considerations
    const isComplexDocument = options.documentType && 
      ['certificate', 'specification'].includes(options.documentType);
    
    // File size considerations
    if (fileSizeMB > this.MAX_CLIENT_FILE_SIZE) {
      return { 
        method: 'server', 
        reason: `Large file (${fileSizeMB.toFixed(1)}MB) best processed server-side` 
      };
    }

    if (fileSizeMB < this.MIN_SERVER_FILE_SIZE && !isComplexDocument) {
      return { 
        method: 'client', 
        reason: `Small file (${fileSizeMB.toFixed(1)}MB) efficient for client processing` 
      };
    }

    // Device capability considerations
    if (!deviceInfo.supportsWebGPU || deviceInfo.optimalDevice === 'cpu') {
      return { 
        method: 'server', 
        reason: 'Limited device capabilities, using server processing' 
      };
    }

    // Complex document types benefit from AI processing
    if (isComplexDocument || options.extractStructuredData) {
      return { 
        method: 'server', 
        reason: 'Complex document requires AI-powered extraction' 
      };
    }

    // For medium files and capable devices, try hybrid
    if (fileSizeMB <= this.MAX_CLIENT_FILE_SIZE && deviceInfo.supportsWebGPU) {
      return { 
        method: 'hybrid', 
        reason: 'Optimal conditions for hybrid processing' 
      };
    }

    // Default to server for reliability
    return { 
      method: 'server', 
      reason: 'Server processing for optimal accuracy' 
    };
  }

  private static async processOnClient(
    file: File,
    options: HybridOCROptions
  ): Promise<MLResult> {
    console.log('HybridOCR: Processing on client...');
    
    try {
      // Try client-side OCR first
      const result = await OCRService.extractText(file, options);
      
      if (result.success && result.data?.text && (result.data.confidence || 0) > 0.7) {
        return result;
      }
      
      console.log('HybridOCR: Client confidence low, trying HuggingFace...');
      
      // Try HuggingFace OCR as fallback
      try {
        await huggingFaceService.initialize();
        const text = await huggingFaceService.processOCR(file);
        
        if (text && text.length > 0) {
          return {
            success: true,
            data: {
              text,
              confidence: 0.8, // HuggingFace models are generally reliable
              language: 'auto',
              boundingBoxes: [],
              processingMethod: 'huggingface',
              fallbackUsed: true
            }
          };
        }
      } catch (hfError) {
        console.log('HybridOCR: HuggingFace failed, falling back to server:', hfError);
      }
      
      // Final fallback to server
      console.log('HybridOCR: All client methods failed, falling back to server');
      const serverResult = await this.processOnServer(file, options);
      if (serverResult.success && serverResult.data) {
        (serverResult.data as HybridOCRResult).fallbackUsed = true;
      }
      return serverResult;
      
    } catch (error) {
      console.log('HybridOCR: Client processing error, falling back to server:', error);
      const serverResult = await this.processOnServer(file, options);
      if (serverResult.success && serverResult.data) {
        (serverResult.data as HybridOCRResult).fallbackUsed = true;
      }
      return serverResult;
    }
  }

  private static async processOnServer(
    file: File,
    options: HybridOCROptions
  ): Promise<MLResult> {
    console.log('HybridOCR: Processing on server...');
    
    return await ServerMLService.processOCR(file, {
      language: options.language,
      extractStructuredData: options.extractStructuredData,
      documentType: options.documentType,
      materialContext: options.materialContext
    });
  }

  private static async processHybrid(
    file: File,
    options: HybridOCROptions
  ): Promise<MLResult> {
    console.log('HybridOCR: Starting hybrid processing...');
    
    // Start both client and server processing in parallel
    const clientPromise = this.processOnClient(file, options);
    const serverPromise = this.processOnServer(file, options);

    try {
      // Wait for the first one to complete
      const race = await Promise.race([
        clientPromise.then(result => ({ source: 'client', result })),
        serverPromise.then(result => ({ source: 'server', result }))
      ]);

      console.log(`HybridOCR: ${race.source} processing completed first`);

      // If client completes first and is successful, use it
      if (race.source === 'client' && race.result.success) {
        // Cancel server request if possible (cleanup)
        serverPromise.catch(() => {}); // Ignore errors from cancelled request
        return race.result;
      }

      // If server completes first or client failed, use server result
      if (race.source === 'server') {
        clientPromise.catch(() => {}); // Ignore errors from cancelled request
        return race.result;
      }

      // If client completed first but failed, wait for server
      console.log('HybridOCR: Client failed, waiting for server...');
      const serverResult = await serverPromise;
      if (serverResult.success && serverResult.data) {
        (serverResult.data as HybridOCRResult).fallbackUsed = true;
      }
      return serverResult;

    } catch (error) {
      console.error('HybridOCR: Both processing methods failed:', error);
      return {
        success: false,
        error: 'Both client and server OCR processing failed',
        processingTime: 0
      };
    }
  }

  static getProcessingRecommendation(file: File, options: HybridOCROptions = {}): {
    method: 'client' | 'server' | 'hybrid';
    reason: string;
    estimatedTime: string;
    accuracy: string;
  } {
    const strategy = this.determineProcessingStrategy(file, options);
    const fileSizeMB = file.size / 1024 / 1024;
    
    let estimatedTime: string;
    let accuracy: string;

    switch (strategy.method) {
      case 'client':
        estimatedTime = fileSizeMB < 1 ? '< 2s' : '2-5s';
        accuracy = 'Good for simple text';
        break;
      case 'server':
        estimatedTime = '3-8s';
        accuracy = 'Excellent for all document types';
        break;
      case 'hybrid':
        estimatedTime = '2-5s';
        accuracy = 'Best available method automatically';
        break;
    }

    return {
      method: strategy.method,
      reason: strategy.reason,
      estimatedTime,
      accuracy
    };
  }

  static getStatus(): {
    clientSupported: boolean;
    serverAvailable: boolean;
    hybridReady: boolean;
    features: string[];
  } {
    const clientStatus = OCRService.getStatus();
    const serverStatus = ServerMLService.getStatus();

    return {
      clientSupported: clientStatus.supported,
      serverAvailable: serverStatus.available,
      hybridReady: clientStatus.supported || serverStatus.available,
      features: [
        ...clientStatus.features.map(f => `Client: ${f}`),
        ...(serverStatus.available ? ['Server: AI-Powered OCR', 'Server: Structured Data Extraction'] : [])
      ]
    };
  }
}

// Export singleton instance
export const hybridOCRService = new HybridOCRService();