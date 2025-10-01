/**
 * CrossModalLearning - Multi-modal fusion for material analysis
 * Combines visual, spectral, thermal, and textual data for enhanced material understanding
 */

export interface ModalityData {
  visual?: ImageData;
  spectral?: Float32Array;
  thermal?: Float32Array;
  textual?: string;
  metadata?: Record<string, unknown>;
}

export interface CrossModalFeatures {
  visualFeatures: Float32Array;
  spectralFeatures: Float32Array;
  thermalFeatures: Float32Array;
  textualFeatures: Float32Array;
  fusedFeatures: Float32Array;
  modalityWeights: Float32Array;
  crossModalSimilarity: number;
}

export interface CrossModalConfig {
  visualDim: number;
  spectralDim: number;
  thermalDim: number;
  textualDim: number;
  fusedDim: number;
  attentionHeads: number;
  temperatureScaling: number;
  dropoutRate: number;
}

export class CrossModalLearning {
  private config: CrossModalConfig;
  private modalityEncoders: Map<string, Float32Array>;
  private crossAttentionWeights: Float32Array;
  private fusionNetwork: Float32Array;

  constructor(config: CrossModalConfig) {
    this.config = config;
    this.modalityEncoders = new Map();
    this.crossAttentionWeights = new Float32Array(config.attentionHeads * 4); // 4 modalities
    this.fusionNetwork = new Float32Array(config.fusedDim);
    this.initializeEncoders();
  }

  private initializeEncoders(): void {
    // Initialize modality-specific encoders
    this.modalityEncoders.set('visual', new Float32Array(this.config.visualDim));
    this.modalityEncoders.set('spectral', new Float32Array(this.config.spectralDim));
    this.modalityEncoders.set('thermal', new Float32Array(this.config.thermalDim));
    this.modalityEncoders.set('textual', new Float32Array(this.config.textualDim));
  }

  /**
   * Extract features from visual modality
   */
  private async extractVisualFeatures(imageData: ImageData): Promise<Float32Array> {
    const { width, height, data } = imageData;
    const features = new Float32Array(this.config.visualDim);

    // Convert to normalized RGB channels
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4] / 255.0;
      const g = data[i * 4 + 1] / 255.0;
      const b = data[i * 4 + 2] / 255.0;

      // Extract color histograms and texture features
      const histIndex = Math.floor((r + g + b) * 85); // Simple binning
      if (histIndex < features.length) {
        features[histIndex] += 1.0;
      }
    }

    return this.normalizeFeatures(features);
  }

  /**
   * Extract features from spectral data
   */
  private async extractSpectralFeatures(spectralData: Float32Array): Promise<Float32Array> {
    const features = new Float32Array(this.config.spectralDim);

    // Apply spectral analysis (simplified - in production use proper signal processing)
    for (let i = 0; i < Math.min(spectralData.length, features.length); i++) {
      // Extract spectral peaks and features
      features[i] = spectralData[i];

      // Add derivative features for peak detection
      if (i > 0 && i < spectralData.length - 1) {
        const derivative = (spectralData[i + 1] - spectralData[i - 1]) / 2.0;
        if (i + features.length / 2 < features.length) {
          features[i + Math.floor(features.length / 2)] = derivative;
        }
      }
    }

    return this.normalizeFeatures(features);
  }

  /**
   * Extract features from thermal data
   */
  private async extractThermalFeatures(thermalData: Float32Array): Promise<Float32Array> {
    const features = new Float32Array(this.config.thermalDim);

    // Extract thermal patterns and gradients
    for (let i = 0; i < Math.min(thermalData.length, features.length); i++) {
      features[i] = thermalData[i];
    }

    // Add statistical features
    const mean = thermalData.reduce((sum, val) => sum + val, 0) / thermalData.length;
    const variance = thermalData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / thermalData.length;

    if (features.length > 2) {
      features[features.length - 2] = mean;
      features[features.length - 1] = Math.sqrt(variance);
    }

    return this.normalizeFeatures(features);
  }

  /**
   * Extract features from textual descriptions
   */
  private async extractTextualFeatures(text: string): Promise<Float32Array> {
    const features = new Float32Array(this.config.textualDim);

    // Simple bag-of-words encoding (in production use proper embeddings)
    const words = text.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();

    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Material-specific keywords
    const materialKeywords = [
      'metal', 'plastic', 'wood', 'ceramic', 'glass', 'rubber', 'concrete',
      'smooth', 'rough', 'textured', 'glossy', 'matte', 'transparent', 'opaque',
      'hard', 'soft', 'flexible', 'rigid', 'dense', 'light', 'heavy',
    ];

    materialKeywords.forEach((keyword, index) => {
      if (index < features.length && wordFreq.has(keyword)) {
        features[index] = wordFreq.get(keyword)! / words.length;
      }
    });

    return this.normalizeFeatures(features);
  }

  /**
   * Apply cross-modal attention mechanism
   */
  private applyCrossModalAttention(
    modalFeatures: Map<string, Float32Array>,
  ): { attentionWeights: Float32Array; weightedFeatures: Map<string, Float32Array> } {
    const modalities = Array.from(modalFeatures.keys());
    const attentionWeights = new Float32Array(modalities.length);
    const weightedFeatures = new Map<string, Float32Array>();

    // Compute attention scores between modalities
    for (let i = 0; i < modalities.length; i++) {
      const modalityA = modalFeatures.get(modalities[i])!;
      let totalSimilarity = 0;

      for (let j = 0; j < modalities.length; j++) {
        if (i !== j) {
          const modalityB = modalFeatures.get(modalities[j])!;
          const similarity = this.computeCosineSimilarity(modalityA, modalityB);
          totalSimilarity += similarity;
        }
      }

      attentionWeights[i] = totalSimilarity / (modalities.length - 1);
    }

    // Apply softmax to attention weights
    const softmaxWeights = this.applySoftmax(attentionWeights);

    // Apply weights to features
    modalities.forEach((modality, index) => {
      const features = modalFeatures.get(modality)!;
      const weighted = features.map(val => val * softmaxWeights[index]);
      weightedFeatures.set(modality, new Float32Array(weighted));
    });

    return { attentionWeights: softmaxWeights, weightedFeatures };
  }

  /**
   * Fuse multi-modal features
   */
  private fuseFeatures(weightedFeatures: Map<string, Float32Array>): Float32Array {
    const fusedFeatures = new Float32Array(this.config.fusedDim);
    const modalities = Array.from(weightedFeatures.keys());

    // Concatenate and project features
    let offset = 0;
    modalities.forEach(modality => {
      const features = weightedFeatures.get(modality)!;
      const projectionSize = Math.floor(this.config.fusedDim / modalities.length);

      for (let i = 0; i < Math.min(features.length, projectionSize); i++) {
        if (offset + i < fusedFeatures.length) {
          fusedFeatures[offset + i] = features[i];
        }
      }
      offset += projectionSize;
    });

    return this.normalizeFeatures(fusedFeatures);
  }

  /**
   * Main cross-modal learning forward pass
   */
  async processMultiModal(modalityData: ModalityData): Promise<CrossModalFeatures> {
    const modalFeatures = new Map<string, Float32Array>();

    // Extract features from each available modality
    if (modalityData.visual) {
      modalFeatures.set('visual', await this.extractVisualFeatures(modalityData.visual));
    }

    if (modalityData.spectral) {
      modalFeatures.set('spectral', await this.extractSpectralFeatures(modalityData.spectral));
    }

    if (modalityData.thermal) {
      modalFeatures.set('thermal', await this.extractThermalFeatures(modalityData.thermal));
    }

    if (modalityData.textual) {
      modalFeatures.set('textual', await this.extractTextualFeatures(modalityData.textual));
    }

    // Apply cross-modal attention
    const { attentionWeights, weightedFeatures } = this.applyCrossModalAttention(modalFeatures);

    // Fuse weighted features
    const fusedFeatures = this.fuseFeatures(weightedFeatures);

    // Compute cross-modal similarity score
    const crossModalSimilarity = this.computeCrossModalSimilarity(modalFeatures);

    return {
      visualFeatures: modalFeatures.get('visual') || new Float32Array(this.config.visualDim),
      spectralFeatures: modalFeatures.get('spectral') || new Float32Array(this.config.spectralDim),
      thermalFeatures: modalFeatures.get('thermal') || new Float32Array(this.config.thermalDim),
      textualFeatures: modalFeatures.get('textual') || new Float32Array(this.config.textualDim),
      fusedFeatures,
      modalityWeights: attentionWeights,
      crossModalSimilarity,
    };
  }

  // Utility methods
  private normalizeFeatures(features: Float32Array): Float32Array {
    const norm = Math.sqrt(features.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? features.map(val => val / norm) : features;
  }

  private computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
    const minLength = Math.min(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLength; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private applySoftmax(values: Float32Array): Float32Array {
    const maxVal = Math.max(...values);
    const exponentials = values.map(val => Math.exp((val - maxVal) / this.config.temperatureScaling));
    const sum = exponentials.reduce((sum, val) => sum + val, 0);
    return new Float32Array(exponentials.map(val => val / sum));
  }

  private computeCrossModalSimilarity(modalFeatures: Map<string, Float32Array>): number {
    const modalities = Array.from(modalFeatures.values());
    if (modalities.length < 2) return 1.0;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < modalities.length; i++) {
      for (let j = i + 1; j < modalities.length; j++) {
        totalSimilarity += this.computeCosineSimilarity(modalities[i], modalities[j]);
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  /**
   * Get configuration and performance metrics
   */
  getModelInfo(): {
    config: CrossModalConfig;
    supportedModalities: string[];
    parameters: number;
  } {
    return {
      config: this.config,
      supportedModalities: ['visual', 'spectral', 'thermal', 'textual'],
      parameters: this.estimateParameters(),
    };
  }

  private estimateParameters(): number {
    const { visualDim, spectralDim, thermalDim, textualDim, fusedDim, attentionHeads } = this.config;
    return visualDim + spectralDim + thermalDim + textualDim + fusedDim + (attentionHeads * 4 * 4);
  }
}
