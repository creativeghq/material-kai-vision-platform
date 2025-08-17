/**
 * MaterialEmbeddingSpace - Unified embedding space for materials
 * Creates semantically meaningful material representations for similarity search and clustering
 */

import { CrossModalFeatures } from './CrossModalLearning';

export interface MaterialEmbedding {
  id: string;
  embedding: Float32Array;
  materialType: string;
  properties: Record<string, any>;
  confidence: number;
  timestamp: number;
}

export interface EmbeddingSpaceConfig {
  embeddingDim: number;
  materialCategories: string[];
  similarityThreshold: number;
  clusteringMethod: 'kmeans' | 'hierarchical' | 'dbscan';
  updateStrategy: 'incremental' | 'batch';
}

export interface SimilarityResult {
  materialId: string;
  similarity: number;
  materialType: string;
  properties: Record<string, any>;
  distance: number;
}

export interface ClusterResult {
  clusterId: number;
  materials: string[];
  centroid: Float32Array;
  coherence: number;
  size: number;
}

export class MaterialEmbeddingSpace {
  private config: EmbeddingSpaceConfig;
  private embeddings: Map<string, MaterialEmbedding>;
  private materialTypeIndex: Map<string, string[]>;
  private clusters: ClusterResult[];
  private embeddingMatrix: Float32Array;

  constructor(config: EmbeddingSpaceConfig) {
    this.config = config;
    this.embeddings = new Map();
    this.materialTypeIndex = new Map();
    this.clusters = [];
    this.embeddingMatrix = new Float32Array(0);
  }

  /**
   * Add or update material embedding
   */
  addMaterialEmbedding(
    materialId: string,
    crossModalFeatures: CrossModalFeatures,
    materialType: string,
    properties: Record<string, any>,
  ): MaterialEmbedding {
    // Project cross-modal features to embedding space
    const embedding = this.projectToEmbeddingSpace(crossModalFeatures);

    const materialEmbedding: MaterialEmbedding = {
      id: materialId,
      embedding,
      materialType,
      properties,
      confidence: crossModalFeatures.crossModalSimilarity,
      timestamp: Date.now(),
    };

    this.embeddings.set(materialId, materialEmbedding);
    this.updateMaterialTypeIndex(materialId, materialType);

    // Update embedding matrix for efficient batch operations
    this.updateEmbeddingMatrix();

    return materialEmbedding;
  }

  /**
   * Project cross-modal features to unified embedding space
   */
  private projectToEmbeddingSpace(features: CrossModalFeatures): Float32Array {
    const embedding = new Float32Array(this.config.embeddingDim);

    // Weighted combination of multi-modal features
    const sourceFeatures = [
      { features: features.visualFeatures, weight: 0.3 },
      { features: features.spectralFeatures, weight: 0.25 },
      { features: features.thermalFeatures, weight: 0.2 },
      { features: features.textualFeatures, weight: 0.15 },
      { features: features.fusedFeatures, weight: 0.1 },
    ];

    let offset = 0;
    sourceFeatures.forEach(({ features, weight }) => {
      const projectionSize = Math.floor(this.config.embeddingDim * weight);

      for (let i = 0; i < Math.min(features.length, projectionSize); i++) {
        if (offset + i < embedding.length) {
          embedding[offset + i] = features[i];
        }
      }
      offset += projectionSize;
    });

    return this.normalizeEmbedding(embedding);
  }

  /**
   * Find similar materials using cosine similarity
   */
  findSimilarMaterials(
    queryEmbedding: Float32Array,
    topK: number = 10,
    materialTypeFilter?: string,
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    const candidateIds = materialTypeFilter
      ? this.materialTypeIndex.get(materialTypeFilter) || []
      : Array.from(this.embeddings.keys());

    candidateIds.forEach(materialId => {
      const material = this.embeddings.get(materialId)!;
      const similarity = this.computeCosineSimilarity(queryEmbedding, material.embedding);
      const distance = 1.0 - similarity;

      if (similarity >= this.config.similarityThreshold) {
        results.push({
          materialId,
          similarity,
          materialType: material.materialType,
          properties: material.properties,
          distance,
        });
      }
    });

    // Sort by similarity (descending) and return top K
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Perform material clustering
   */
  clusterMaterials(numClusters?: number): ClusterResult[] {
    if (this.embeddings.size < 2) {
      return [];
    }

    const embeddings = Array.from(this.embeddings.values());
    const k = numClusters || Math.min(10, Math.ceil(Math.sqrt(embeddings.length)));

    switch (this.config.clusteringMethod) {
      case 'kmeans':
        return this.performKMeansClustering(embeddings, k);
      case 'hierarchical':
        return this.performHierarchicalClustering(embeddings, k);
      case 'dbscan':
        return this.performDBSCANClustering(embeddings);
      default:
        return this.performKMeansClustering(embeddings, k);
    }
  }

  /**
   * K-means clustering implementation
   */
  private performKMeansClustering(embeddings: MaterialEmbedding[], k: number): ClusterResult[] {
    const maxIterations = 100;
    const tolerance = 1e-4;

    // Initialize centroids randomly
    let centroids = this.initializeRandomCentroids(k);
    let assignments = new Array(embeddings.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign points to nearest centroids
      const newAssignments = embeddings.map((embedding, index) => {
        let bestCluster = 0;
        let bestDistance = Infinity;

        centroids.forEach((centroid, clusterIndex) => {
          const distance = this.computeEuclideanDistance(embedding.embedding, centroid);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCluster = clusterIndex;
          }
        });

        return bestCluster;
      });

      // Check convergence
      if (this.arraysEqual(assignments, newAssignments)) {
        break;
      }

      assignments = newAssignments;

      // Update centroids
      const newCentroids = this.updateCentroids(embeddings, assignments, k);

      // Check centroid convergence
      let converged = true;
      for (let i = 0; i < k; i++) {
        const distance = this.computeEuclideanDistance(centroids[i], newCentroids[i]);
        if (distance > tolerance) {
          converged = false;
          break;
        }
      }

      centroids = newCentroids;
      if (converged) break;
    }

    // Build cluster results
    return this.buildClusterResults(embeddings, assignments, centroids, k);
  }

  /**
   * Hierarchical clustering (simplified agglomerative)
   */
  private performHierarchicalClustering(embeddings: MaterialEmbedding[], k: number): ClusterResult[] {
    // Start with each point as its own cluster
    let clusters = embeddings.map((embedding, index) => ({
      points: [index],
      centroid: new Float32Array(embedding.embedding),
    }));

    // Merge closest clusters until we have k clusters
    while (clusters.length > k) {
      let minDistance = Infinity;
      let mergeIndices = [0, 1];

      // Find closest pair of clusters
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const distance = this.computeEuclideanDistance(
            clusters[i].centroid,
            clusters[j].centroid,
          );
          if (distance < minDistance) {
            minDistance = distance;
            mergeIndices = [i, j];
          }
        }
      }

      // Merge closest clusters
      const [i, j] = mergeIndices;
      const mergedPoints = [...clusters[i].points, ...clusters[j].points];
      const mergedCentroid = this.computeClusterCentroid(
        mergedPoints.map(pointIndex => embeddings[pointIndex]),
      );

      clusters = [
        ...clusters.slice(0, i),
        ...clusters.slice(i + 1, j),
        ...clusters.slice(j + 1),
        { points: mergedPoints, centroid: mergedCentroid },
      ];
    }

    // Convert to cluster results
    return clusters.map((cluster, index) => ({
      clusterId: index,
      materials: cluster.points.map(pointIndex => embeddings[pointIndex].id),
      centroid: cluster.centroid,
      coherence: this.computeClusterCoherence(
        cluster.points.map(pointIndex => embeddings[pointIndex]),
        cluster.centroid,
      ),
      size: cluster.points.length,
    }));
  }

  /**
   * DBSCAN clustering implementation
   */
  private performDBSCANClustering(embeddings: MaterialEmbedding[]): ClusterResult[] {
    const eps = 0.3; // Neighborhood radius
    const minPts = 3; // Minimum points for core point

    const labels = new Array(embeddings.length).fill(-1); // -1 = noise
    let clusterId = 0;

    for (let i = 0; i < embeddings.length; i++) {
      if (labels[i] !== -1) continue; // Already processed

      const neighbors = this.findNeighbors(embeddings, i, eps);

      if (neighbors.length < minPts) {
        labels[i] = -1; // Mark as noise
        continue;
      }

      // Start new cluster
      labels[i] = clusterId;
      const seedSet = [...neighbors];

      let j = 0;
      while (j < seedSet.length) {
        const q = seedSet[j];

        if (labels[q] === -1) {
          labels[q] = clusterId; // Change noise to border point
        }

        if (labels[q] !== -1) {
          j++;
          continue; // Already processed
        }

        labels[q] = clusterId;
        const qNeighbors = this.findNeighbors(embeddings, q, eps);

        if (qNeighbors.length >= minPts) {
          seedSet.push(...qNeighbors);
        }

        j++;
      }

      clusterId++;
    }

    // Build cluster results
    const clusterMap = new Map<number, number[]>();
    labels.forEach((label, index) => {
      if (label >= 0) {
        if (!clusterMap.has(label)) {
          clusterMap.set(label, []);
        }
        clusterMap.get(label)!.push(index);
      }
    });

    return Array.from(clusterMap.entries()).map(([id, indices]) => {
      const clusterEmbeddings = indices.map(i => embeddings[i]);
      const centroid = this.computeClusterCentroid(clusterEmbeddings);

      return {
        clusterId: id,
        materials: indices.map(i => embeddings[i].id),
        centroid,
        coherence: this.computeClusterCoherence(clusterEmbeddings, centroid),
        size: indices.length,
      };
    });
  }

  // Utility methods
  private updateMaterialTypeIndex(materialId: string, materialType: string): void {
    if (!this.materialTypeIndex.has(materialType)) {
      this.materialTypeIndex.set(materialType, []);
    }

    const typeList = this.materialTypeIndex.get(materialType)!;
    if (!typeList.includes(materialId)) {
      typeList.push(materialId);
    }
  }

  private updateEmbeddingMatrix(): void {
    const embeddings = Array.from(this.embeddings.values());
    this.embeddingMatrix = new Float32Array(embeddings.length * this.config.embeddingDim);

    embeddings.forEach((embedding, index) => {
      const offset = index * this.config.embeddingDim;
      for (let i = 0; i < this.config.embeddingDim; i++) {
        this.embeddingMatrix[offset + i] = embedding.embedding[i];
      }
    });
  }

  private normalizeEmbedding(embedding: Float32Array): Float32Array {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? embedding.map(val => val / norm) : embedding;
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

  private computeEuclideanDistance(a: Float32Array, b: Float32Array): number {
    const minLength = Math.min(a.length, b.length);
    let sum = 0;

    for (let i = 0; i < minLength; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  private initializeRandomCentroids(k: number): Float32Array[] {
    const centroids: Float32Array[] = [];

    for (let i = 0; i < k; i++) {
      const centroid = new Float32Array(this.config.embeddingDim);
      for (let j = 0; j < this.config.embeddingDim; j++) {
        centroid[j] = Math.random() * 2 - 1; // Random values in [-1, 1]
      }
      centroids.push(this.normalizeEmbedding(centroid));
    }

    return centroids;
  }

  private updateCentroids(
    embeddings: MaterialEmbedding[],
    assignments: number[],
    k: number,
  ): Float32Array[] {
    const centroids: Float32Array[] = [];

    for (let i = 0; i < k; i++) {
      const clusterPoints = embeddings.filter((_, index) => assignments[index] === i);
      if (clusterPoints.length > 0) {
        centroids.push(this.computeClusterCentroid(clusterPoints));
      } else {
        // Empty cluster, reinitialize randomly
        centroids.push(this.initializeRandomCentroids(1)[0]);
      }
    }

    return centroids;
  }

  private computeClusterCentroid(embeddings: MaterialEmbedding[]): Float32Array {
    if (embeddings.length === 0) {
      return new Float32Array(this.config.embeddingDim);
    }

    const centroid = new Float32Array(this.config.embeddingDim);

    embeddings.forEach(embedding => {
      for (let i = 0; i < centroid.length; i++) {
        centroid[i] += embedding.embedding[i];
      }
    });

    for (let i = 0; i < centroid.length; i++) {
      centroid[i] /= embeddings.length;
    }

    return this.normalizeEmbedding(centroid);
  }

  private computeClusterCoherence(
    embeddings: MaterialEmbedding[],
    centroid: Float32Array,
  ): number {
    if (embeddings.length === 0) return 0;

    const distances = embeddings.map(embedding =>
      this.computeEuclideanDistance(embedding.embedding, centroid),
    );

    const avgDistance = distances.reduce((sum, dist) => sum + dist, 0) / distances.length;
    return Math.max(0, 1 - avgDistance); // Convert distance to coherence score
  }

  private findNeighbors(
    embeddings: MaterialEmbedding[],
    pointIndex: number,
    eps: number,
  ): number[] {
    const neighbors: number[] = [];
    const point = embeddings[pointIndex];

    embeddings.forEach((other, index) => {
      if (index !== pointIndex) {
        const distance = this.computeEuclideanDistance(point.embedding, other.embedding);
        if (distance <= eps) {
          neighbors.push(index);
        }
      }
    });

    return neighbors;
  }

  private buildClusterResults(
    embeddings: MaterialEmbedding[],
    assignments: number[],
    centroids: Float32Array[],
    k: number,
  ): ClusterResult[] {
    const results: ClusterResult[] = [];

    for (let i = 0; i < k; i++) {
      const clusterMaterials = embeddings
        .filter((_, index) => assignments[index] === i)
        .map(embedding => embedding.id);

      if (clusterMaterials.length > 0) {
        const clusterEmbeddings = embeddings.filter((_, index) => assignments[index] === i);
        const coherence = this.computeClusterCoherence(clusterEmbeddings, centroids[i]);

        results.push({
          clusterId: i,
          materials: clusterMaterials,
          centroid: centroids[i],
          coherence,
          size: clusterMaterials.length,
        });
      }
    }

    return results;
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
  }

  /**
   * Get embedding space statistics
   */
  getEmbeddingSpaceStats(): {
    totalMaterials: number;
    embeddingDimension: number;
    materialTypes: string[];
    clusters: number;
    averageClusterSize: number;
  } {
    return {
      totalMaterials: this.embeddings.size,
      embeddingDimension: this.config.embeddingDim,
      materialTypes: Array.from(this.materialTypeIndex.keys()),
      clusters: this.clusters.length,
      averageClusterSize: this.clusters.length > 0
        ? this.clusters.reduce((sum, cluster) => sum + cluster.size, 0) / this.clusters.length
        : 0,
    };
  }
}
