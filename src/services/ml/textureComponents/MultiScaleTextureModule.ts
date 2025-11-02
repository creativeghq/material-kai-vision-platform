/**
 * MultiScaleTextureModule - Multi-resolution texture processing for comprehensive material analysis
 *
 * This module processes textures at multiple scales to capture both fine details
 * and coarse patterns, enabling robust material classification and analysis.
 */

export interface ScaleConfig {
  scaleFactors: number[];
  kernelSizes: number[];
  poolingType: 'max' | 'average' | 'adaptive';
  fusionStrategy: 'concatenation' | 'attention' | 'weighted';
  preserveAspectRatio: boolean;
}

export interface MultiScaleFeatures {
  scaleFeatures: Float32Array[];
  fusedFeatures: Float32Array;
  attentionWeights: Float32Array;
  scaleImportance: Float32Array;
  textureComplexity: number;
}

export interface TextureScale {
  scaleFactor: number;
  features: Float32Array;
  width: number;
  height: number;
  textureMetrics: {
    contrast: number;
    energy: number;
    homogeneity: number;
    entropy: number;
  };
}

export class MultiScaleTextureModule {
  private config: ScaleConfig;
  private attentionWeights: Float32Array[] = [];
  private fusionWeights: Float32Array = new Float32Array(0);

  constructor(config: ScaleConfig) {
    this.config = config;
    this.initializeWeights();
  }

  /**
   * Initialize learnable weights for scale fusion
   */
  private initializeWeights(): void {
    const numScales = this.config.scaleFactors.length;

    // Initialize attention weights for each scale
    this.attentionWeights = [];
    for (let i = 0; i < numScales; i++) {
      this.attentionWeights.push(new Float32Array(1).fill(1.0 / numScales));
    }

    // Initialize fusion weights
    this.fusionWeights = new Float32Array(numScales);
    for (let i = 0; i < numScales; i++) {
      this.fusionWeights[i] = 1.0 / numScales; // Equal weighting initially
    }
  }

  /**
   * Process texture at multiple scales
   */
  public async processMultiScale(
    image: Float32Array,
    width: number,
    height: number,
    channels: number = 1,
  ): Promise<MultiScaleFeatures> {
    try {
      const scaleFeatures: Float32Array[] = [];
      const textureScales: TextureScale[] = [];

      // Process at each scale
      for (let i = 0; i < this.config.scaleFactors.length; i++) {
        const scaleFactor = this.config.scaleFactors[i];
        const kernelSize = this.config.kernelSizes[i] || 3;

        console.log(
          `Processing scale ${i + 1}/${this.config.scaleFactors.length}: factor=${scaleFactor}`,
        );

        const scaleResult = await this.processAtScale(
          image,
          width,
          height,
          channels,
          scaleFactor,
          kernelSize,
        );

        scaleFeatures.push(scaleResult.features);
        textureScales.push(scaleResult);
      }

      // Compute scale importance based on texture complexity
      const scaleImportance = this.computeScaleImportance(textureScales);

      // Fuse multi-scale features
      const fusedFeatures = await this.fuseScaleFeatures(
        scaleFeatures,
        scaleImportance,
      );

      // Compute attention weights for interpretability
      const attentionWeights = this.computeAttentionWeights(
        scaleFeatures,
        fusedFeatures,
      );

      // Calculate overall texture complexity
      const textureComplexity = this.computeTextureComplexity(textureScales);

      return {
        scaleFeatures,
        fusedFeatures,
        attentionWeights,
        scaleImportance,
        textureComplexity,
      };
    } catch (error) {
      console.error('Error in multi-scale texture processing:', error);
      throw new Error(
        `Multi-scale processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Process texture at a specific scale
   */
  private async processAtScale(
    image: Float32Array,
    width: number,
    height: number,
    channels: number,
    scaleFactor: number,
    kernelSize: number,
  ): Promise<TextureScale> {
    // Resize image to scale
    const scaledImage = await this.resizeImage(
      image,
      width,
      height,
      channels,
      scaleFactor,
    );
    const scaledWidth = Math.round(width * scaleFactor);
    const scaledHeight = Math.round(height * scaleFactor);

    // Extract texture features at this scale
    const features = await this.extractTextureFeatures(
      scaledImage,
      scaledWidth,
      scaledHeight,
      channels,
      kernelSize,
    );

    // Compute texture metrics
    const textureMetrics = this.computeTextureMetrics(
      scaledImage,
      scaledWidth,
      scaledHeight,
    );

    return {
      scaleFactor,
      features,
      width: scaledWidth,
      height: scaledHeight,
      textureMetrics,
    };
  }

  /**
   * Resize image using bilinear interpolation
   */
  private async resizeImage(
    image: Float32Array,
    width: number,
    height: number,
    channels: number,
    scaleFactor: number,
  ): Promise<Float32Array> {
    const newWidth = Math.round(width * scaleFactor);
    const newHeight = Math.round(height * scaleFactor);
    const resized = new Float32Array(newWidth * newHeight * channels);

    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
          // Map new coordinates to original image
          const origX = (x / newWidth) * width;
          const origY = (y / newHeight) * height;

          // Bilinear interpolation
          const x1 = Math.floor(origX);
          const y1 = Math.floor(origY);
          const x2 = Math.min(x1 + 1, width - 1);
          const y2 = Math.min(y1 + 1, height - 1);

          const fx = origX - x1;
          const fy = origY - y1;

          // Get four surrounding pixels
          const idx11 = (y1 * width + x1) * channels + c;
          const idx12 = (y1 * width + x2) * channels + c;
          const idx21 = (y2 * width + x1) * channels + c;
          const idx22 = (y2 * width + x2) * channels + c;

          const pixel11 = image[idx11] || 0;
          const pixel12 = image[idx12] || 0;
          const pixel21 = image[idx21] || 0;
          const pixel22 = image[idx22] || 0;

          // Interpolate
          const interpolated =
            pixel11 * (1 - fx) * (1 - fy) +
            pixel12 * fx * (1 - fy) +
            pixel21 * (1 - fx) * fy +
            pixel22 * fx * fy;

          const newIdx = (y * newWidth + x) * channels + c;
          resized[newIdx] = interpolated;
        }
      }
    }

    return resized;
  }

  /**
   * Extract texture features using various methods
   */
  private async extractTextureFeatures(
    image: Float32Array,
    width: number,
    height: number,
    channels: number,
    kernelSize: number,
  ): Promise<Float32Array> {
    // Convert to grayscale for texture analysis
    const grayImage =
      channels > 1
        ? this.convertToGrayscale(image, width, height, channels)
        : image;

    // Extract multiple types of texture features
    const glcmFeatures = this.extractGLCMFeatures(grayImage, width, height);
    const lbpFeatures = this.extractLBPFeatures(grayImage, width, height);
    const edgeFeatures = this.extractEdgeFeatures(
      grayImage,
      width,
      height,
      kernelSize,
    );
    const statisticalFeatures = this.extractStatisticalFeatures(
      grayImage,
      width,
      height,
    );

    // Concatenate all features
    const totalFeatures =
      glcmFeatures.length +
      lbpFeatures.length +
      edgeFeatures.length +
      statisticalFeatures.length;
    const features = new Float32Array(totalFeatures);

    let offset = 0;
    features.set(glcmFeatures, offset);
    offset += glcmFeatures.length;
    features.set(lbpFeatures, offset);
    offset += lbpFeatures.length;
    features.set(edgeFeatures, offset);
    offset += edgeFeatures.length;
    features.set(statisticalFeatures, offset);

    return features;
  }

  /**
   * Convert multi-channel image to grayscale
   */
  private convertToGrayscale(
    image: Float32Array,
    width: number,
    height: number,
    channels: number,
  ): Float32Array {
    const grayImage = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        const colorIndex = pixelIndex * channels;

        if (channels === 3) {
          grayImage[pixelIndex] =
            0.299 * image[colorIndex] +
            0.587 * image[colorIndex + 1] +
            0.114 * image[colorIndex + 2];
        } else {
          grayImage[pixelIndex] = image[colorIndex];
        }
      }
    }

    return grayImage;
  }

  /**
   * Extract Gray-Level Co-occurrence Matrix (GLCM) features
   */
  private extractGLCMFeatures(
    image: Float32Array,
    width: number,
    height: number,
  ): Float32Array {
    const levels = 16; // Quantization levels
    const distance = 1;
    const angles = [0, 45, 90, 135]; // Degrees

    // Quantize image to reduce computational complexity
    const quantized = this.quantizeImage(image, levels);

    const features: number[] = [];

    for (const angle of angles) {
      const glcm = this.computeGLCM(
        quantized,
        width,
        height,
        levels,
        distance,
        angle,
      );

      // Compute Haralick features
      const contrast = this.computeContrast(glcm, levels);
      const energy = this.computeEnergy(glcm, levels);
      const homogeneity = this.computeHomogeneity(glcm, levels);
      const entropy = this.computeEntropy(glcm, levels);

      features.push(contrast, energy, homogeneity, entropy);
    }

    return new Float32Array(features);
  }

  /**
   * Quantize image intensity values
   */
  private quantizeImage(image: Float32Array, levels: number): Uint8Array {
    const quantized = new Uint8Array(image.length);

    // Find min and max values
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < image.length; i++) {
      min = Math.min(min, image[i]);
      max = Math.max(max, image[i]);
    }

    const scale = (levels - 1) / (max - min);
    for (let i = 0; i < image.length; i++) {
      quantized[i] = Math.round((image[i] - min) * scale);
    }

    return quantized;
  }

  /**
   * Compute Gray-Level Co-occurrence Matrix
   */
  private computeGLCM(
    image: Uint8Array,
    width: number,
    height: number,
    levels: number,
    distance: number,
    angle: number,
  ): Float32Array {
    const glcm = new Float32Array(levels * levels);

    // Convert angle to direction offsets
    const angleRad = (angle * Math.PI) / 180;
    const dx = Math.round(distance * Math.cos(angleRad));
    const dy = Math.round(distance * Math.sin(angleRad));

    let totalPairs = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x2 = x + dx;
        const y2 = y + dy;

        if (x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
          const val1 = image[y * width + x];
          const val2 = image[y2 * width + x2];

          glcm[val1 * levels + val2]++;
          totalPairs++;
        }
      }
    }

    // Normalize GLCM
    if (totalPairs > 0) {
      for (let i = 0; i < glcm.length; i++) {
        glcm[i] /= totalPairs;
      }
    }

    return glcm;
  }

  /**
   * Compute contrast feature from GLCM
   */
  private computeContrast(glcm: Float32Array, levels: number): number {
    let contrast = 0;
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        const diff = i - j;
        contrast += diff * diff * glcm[i * levels + j];
      }
    }
    return contrast;
  }

  /**
   * Compute energy feature from GLCM
   */
  private computeEnergy(glcm: Float32Array, _levels: number): number {
    let energy = 0;
    for (let i = 0; i < glcm.length; i++) {
      energy += glcm[i] * glcm[i];
    }
    return energy;
  }

  /**
   * Compute homogeneity feature from GLCM
   */
  private computeHomogeneity(glcm: Float32Array, levels: number): number {
    let homogeneity = 0;
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        homogeneity += glcm[i * levels + j] / (1 + Math.abs(i - j));
      }
    }
    return homogeneity;
  }

  /**
   * Compute entropy feature from GLCM
   */
  private computeEntropy(glcm: Float32Array, _levels: number): number {
    let entropy = 0;
    for (let i = 0; i < glcm.length; i++) {
      if (glcm[i] > 0) {
        entropy -= glcm[i] * Math.log2(glcm[i]);
      }
    }
    return entropy;
  }

  /**
   * Extract Local Binary Pattern (LBP) features
   */
  private extractLBPFeatures(
    image: Float32Array,
    width: number,
    height: number,
  ): Float32Array {
    const histogram = new Float32Array(256); // LBP produces 8-bit patterns

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerValue = image[y * width + x];
        let lbpValue = 0;

        // Check 8 neighbors in circular order
        const neighbors = [
          image[(y - 1) * width + (x - 1)], // Top-left
          image[(y - 1) * width + x], // Top
          image[(y - 1) * width + (x + 1)], // Top-right
          image[y * width + (x + 1)], // Right
          image[(y + 1) * width + (x + 1)], // Bottom-right
          image[(y + 1) * width + x], // Bottom
          image[(y + 1) * width + (x - 1)], // Bottom-left
          image[y * width + (x - 1)], // Left
        ];

        for (let i = 0; i < 8; i++) {
          if (neighbors[i] >= centerValue) {
            lbpValue |= 1 << i;
          }
        }

        histogram[lbpValue]++;
      }
    }

    // Normalize histogram
    const total = (width - 2) * (height - 2);
    if (total > 0) {
      for (let i = 0; i < histogram.length; i++) {
        histogram[i] /= total;
      }
    }

    return histogram;
  }

  /**
   * Extract edge-based features
   */
  private extractEdgeFeatures(
    image: Float32Array,
    width: number,
    height: number,
    _kernelSize: number,
  ): Float32Array {
    // Sobel operators
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    const gradX = this.applyKernel(image, width, height, sobelX, 3);
    const gradY = this.applyKernel(image, width, height, sobelY, 3);

    // Compute gradient magnitude and direction
    let totalMagnitude = 0;
    const directionBins = new Float32Array(8); // 8 direction bins

    for (let i = 0; i < gradX.length; i++) {
      const magnitude = Math.sqrt(gradX[i] * gradX[i] + gradY[i] * gradY[i]);
      const direction = Math.atan2(gradY[i], gradX[i]);

      totalMagnitude += magnitude;

      // Quantize direction to bins
      const directionDegrees = ((direction * 180) / Math.PI + 180) % 360;
      const binIndex = Math.floor(directionDegrees / 45);
      directionBins[binIndex] += magnitude;
    }

    // Normalize direction histogram
    if (totalMagnitude > 0) {
      for (let i = 0; i < directionBins.length; i++) {
        directionBins[i] /= totalMagnitude;
      }
    }

    // Return average magnitude and direction histogram
    const avgMagnitude = totalMagnitude / gradX.length;
    const features = new Float32Array(9);
    features[0] = avgMagnitude;
    features.set(directionBins, 1);

    return features;
  }

  /**
   * Apply convolution kernel to image
   */
  private applyKernel(
    image: Float32Array,
    width: number,
    height: number,
    kernel: number[],
    kernelSize: number,
  ): Float32Array {
    const result = new Float32Array(width * height);
    const padding = Math.floor(kernelSize / 2);

    for (let y = padding; y < height - padding; y++) {
      for (let x = padding; x < width - padding; x++) {
        let sum = 0;

        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const imageY = y + ky - padding;
            const imageX = x + kx - padding;
            const imageIndex = imageY * width + imageX;
            const kernelIndex = ky * kernelSize + kx;

            sum += image[imageIndex] * kernel[kernelIndex];
          }
        }

        result[y * width + x] = sum;
      }
    }

    return result;
  }

  /**
   * Extract statistical features
   */
  private extractStatisticalFeatures(
    image: Float32Array,
    _width: number,
    _height: number,
  ): Float32Array {
    // Compute basic statistical moments
    let mean = 0;
    let variance = 0;
    let skewness = 0;
    let kurtosis = 0;

    // Mean
    for (let i = 0; i < image.length; i++) {
      mean += image[i];
    }
    mean /= image.length;

    // Variance, skewness, kurtosis
    for (let i = 0; i < image.length; i++) {
      const diff = image[i] - mean;
      const diff2 = diff * diff;
      variance += diff2;
      skewness += diff * diff2;
      kurtosis += diff2 * diff2;
    }

    variance /= image.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
      skewness = skewness / image.length / Math.pow(stdDev, 3);
      kurtosis = kurtosis / image.length / Math.pow(stdDev, 4) - 3;
    }

    return new Float32Array([mean, variance, stdDev, skewness, kurtosis]);
  }

  /**
   * Compute texture metrics for scale importance
   */
  private computeTextureMetrics(
    image: Float32Array,
    width: number,
    height: number,
  ): {
    contrast: number;
    energy: number;
    homogeneity: number;
    entropy: number;
  } {
    // Simple GLCM computation for metrics
    const levels = 8;
    const quantized = this.quantizeImage(image, levels);
    const glcm = this.computeGLCM(quantized, width, height, levels, 1, 0);

    return {
      contrast: this.computeContrast(glcm, levels),
      energy: this.computeEnergy(glcm, levels),
      homogeneity: this.computeHomogeneity(glcm, levels),
      entropy: this.computeEntropy(glcm, levels),
    };
  }

  /**
   * Compute scale importance based on texture complexity
   */
  private computeScaleImportance(textureScales: TextureScale[]): Float32Array {
    const importance = new Float32Array(textureScales.length);
    let totalComplexity = 0;

    // Compute complexity score for each scale
    for (let i = 0; i < textureScales.length; i++) {
      const metrics = textureScales[i].textureMetrics;
      // Combine multiple metrics for complexity
      const complexity =
        metrics.contrast * 0.3 +
        metrics.entropy * 0.4 +
        (1 - metrics.homogeneity) * 0.3;
      importance[i] = complexity;
      totalComplexity += complexity;
    }

    // Normalize importance scores
    if (totalComplexity > 0) {
      for (let i = 0; i < importance.length; i++) {
        importance[i] /= totalComplexity;
      }
    } else {
      // Equal importance if no texture information
      importance.fill(1.0 / importance.length);
    }

    return importance;
  }

  /**
   * Fuse features from multiple scales
   */
  private async fuseScaleFeatures(
    scaleFeatures: Float32Array[],
    scaleImportance: Float32Array,
  ): Promise<Float32Array> {
    if (scaleFeatures.length === 0) {
      throw new Error('No scale features to fuse');
    }

    switch (this.config.fusionStrategy) {
      case 'concatenation':
        return this.concatenateFeatures(scaleFeatures);

      case 'weighted':
        return this.weightedFusion(scaleFeatures, scaleImportance);

      case 'attention':
        return this.attentionBasedFusion(scaleFeatures, scaleImportance);

      default:
        return this.concatenateFeatures(scaleFeatures);
    }
  }

  /**
   * Simple feature concatenation
   */
  private concatenateFeatures(scaleFeatures: Float32Array[]): Float32Array {
    const totalLength = scaleFeatures.reduce(
      (sum, features) => sum + features.length,
      0,
    );
    const concatenated = new Float32Array(totalLength);

    let offset = 0;
    for (const features of scaleFeatures) {
      concatenated.set(features, offset);
      offset += features.length;
    }

    return concatenated;
  }

  /**
   * Weighted feature fusion
   */
  private weightedFusion(
    scaleFeatures: Float32Array[],
    weights: Float32Array,
  ): Float32Array {
    const featureLength = scaleFeatures[0].length;
    const fused = new Float32Array(featureLength);

    for (let i = 0; i < featureLength; i++) {
      let weightedSum = 0;
      for (let j = 0; j < scaleFeatures.length; j++) {
        weightedSum += scaleFeatures[j][i] * weights[j];
      }
      fused[i] = weightedSum;
    }

    return fused;
  }

  /**
   * Attention-based feature fusion
   */
  private attentionBasedFusion(
    scaleFeatures: Float32Array[],
    importance: Float32Array,
  ): Float32Array {
    // Compute attention weights based on feature similarity and importance
    const attentionWeights = new Float32Array(scaleFeatures.length);

    for (let i = 0; i < scaleFeatures.length; i++) {
      attentionWeights[i] = importance[i] * this.fusionWeights[i];
    }

    // Normalize attention weights
    const totalWeight = attentionWeights.reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      for (let i = 0; i < attentionWeights.length; i++) {
        attentionWeights[i] /= totalWeight;
      }
    }

    return this.weightedFusion(scaleFeatures, attentionWeights);
  }

  /**
   * Compute attention weights for interpretability
   */
  private computeAttentionWeights(
    scaleFeatures: Float32Array[],
    fusedFeatures: Float32Array,
  ): Float32Array {
    const weights = new Float32Array(scaleFeatures.length);

    for (let i = 0; i < scaleFeatures.length; i++) {
      // Compute similarity between scale features and fused features
      weights[i] = this.computeCosineSimilarity(
        scaleFeatures[i],
        fusedFeatures,
      );
    }

    return weights;
  }

  /**
   * Compute cosine similarity between two feature vectors
   */
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

  /**
   * Compute overall texture complexity
   */
  private computeTextureComplexity(textureScales: TextureScale[]): number {
    let totalComplexity = 0;

    for (const scale of textureScales) {
      const metrics = scale.textureMetrics;
      const complexity =
        metrics.contrast * 0.25 +
        metrics.entropy * 0.25 +
        (1 - metrics.energy) * 0.25 +
        (1 - metrics.homogeneity) * 0.25;
      totalComplexity += complexity * scale.scaleFactor; // Weight by scale
    }

    return totalComplexity / textureScales.length;
  }

  /**
   * Update fusion weights during training
   */
  public updateFusionWeights(
    gradients: Float32Array,
    learningRate: number = 0.001,
  ): void {
    for (let i = 0; i < this.fusionWeights.length; i++) {
      this.fusionWeights[i] -= learningRate * gradients[i];
    }

    // Normalize fusion weights
    const sum = this.fusionWeights.reduce((s, w) => s + Math.abs(w), 0);
    if (sum > 0) {
      for (let i = 0; i < this.fusionWeights.length; i++) {
        this.fusionWeights[i] /= sum;
      }
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): ScaleConfig {
    return { ...this.config };
  }

  /**
   * Export module state for saving
   */
  public exportState(): Record<string, unknown> {
    return {
      config: this.config,
      fusionWeights: Array.from(this.fusionWeights),
      attentionWeights: this.attentionWeights.map((w) => Array.from(w)),
    };
  }

  /**
   * Import module state from saved data
   */
  public importState(state: Record<string, unknown>): void {
    this.config = { ...(state.config as ScaleConfig) };
    this.fusionWeights = new Float32Array(
      state.fusionWeights as ArrayLike<number>,
    );
    this.attentionWeights = (state.attentionWeights as number[][]).map(
      (w: number[]) => new Float32Array(w),
    );
  }
}
