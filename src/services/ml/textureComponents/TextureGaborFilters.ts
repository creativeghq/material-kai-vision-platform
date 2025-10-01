/**
 * TextureGaborFilters - Learnable Gabor filter banks for directional texture pattern detection
 *
 * Gabor filters are particularly effective for texture analysis as they capture both
 * spatial and frequency information. This implementation provides learnable parameters
 * for orientation, frequency, and spatial extent.
 */

export interface GaborFilterConfig {
  filterCount: number;
  kernelSize: number;
  sigmaX: number;
  sigmaY: number;
  orientations: number[];
  frequencies: number[];
  phases: number[];
  learnable: boolean;
}

export interface GaborFilterBank {
  filters: Float32Array[];
  orientations: Float32Array;
  frequencies: Float32Array;
  responses: Float32Array[];
  energyMaps: Float32Array[];
}

export interface TextureResponse {
  filterResponses: Float32Array[];
  orientationMap: Float32Array;
  frequencyMap: Float32Array;
  energyMap: Float32Array;
  dominantOrientation: number;
  dominantFrequency: number;
  textureEnergy: number;
}

export class TextureGaborFilters {
  private config: GaborFilterConfig;
  private filterBank: GaborFilterBank;
  private gradients: Map<string, Float32Array>;

  constructor(config: GaborFilterConfig) {
    this.config = config;
    this.gradients = new Map();
    this.initializeFilterBank();
  }

  /**
   * Initialize Gabor filter bank with specified orientations and frequencies
   */
  private initializeFilterBank(): void {
    const { filterCount, kernelSize, orientations, frequencies, phases } = this.config;

    this.filterBank = {
      filters: [],
      orientations: new Float32Array(orientations),
      frequencies: new Float32Array(frequencies),
      responses: [],
      energyMaps: [],
    };

    // Generate Gabor filters for each orientation-frequency combination
    let filterIndex = 0;
    for (let i = 0; i < orientations.length && filterIndex < filterCount; i++) {
      for (let j = 0; j < frequencies.length && filterIndex < filterCount; j++) {
        for (let k = 0; k < phases.length && filterIndex < filterCount; k++) {
          const filter = this.createGaborFilter(
            kernelSize,
            orientations[i],
            frequencies[j],
            phases[k],
          );
          this.filterBank.filters.push(filter);
          filterIndex++;
        }
      }
    }

    console.log(`Initialized ${this.filterBank.filters.length} Gabor filters`);
  }

  /**
   * Create a single Gabor filter with specified parameters
   */
  private createGaborFilter(
    kernelSize: number,
    orientation: number,
    frequency: number,
    phase: number,
  ): Float32Array {
    const filter = new Float32Array(kernelSize * kernelSize);
    const center = Math.floor(kernelSize / 2);
    const { sigmaX, sigmaY } = this.config;

    // Convert orientation to radians
    const theta = (orientation * Math.PI) / 180;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let y = 0; y < kernelSize; y++) {
      for (let x = 0; x < kernelSize; x++) {
        // Translate to center-based coordinates
        const xc = x - center;
        const yc = y - center;

        // Rotate coordinates
        const xTheta = xc * cosTheta + yc * sinTheta;
        const yTheta = -xc * sinTheta + yc * cosTheta;

        // Compute Gaussian envelope
        const gaussianX = Math.exp(-(xTheta * xTheta) / (2 * sigmaX * sigmaX));
        const gaussianY = Math.exp(-(yTheta * yTheta) / (2 * sigmaY * sigmaY));
        const gaussian = gaussianX * gaussianY;

        // Compute cosine wave
        const wave = Math.cos(2 * Math.PI * frequency * xTheta + phase);

        // Combine to create Gabor filter
        const filterIndex = y * kernelSize + x;
        filter[filterIndex] = gaussian * wave;
      }
    }

    // Normalize filter to have zero mean
    this.normalizeFilter(filter);

    return filter;
  }

  /**
   * Normalize filter to have zero mean and unit energy
   */
  private normalizeFilter(filter: Float32Array): void {
    // Compute mean
    let mean = 0;
    for (let i = 0; i < filter.length; i++) {
      mean += filter[i];
    }
    mean /= filter.length;

    // Subtract mean
    for (let i = 0; i < filter.length; i++) {
      filter[i] -= mean;
    }

    // Normalize to unit energy
    let energy = 0;
    for (let i = 0; i < filter.length; i++) {
      energy += filter[i] * filter[i];
    }

    if (energy > 0) {
      const scale = 1.0 / Math.sqrt(energy);
      for (let i = 0; i < filter.length; i++) {
        filter[i] *= scale;
      }
    }
  }

  /**
   * Apply Gabor filter bank to input image
   */
  public async applyFilterBank(
    image: Float32Array,
    width: number,
    height: number,
    channels: number = 1,
  ): Promise<TextureResponse> {
    try {
      // Convert to grayscale if multi-channel
      const grayImage = channels > 1 ? this.convertToGrayscale(image, width, height, channels) : image;

      // Apply each filter in the bank
      const filterResponses: Float32Array[] = [];
      for (let i = 0; i < this.filterBank.filters.length; i++) {
        const response = await this.applyFilter(grayImage, width, height, this.filterBank.filters[i]);
        filterResponses.push(response);
      }

      // Compute orientation and frequency maps
      const orientationMap = this.computeOrientationMap(filterResponses, width, height);
      const frequencyMap = this.computeFrequencyMap(filterResponses, width, height);
      const energyMap = this.computeEnergyMap(filterResponses, width, height);

      // Find dominant orientation and frequency
      const dominantOrientation = this.findDominantOrientation(orientationMap);
      const dominantFrequency = this.findDominantFrequency(frequencyMap);
      const textureEnergy = this.computeTextureEnergy(energyMap);

      return {
        filterResponses,
        orientationMap,
        frequencyMap,
        energyMap,
        dominantOrientation,
        dominantFrequency,
        textureEnergy,
      };

    } catch (error) {
      console.error('Error applying Gabor filter bank:', error);
      throw new Error(`Gabor filter processing failed: ${error.message}`);
    }
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
          // RGB to grayscale using luminance weights
          grayImage[pixelIndex] =
            0.299 * image[colorIndex] +
            0.587 * image[colorIndex + 1] +
            0.114 * image[colorIndex + 2];
        } else if (channels === 4) {
          // RGBA to grayscale
          grayImage[pixelIndex] =
            0.299 * image[colorIndex] +
            0.587 * image[colorIndex + 1] +
            0.114 * image[colorIndex + 2];
        } else {
          // Just take the first channel
          grayImage[pixelIndex] = image[colorIndex];
        }
      }
    }

    return grayImage;
  }

  /**
   * Apply a single Gabor filter using convolution
   */
  private async applyFilter(
    image: Float32Array,
    width: number,
    height: number,
    filter: Float32Array,
  ): Promise<Float32Array> {
    const kernelSize = Math.sqrt(filter.length);
    const padding = Math.floor(kernelSize / 2);
    const response = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;

        // Convolution operation
        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const imageY = y + ky - padding;
            const imageX = x + kx - padding;

            // Handle boundary conditions with reflection
            const boundedY = this.reflectBoundary(imageY, height);
            const boundedX = this.reflectBoundary(imageX, width);

            const imageIndex = boundedY * width + boundedX;
            const filterIndex = ky * kernelSize + kx;

            sum += image[imageIndex] * filter[filterIndex];
          }
        }

        response[y * width + x] = sum;
      }
    }

    return response;
  }

  /**
   * Handle boundary conditions using reflection
   */
  private reflectBoundary(coordinate: number, size: number): number {
    if (coordinate < 0) {
      return Math.abs(coordinate);
    } else if (coordinate >= size) {
      return size - 1 - (coordinate - size);
    }
    return coordinate;
  }

  /**
   * Compute orientation map from filter responses
   */
  private computeOrientationMap(
    responses: Float32Array[],
    width: number,
    height: number,
  ): Float32Array {
    const orientationMap = new Float32Array(width * height);
    const { orientations } = this.config;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        let maxResponse = -Infinity;
        let bestOrientation = 0;

        // Find orientation with maximum response
        for (let i = 0; i < responses.length; i++) {
          const response = Math.abs(responses[i][pixelIndex]);
          if (response > maxResponse) {
            maxResponse = response;
            bestOrientation = orientations[i % orientations.length];
          }
        }

        orientationMap[pixelIndex] = bestOrientation;
      }
    }

    return orientationMap;
  }

  /**
   * Compute frequency map from filter responses
   */
  private computeFrequencyMap(
    responses: Float32Array[],
    width: number,
    height: number,
  ): Float32Array {
    const frequencyMap = new Float32Array(width * height);
    const { frequencies } = this.config;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        let maxResponse = -Infinity;
        let bestFrequency = 0;

        // Find frequency with maximum response
        for (let i = 0; i < responses.length; i++) {
          const response = Math.abs(responses[i][pixelIndex]);
          if (response > maxResponse) {
            maxResponse = response;
            bestFrequency = frequencies[Math.floor(i / this.config.orientations.length) % frequencies.length];
          }
        }

        frequencyMap[pixelIndex] = bestFrequency;
      }
    }

    return frequencyMap;
  }

  /**
   * Compute energy map from filter responses
   */
  private computeEnergyMap(
    responses: Float32Array[],
    width: number,
    height: number,
  ): Float32Array {
    const energyMap = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        let energy = 0;

        // Compute energy as sum of squared responses
        for (let i = 0; i < responses.length; i++) {
          const response = responses[i][pixelIndex];
          energy += response * response;
        }

        energyMap[pixelIndex] = Math.sqrt(energy);
      }
    }

    return energyMap;
  }

  /**
   * Find dominant orientation across the entire image
   */
  private findDominantOrientation(orientationMap: Float32Array): number {
    const orientationCounts = new Map<number, number>();

    for (let i = 0; i < orientationMap.length; i++) {
      const orientation = Math.round(orientationMap[i]);
      orientationCounts.set(orientation, (orientationCounts.get(orientation) || 0) + 1);
    }

    let maxCount = 0;
    let dominantOrientation = 0;

    for (const [orientation, count] of orientationCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantOrientation = orientation;
      }
    }

    return dominantOrientation;
  }

  /**
   * Find dominant frequency across the entire image
   */
  private findDominantFrequency(frequencyMap: Float32Array): number {
    const frequencyCounts = new Map<number, number>();

    for (let i = 0; i < frequencyMap.length; i++) {
      const frequency = Math.round(frequencyMap[i] * 100) / 100; // Round to 2 decimal places
      frequencyCounts.set(frequency, (frequencyCounts.get(frequency) || 0) + 1);
    }

    let maxCount = 0;
    let dominantFrequency = 0;

    for (const [frequency, count] of frequencyCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantFrequency = frequency;
      }
    }

    return dominantFrequency;
  }

  /**
   * Compute overall texture energy
   */
  private computeTextureEnergy(energyMap: Float32Array): number {
    let totalEnergy = 0;
    for (let i = 0; i < energyMap.length; i++) {
      totalEnergy += energyMap[i];
    }
    return totalEnergy / energyMap.length;
  }

  /**
   * Update filter parameters during training (if learnable)
   */
  public updateParameters(gradients: Map<string, Float32Array>, learningRate: number = 0.001): void {
    if (!this.config.learnable) {
      return;
    }

    // Update orientations
    const orientationGradients = gradients.get('orientations');
    if (orientationGradients) {
      for (let i = 0; i < this.config.orientations.length; i++) {
        this.config.orientations[i] -= learningRate * orientationGradients[i];
        // Clamp to valid range [0, 180)
        this.config.orientations[i] = Math.max(0, Math.min(179, this.config.orientations[i]));
      }
    }

    // Update frequencies
    const frequencyGradients = gradients.get('frequencies');
    if (frequencyGradients) {
      for (let i = 0; i < this.config.frequencies.length; i++) {
        this.config.frequencies[i] -= learningRate * frequencyGradients[i];
        // Clamp to valid range (0, 1]
        this.config.frequencies[i] = Math.max(0.01, Math.min(1, this.config.frequencies[i]));
      }
    }

    // Regenerate filter bank with updated parameters
    this.initializeFilterBank();
  }

  /**
   * Get filter bank for visualization or analysis
   */
  public getFilterBank(): GaborFilterBank {
    return this.filterBank;
  }

  /**
   * Save filter parameters for later use
   */
  public exportParameters(): unknown {
    return {
      config: this.config,
      filterBank: {
        orientations: Array.from(this.filterBank.orientations),
        frequencies: Array.from(this.filterBank.frequencies),
      },
    };
  }

  /**
   * Load filter parameters from saved state
   */
  public importParameters(params: Record<string, unknown>): void {
    this.config = { ...this.config, ...(params.config as Record<string, unknown>) };
    this.filterBank.orientations = new Float32Array((params.filterBank as Record<string, unknown>).orientations as number[]);
    this.filterBank.frequencies = new Float32Array((params.filterBank as Record<string, unknown>).frequencies as number[]);
    this.initializeFilterBank();
  }
}
