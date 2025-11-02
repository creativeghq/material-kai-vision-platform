/**
 * TextureAttentionModule - Self-attention mechanism optimized for texture pattern analysis
 *
 * This module implements multi-head attention specifically designed for capturing
 * texture patterns, directional information, and spatial relationships in materials.
 */

export interface AttentionConfig {
  inputChannels: number;
  headCount: number;
  keyDim: number;
  dropoutRate: number;
  temperatureScaling: number;
}

export interface TextureAttentionOutput {
  attentionWeights: Float32Array;
  enhancedFeatures: Float32Array;
  textureDirections: Float32Array;
  confidenceScores: Float32Array;
}

export interface TextureFeatureMap {
  features: Float32Array;
  width: number;
  height: number;
  channels: number;
}

export class TextureAttentionModule {
  private config: AttentionConfig;
  private queryWeights: Float32Array = new Float32Array(0);
  private keyWeights: Float32Array = new Float32Array(0);
  private valueWeights: Float32Array = new Float32Array(0);
  private outputWeights: Float32Array = new Float32Array(0);
  private positionEmbeddings: Float32Array = new Float32Array(0);

  constructor(config: AttentionConfig) {
    this.config = config;
    this.initializeWeights();
  }

  /**
   * Initialize attention weights with Xavier/Glorot initialization
   */
  private initializeWeights(): void {
    const { inputChannels, headCount, keyDim } = this.config;
    const totalDim = headCount * keyDim;

    // Initialize query, key, value transformation matrices
    this.queryWeights = this.initializeMatrix(inputChannels, totalDim);
    this.keyWeights = this.initializeMatrix(inputChannels, totalDim);
    this.valueWeights = this.initializeMatrix(inputChannels, totalDim);
    this.outputWeights = this.initializeMatrix(totalDim, inputChannels);

    // Initialize positional embeddings for spatial texture awareness
    this.positionEmbeddings = this.createPositionalEmbeddings();
  }

  /**
   * Xavier/Glorot weight initialization
   */
  private initializeMatrix(
    inputSize: number,
    outputSize: number,
  ): Float32Array {
    const limit = Math.sqrt(6.0 / (inputSize + outputSize));
    const weights = new Float32Array(inputSize * outputSize);

    for (let i = 0; i < weights.length; i++) {
      weights[i] = (Math.random() * 2 - 1) * limit;
    }

    return weights;
  }

  /**
   * Create sinusoidal positional embeddings for texture spatial awareness
   */
  private createPositionalEmbeddings(): Float32Array {
    const maxLen = 1024; // Maximum sequence length
    const dModel = this.config.keyDim;
    const embeddings = new Float32Array(maxLen * dModel);

    for (let pos = 0; pos < maxLen; pos++) {
      for (let i = 0; i < dModel; i++) {
        const angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / dModel);
        embeddings[pos * dModel + i] =
          i % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
      }
    }

    return embeddings;
  }

  /**
   * Apply texture-aware multi-head attention
   */
  public async processTexture(
    input: TextureFeatureMap,
  ): Promise<TextureAttentionOutput> {
    try {
      const { features, width, height, channels } = input;
      const sequenceLength = width * height;

      // Reshape features to sequence format [seq_len, channels]
      const sequenceFeatures = this.reshapeToSequence(
        features,
        width,
        height,
        channels,
      );

      // Add positional embeddings for spatial awareness
      const embeddedFeatures = this.addPositionalEmbeddings(
        sequenceFeatures,
        sequenceLength,
      );

      // Compute multi-head attention
      const attentionOutput = await this.computeMultiHeadAttention(
        embeddedFeatures,
        sequenceLength,
      );

      // Extract texture directions from attention patterns
      const textureDirections = this.extractTextureDirections(
        attentionOutput.attentionWeights,
        width,
        height,
      );

      // Compute confidence scores based on attention entropy
      const confidenceScores = this.computeConfidenceScores(
        attentionOutput.attentionWeights,
      );

      return {
        attentionWeights: attentionOutput.attentionWeights,
        enhancedFeatures: attentionOutput.enhancedFeatures,
        textureDirections,
        confidenceScores,
      };
    } catch (error) {
      console.error('Error in texture attention processing:', error);
      throw new Error(
        `Texture attention processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reshape feature maps to sequence format for attention computation
   */
  private reshapeToSequence(
    features: Float32Array,
    width: number,
    height: number,
    channels: number,
  ): Float32Array {
    const sequenceLength = width * height;
    const sequenceFeatures = new Float32Array(sequenceLength * channels);

    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const seqIdx = h * width + w;
        for (let c = 0; c < channels; c++) {
          const originalIdx = (h * width + w) * channels + c;
          const sequenceIdx = seqIdx * channels + c;
          sequenceFeatures[sequenceIdx] = features[originalIdx];
        }
      }
    }

    return sequenceFeatures;
  }

  /**
   * Add positional embeddings to sequence features
   */
  private addPositionalEmbeddings(
    features: Float32Array,
    sequenceLength: number,
  ): Float32Array {
    const channels = this.config.inputChannels;
    const embeddedFeatures = new Float32Array(features.length);

    for (let seq = 0; seq < sequenceLength; seq++) {
      for (let ch = 0; ch < channels; ch++) {
        const featureIdx = seq * channels + ch;
        const posIdx = seq * this.config.keyDim + (ch % this.config.keyDim);

        embeddedFeatures[featureIdx] =
          features[featureIdx] + (this.positionEmbeddings[posIdx] || 0) * 0.1; // Scale factor for positional encoding
      }
    }

    return embeddedFeatures;
  }

  /**
   * Compute multi-head attention with texture-specific optimizations
   */
  private async computeMultiHeadAttention(
    features: Float32Array,
    sequenceLength: number,
  ): Promise<{
    attentionWeights: Float32Array;
    enhancedFeatures: Float32Array;
  }> {
    const { headCount, keyDim } = this.config;
    const channels = this.config.inputChannels;

    // Transform input to Q, K, V
    const queries = this.linearTransform(
      features,
      this.queryWeights,
      sequenceLength,
      channels,
    );
    const keys = this.linearTransform(
      features,
      this.keyWeights,
      sequenceLength,
      channels,
    );
    const values = this.linearTransform(
      features,
      this.valueWeights,
      sequenceLength,
      channels,
    );

    // Split into multiple heads
    const headOutputs: Float32Array[] = [];
    const headAttentions: Float32Array[] = [];

    for (let head = 0; head < headCount; head++) {
      const headQ = this.extractHead(
        queries,
        head,
        headCount,
        keyDim,
        sequenceLength,
      );
      const headK = this.extractHead(
        keys,
        head,
        headCount,
        keyDim,
        sequenceLength,
      );
      const headV = this.extractHead(
        values,
        head,
        headCount,
        keyDim,
        sequenceLength,
      );

      // Compute attention scores with temperature scaling
      const attentionScores = this.computeAttentionScores(
        headQ,
        headK,
        sequenceLength,
        keyDim,
      );
      const attentionWeights = this.applySoftmax(
        attentionScores,
        sequenceLength,
      );

      // Apply dropout if configured
      if (this.config.dropoutRate > 0) {
        this.applyDropout(attentionWeights, this.config.dropoutRate);
      }

      // Compute attention output
      const headOutput = this.applyAttention(
        attentionWeights,
        headV,
        sequenceLength,
        keyDim,
      );

      headOutputs.push(headOutput);
      headAttentions.push(attentionWeights);
    }

    // Concatenate head outputs
    const concatenated = this.concatenateHeads(
      headOutputs,
      sequenceLength,
      keyDim,
    );

    // Final linear transformation
    const enhancedFeatures = this.linearTransform(
      concatenated,
      this.outputWeights,
      sequenceLength,
      headCount * keyDim,
    );

    // Combine attention weights from all heads
    const combinedAttention = this.combineAttentionWeights(
      headAttentions,
      sequenceLength,
    );

    return {
      attentionWeights: combinedAttention,
      enhancedFeatures,
    };
  }

  /**
   * Perform linear transformation for Q, K, V computation
   */
  private linearTransform(
    input: Float32Array,
    weights: Float32Array,
    sequenceLength: number,
    inputDim: number,
  ): Float32Array {
    const outputDim = weights.length / inputDim;
    const output = new Float32Array(sequenceLength * outputDim);

    for (let seq = 0; seq < sequenceLength; seq++) {
      for (let out = 0; out < outputDim; out++) {
        let sum = 0;
        for (let inp = 0; inp < inputDim; inp++) {
          const inputIdx = seq * inputDim + inp;
          const weightIdx = inp * outputDim + out;
          sum += input[inputIdx] * weights[weightIdx];
        }
        output[seq * outputDim + out] = sum;
      }
    }

    return output;
  }

  /**
   * Extract features for a specific attention head
   */
  private extractHead(
    input: Float32Array,
    headIdx: number,
    headCount: number,
    keyDim: number,
    sequenceLength: number,
  ): Float32Array {
    const headFeatures = new Float32Array(sequenceLength * keyDim);
    const totalDim = headCount * keyDim;

    for (let seq = 0; seq < sequenceLength; seq++) {
      for (let dim = 0; dim < keyDim; dim++) {
        const inputIdx = seq * totalDim + headIdx * keyDim + dim;
        const outputIdx = seq * keyDim + dim;
        headFeatures[outputIdx] = input[inputIdx];
      }
    }

    return headFeatures;
  }

  /**
   * Compute attention scores between queries and keys
   */
  private computeAttentionScores(
    queries: Float32Array,
    keys: Float32Array,
    sequenceLength: number,
    keyDim: number,
  ): Float32Array {
    const scores = new Float32Array(sequenceLength * sequenceLength);
    const scale = (1.0 / Math.sqrt(keyDim)) * this.config.temperatureScaling;

    for (let i = 0; i < sequenceLength; i++) {
      for (let j = 0; j < sequenceLength; j++) {
        let score = 0;
        for (let k = 0; k < keyDim; k++) {
          score += queries[i * keyDim + k] * keys[j * keyDim + k];
        }
        scores[i * sequenceLength + j] = score * scale;
      }
    }

    return scores;
  }

  /**
   * Apply softmax to attention scores
   */
  private applySoftmax(
    scores: Float32Array,
    sequenceLength: number,
  ): Float32Array {
    const weights = new Float32Array(scores.length);

    for (let i = 0; i < sequenceLength; i++) {
      const rowStart = i * sequenceLength;

      // Find max for numerical stability
      let maxScore = -Infinity;
      for (let j = 0; j < sequenceLength; j++) {
        maxScore = Math.max(maxScore, scores[rowStart + j]);
      }

      // Compute exponentials and sum
      let sum = 0;
      for (let j = 0; j < sequenceLength; j++) {
        const expScore = Math.exp(scores[rowStart + j] - maxScore);
        weights[rowStart + j] = expScore;
        sum += expScore;
      }

      // Normalize
      for (let j = 0; j < sequenceLength; j++) {
        weights[rowStart + j] /= sum;
      }
    }

    return weights;
  }

  /**
   * Apply dropout for regularization
   */
  private applyDropout(weights: Float32Array, dropoutRate: number): void {
    for (let i = 0; i < weights.length; i++) {
      if (Math.random() < dropoutRate) {
        weights[i] = 0;
      }
    }
  }

  /**
   * Apply attention weights to values
   */
  private applyAttention(
    weights: Float32Array,
    values: Float32Array,
    sequenceLength: number,
    keyDim: number,
  ): Float32Array {
    const output = new Float32Array(sequenceLength * keyDim);

    for (let i = 0; i < sequenceLength; i++) {
      for (let k = 0; k < keyDim; k++) {
        let sum = 0;
        for (let j = 0; j < sequenceLength; j++) {
          const weightIdx = i * sequenceLength + j;
          const valueIdx = j * keyDim + k;
          sum += weights[weightIdx] * values[valueIdx];
        }
        output[i * keyDim + k] = sum;
      }
    }

    return output;
  }

  /**
   * Concatenate outputs from multiple attention heads
   */
  private concatenateHeads(
    headOutputs: Float32Array[],
    sequenceLength: number,
    keyDim: number,
  ): Float32Array {
    const headCount = headOutputs.length;
    const concatenated = new Float32Array(sequenceLength * headCount * keyDim);

    for (let seq = 0; seq < sequenceLength; seq++) {
      for (let head = 0; head < headCount; head++) {
        for (let dim = 0; dim < keyDim; dim++) {
          const inputIdx = seq * keyDim + dim;
          const outputIdx = seq * (headCount * keyDim) + head * keyDim + dim;
          concatenated[outputIdx] = headOutputs[head][inputIdx];
        }
      }
    }

    return concatenated;
  }

  /**
   * Combine attention weights from multiple heads
   */
  private combineAttentionWeights(
    headAttentions: Float32Array[],
    sequenceLength: number,
  ): Float32Array {
    const combined = new Float32Array(sequenceLength * sequenceLength);
    const headCount = headAttentions.length;

    for (let i = 0; i < sequenceLength; i++) {
      for (let j = 0; j < sequenceLength; j++) {
        let sum = 0;
        for (let head = 0; head < headCount; head++) {
          sum += headAttentions[head][i * sequenceLength + j];
        }
        combined[i * sequenceLength + j] = sum / headCount;
      }
    }

    return combined;
  }

  /**
   * Extract dominant texture directions from attention patterns
   */
  private extractTextureDirections(
    attentionWeights: Float32Array,
    width: number,
    height: number,
  ): Float32Array {
    const directions = new Float32Array(4); // [horizontal, vertical, diagonal1, diagonal2]
    const sequenceLength = width * height;

    for (let i = 0; i < sequenceLength; i++) {
      const row = Math.floor(i / width);
      const col = i % width;

      for (let j = 0; j < sequenceLength; j++) {
        const targetRow = Math.floor(j / width);
        const targetCol = j % width;
        const weight = attentionWeights[i * sequenceLength + j];

        // Compute direction vectors
        const deltaRow = targetRow - row;
        const deltaCol = targetCol - col;

        if (Math.abs(deltaCol) > Math.abs(deltaRow)) {
          directions[0] += weight; // Horizontal
        } else if (Math.abs(deltaRow) > Math.abs(deltaCol)) {
          directions[1] += weight; // Vertical
        } else if (deltaRow * deltaCol > 0) {
          directions[2] += weight; // Diagonal \
        } else if (deltaRow * deltaCol < 0) {
          directions[3] += weight; // Diagonal /
        }
      }
    }

    // Normalize directions
    const sum = directions[0] + directions[1] + directions[2] + directions[3];
    if (sum > 0) {
      for (let i = 0; i < 4; i++) {
        directions[i] /= sum;
      }
    }

    return directions;
  }

  /**
   * Compute confidence scores based on attention entropy
   */
  private computeConfidenceScores(
    attentionWeights: Float32Array,
  ): Float32Array {
    const sequenceLength = Math.sqrt(attentionWeights.length);
    const confidenceScores = new Float32Array(sequenceLength);

    for (let i = 0; i < sequenceLength; i++) {
      let entropy = 0;
      const rowStart = i * sequenceLength;

      for (let j = 0; j < sequenceLength; j++) {
        const weight = attentionWeights[rowStart + j];
        if (weight > 0) {
          entropy -= weight * Math.log2(weight);
        }
      }

      // Convert entropy to confidence (lower entropy = higher confidence)
      const maxEntropy = Math.log2(sequenceLength);
      confidenceScores[i] = 1.0 - entropy / maxEntropy;
    }

    return confidenceScores;
  }
}
