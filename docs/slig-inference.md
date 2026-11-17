# SigLIP2-base-patch16-512 API Specification

## Endpoint

SLIG runs on **Modal** (moved off HuggingFace 2026-06-14):

```
POST https://basilakis--slig-sligservice-web.modal.run/infer
```

## Authentication

```
Authorization: Bearer <SLIG_MODAL_API_KEY>
Content-Type: application/json
```

---

## Modes

The API supports 4 modes: `zero_shot`, `image_embedding`, `text_embedding`, `similarity`. Mode is auto-detected from input structure or can be explicitly set via `parameters.mode`.

---

## Mode 1: Zero-Shot Classification

Classify an image against a list of candidate text labels.

### Request

```json
{
    "inputs": "<image_url_or_base64>",
    "parameters": {
        "candidate_labels": ["label1", "label2", "label3"]
    }
}
```

### Request (Batch)

```json
{
    "inputs": ["<image1_url>", "<image2_url>"],
    "parameters": {
        "candidate_labels": ["label1", "label2", "label3"]
    }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputs` | string \| string[] | Yes | Image URL (http/https) or base64-encoded image string. Can be array for batch. |
| `parameters.candidate_labels` | string[] | Yes | List of text labels to classify against. |
| `parameters.mode` | string | No | Explicitly set to `"zero_shot"`. Auto-detected if `candidate_labels` present. |

### Response (Single Image)

```json
[
    {"label": "ceramic tile", "score": 0.8234},
    {"label": "porcelain tile", "score": 0.1521},
    {"label": "natural stone", "score": 0.0245}
]
```

### Response (Batch)

```json
[
    [
        {"label": "ceramic tile", "score": 0.8234},
        {"label": "porcelain tile", "score": 0.1521}
    ],
    [
        {"label": "wood flooring", "score": 0.7891},
        {"label": "laminate", "score": 0.2109}
    ]
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | The candidate label |
| `score` | float | Probability score (0-1), softmax normalized. All scores sum to 1. |

Results are sorted by score descending.

---

## Mode 2: Image Embedding

Extract normalized 768-dimensional embedding vectors from images.

### Request

```json
{
    "inputs": "<image_url_or_base64>",
    "parameters": {
        "mode": "image_embedding"
    }
}
```

### Request (Batch)

```json
{
    "inputs": ["<image1_url>", "<image2_url>", "<image3_url>"],
    "parameters": {
        "mode": "image_embedding"
    }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputs` | string \| string[] | Yes | Image URL or base64 string. Array for batch processing. |
| `parameters.mode` | string | Yes | Must be `"image_embedding"` |

### Response

```json
[
    {"embedding": [0.0234, -0.0891, 0.1234, ..., -0.0567]}
]
```

### Response (Batch)

```json
[
    {"embedding": [0.0234, -0.0891, ...]},
    {"embedding": [0.1123, -0.0456, ...]},
    {"embedding": [-0.0789, 0.0234, ...]}
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `embedding` | float[768] | L2-normalized embedding vector. Dimension is always 768. |

---

## Mode 3: Text Embedding

Extract normalized 768-dimensional embedding vectors from text.

### Request

```json
{
    "inputs": "a photo of ceramic floor tiles",
    "parameters": {
        "mode": "text_embedding"
    }
}
```

### Request (Batch)

```json
{
    "inputs": [
        "ceramic tile with matte finish",
        "glossy porcelain tile",
        "natural wood flooring"
    ],
    "parameters": {
        "mode": "text_embedding"
    }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputs` | string \| string[] | Yes | Text string or array of text strings. |
| `parameters.mode` | string | Yes | Must be `"text_embedding"` |

### Response

```json
[
    {"embedding": [0.0567, -0.1234, 0.0891, ..., 0.0345]}
]
```

### Response (Batch)

```json
[
    {"embedding": [0.0567, -0.1234, ...]},
    {"embedding": [0.0891, -0.0456, ...]},
    {"embedding": [-0.0234, 0.0789, ...]}
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `embedding` | float[768] | L2-normalized embedding vector. Dimension is always 768. |

---

## Mode 4: Similarity Scoring

Calculate cosine similarity scores between image(s) and text(s).

### Request

```json
{
    "inputs": {
        "image": "<image_url_or_base64>",
        "texts": ["description 1", "description 2", "description 3"]
    },
    "parameters": {
        "mode": "similarity"
    }
}
```

### Request (Multiple Images)

```json
{
    "inputs": {
        "images": ["<image1_url>", "<image2_url>"],
        "texts": ["ceramic tile", "wood flooring", "heat pump"]
    },
    "parameters": {
        "mode": "similarity"
    }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputs.image` | string | Yes* | Single image URL or base64. Use `image` or `images`. |
| `inputs.images` | string[] | Yes* | Array of image URLs or base64 strings. Use `image` or `images`. |
| `inputs.text` | string | Yes* | Single text string. Use `text` or `texts`. |
| `inputs.texts` | string[] | Yes* | Array of text strings. Use `text` or `texts`. |
| `parameters.mode` | string | No | Set to `"similarity"`. Auto-detected if inputs has `image` and `texts` keys. |

### Response

```json
{
    "similarity_scores": [[0.8912, 0.2345, 0.1234]],
    "image_count": 1,
    "text_count": 3
}
```

### Response (Multiple Images)

```json
{
    "similarity_scores": [
        [0.8912, 0.2345, 0.1234],
        [0.1567, 0.8901, 0.0987]
    ],
    "image_count": 2,
    "text_count": 3
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `similarity_scores` | float[][] | Matrix of shape [image_count, text_count]. Each value is cosine similarity (-1 to 1, typically 0 to 1 for this model). |
| `image_count` | int | Number of images processed |
| `text_count` | int | Number of texts processed |

Matrix interpretation: `similarity_scores[i][j]` = similarity between image i and text j.

---

## Image Input Formats

The API accepts images in three formats:

| Format | Example | Description |
|--------|---------|-------------|
| HTTP URL | `"https://example.com/image.jpg"` | Direct URL to image. Must be publicly accessible. |
| HTTPS URL | `"https://cdn.example.com/image.png"` | Secure URL to image. |
| Base64 | `"iVBORw0KGgoAAAANSUhEUgAA..."` | Raw base64-encoded image bytes (no data URI prefix). |

Supported image formats: JPEG, PNG, GIF, WebP, BMP

---

## Auto-Detection Logic

If `parameters.mode` is not specified, the API auto-detects:

| Condition | Detected Mode |
|-----------|---------------|
| `inputs` has keys `image`/`images` AND `text`/`texts` | `similarity` |
| `parameters.candidate_labels` is present | `zero_shot` |
| `inputs` is array of short strings (< 500 chars, no http prefix) | `text_embedding` |
| Otherwise | `image_embedding` |

Recommendation: Always explicitly set `mode` for predictable behavior.

---

## Error Responses

### Missing Required Field

```json
{
    "error": "candidate_labels is required for zero-shot classification"
}
```

### Invalid Image

```json
{
    "error": "Unsupported image input type: <class 'NoneType'>"
}
```

### Unknown Mode

```json
{
    "error": "Unknown mode: invalid_mode. Supported: zero_shot, image_embedding, text_embedding, similarity"
}
```

---

## Complete Examples

### Example 1: Classify Product Image

```bash
curl -X POST "https://basilakis--slig-sligservice-web.modal.run/infer" \
  -H "Authorization: Bearer $SLIG_MODAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": "https://catalog.example.com/products/tile-001.jpg",
    "parameters": {
      "candidate_labels": [
        "ceramic floor tile",
        "porcelain wall tile",
        "natural stone slab",
        "mosaic tile sheet",
        "wood laminate plank",
        "vinyl flooring",
        "heat pump outdoor unit",
        "heat pump indoor unit",
        "technical diagram",
        "company logo"
      ]
    }
  }'
```

### Example 2: Build Product Search Index

```bash
curl -X POST "https://basilakis--slig-sligservice-web.modal.run/infer" \
  -H "Authorization: Bearer $SLIG_MODAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      "https://catalog.example.com/products/tile-001.jpg",
      "https://catalog.example.com/products/tile-002.jpg",
      "https://catalog.example.com/products/tile-003.jpg"
    ],
    "parameters": {
      "mode": "image_embedding"
    }
  }'
```

### Example 3: Embed Product Descriptions

```bash
curl -X POST "https://basilakis--slig-sligservice-web.modal.run/infer" \
  -H "Authorization: Bearer $SLIG_MODAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      "matte finish ceramic tile 60x60cm",
      "glossy white porcelain tile",
      "rustic oak wood flooring",
      "inverter heat pump 12kW"
    ],
    "parameters": {
      "mode": "text_embedding"
    }
  }'
```

### Example 4: Match Image to Descriptions

```bash
curl -X POST "https://basilakis--slig-sligservice-web.modal.run/infer" \
  -H "Authorization: Bearer $SLIG_MODAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "image": "https://catalog.example.com/products/unknown-product.jpg",
      "texts": [
        "beige ceramic floor tile with matte finish",
        "white glossy porcelain wall tile",
        "gray natural stone tile with rough texture",
        "colorful mosaic glass tile"
      ]
    },
    "parameters": {
      "mode": "similarity"
    }
  }'
```

### Example 5: Python Client

```python
import requests
import base64

API_URL = "https://basilakis--slig-sligservice-web.modal.run/infer"
HEADERS = {"Authorization": "Bearer <SLIG_MODAL_API_KEY>"}

# Zero-shot classification
def classify_product(image_url: str, labels: list[str]) -> list[dict]:
    response = requests.post(API_URL, headers=HEADERS, json={
        "inputs": image_url,
        "parameters": {"candidate_labels": labels}
    })
    return response.json()

# Get image embedding
def get_image_embedding(image_url: str) -> list[float]:
    response = requests.post(API_URL, headers=HEADERS, json={
        "inputs": image_url,
        "parameters": {"mode": "image_embedding"}
    })
    return response.json()[0]["embedding"]

# Get text embedding
def get_text_embedding(text: str) -> list[float]:
    response = requests.post(API_URL, headers=HEADERS, json={
        "inputs": text,
        "parameters": {"mode": "text_embedding"}
    })
    return response.json()[0]["embedding"]

# Similarity scoring
def get_similarity(image_url: str, texts: list[str]) -> list[float]:
    response = requests.post(API_URL, headers=HEADERS, json={
        "inputs": {"image": image_url, "texts": texts},
        "parameters": {"mode": "similarity"}
    })
    return response.json()["similarity_scores"][0]

# From local file (base64)
def classify_local_image(file_path: str, labels: list[str]) -> list[dict]:
    with open(file_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()
    response = requests.post(API_URL, headers=HEADERS, json={
        "inputs": image_b64,
        "parameters": {"candidate_labels": labels}
    })
    return response.json()
```

---

## Model Specifications

| Property | Value |
|----------|-------|
| Model | google/siglip2-base-patch16-512 |
| Parameters | ~400M |
| Input Resolution | 512 x 512 pixels |
| Embedding Dimension | 768 |
| Normalization | L2 (embeddings are unit vectors) |
| Similarity Metric | Cosine similarity (dot product of normalized vectors) |

---

## Rate Limits & Performance

Depends on your Inference Endpoint instance type. Typical latencies:

| Instance | Single Image | Batch (10 images) |
|----------|--------------|-------------------|
| GPU (T4) | ~50-100ms | ~200-400ms |
| GPU (A10G) | ~30-60ms | ~100-200ms |
| CPU | ~500-2000ms | ~2000-5000ms |

GPU recommended for production workloads.