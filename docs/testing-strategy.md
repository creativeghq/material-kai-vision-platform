# Testing Strategy Documentation

## 🧪 Testing Architecture Overview

The Material Kai Vision Platform implements a comprehensive testing strategy across multiple layers:

1. **Unit Testing** - Individual component/function testing
2. **Integration Testing** - Service interaction testing
3. **End-to-End Testing** - Complete workflow testing
4. **Performance Testing** - Load and stress testing
5. **Security Testing** - Vulnerability and penetration testing

## 📊 Current Testing Infrastructure

### Frontend Testing (Jest + React Testing Library)

**Configuration**: `jest.config.js`
```javascript
{
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
}
```

**Test Structure**:
```
tests/
├── unit/                    # Unit tests
│   ├── validation/         # Validation layer tests
│   ├── batch/             # Batch processing tests
│   └── integration/       # Integration layer tests
├── integration/           # Service composition tests
├── performance/          # Performance and load tests
├── e2e/                 # End-to-end pipeline tests
├── fixtures/            # Test data and sample files
├── mocks/              # Mock implementations
└── utils/              # Test utilities and helpers
```

### Backend Testing (Python/pytest)

**Configuration**: `mivaa-pdf-extractor/pytest.ini`
```ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
addopts = -v --tb=short --strict-markers --color=yes
markers =
    unit: Unit tests
    integration: Integration tests
    e2e: End-to-end tests
    performance: Performance tests
    security: Security tests
```

**Test Categories**:
- `unit/` - Individual function testing
- `integration/` - Service interaction testing
- `e2e/` - Complete workflow testing
- `performance/` - Load testing
- `security/` - Security validation

## 🎯 Testing Coverage Goals

### Coverage Targets

| Component | Target Coverage | Current Status |
|-----------|----------------|----------------|
| Frontend Components | 95% | ⚠️ Unknown |
| Backend Services | 95% | ⚠️ Unknown |
| MIVAA Service | 98% | ⚠️ Unknown |
| API Endpoints | 100% | ⚠️ Unknown |
| Critical Paths | 100% | ⚠️ Unknown |

### Quality Gates

**Unit Tests**:
- Execution time: <5 minutes
- Pass rate: >99%
- Coverage: >95%

**Integration Tests**:
- Execution time: <15 minutes
- Pass rate: >95%
- Service compatibility: 100%

**E2E Tests**:
- Execution time: <30 minutes
- Pass rate: >90%
- Critical workflows: 100%

## 🔧 Test Implementation

### 1. Unit Testing Strategy

#### Frontend Unit Tests
```typescript
// Example: Component testing
import { render, screen } from '@testing-library/react';
import { MaterialRecognition } from '@/components/Recognition/MaterialRecognition';

describe('MaterialRecognition', () => {
  it('should render upload interface', () => {
    render(<MaterialRecognition />);
    expect(screen.getByText('Upload Image')).toBeInTheDocument();
  });
});
```

#### Backend Unit Tests
```python
# Example: Service testing
import pytest
from app.services.pdf_processor import PDFProcessor

class TestPDFProcessor:
    def test_extract_text_from_pdf(self):
        processor = PDFProcessor()
        result = processor.extract_text(sample_pdf)
        assert result.success is True
        assert len(result.text) > 0
```

### 2. Integration Testing Strategy

#### API Integration Tests
```typescript
// Example: API endpoint testing
describe('MIVAA Gateway Integration', () => {
  it('should process document successfully', async () => {
    const response = await fetch('/api/mivaa/gateway', {
      method: 'POST',
      body: JSON.stringify({
        action: 'process_document',
        payload: { file: mockPdfFile }
      })
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
```

#### Service Integration Tests
```python
# Example: Service interaction testing
@pytest.mark.integration
async def test_pdf_to_rag_workflow():
    # Test complete PDF processing to RAG workflow
    pdf_processor = PDFProcessor()
    rag_service = RAGService()
    
    # Process PDF
    pdf_result = await pdf_processor.process(sample_pdf)
    assert pdf_result.success
    
    # Store in RAG
    rag_result = await rag_service.store_document(pdf_result.chunks)
    assert rag_result.success
    
    # Query RAG
    query_result = await rag_service.query("test query")
    assert len(query_result.results) > 0
```

### 3. End-to-End Testing Strategy

#### Complete Workflow Tests
```typescript
// Example: E2E workflow testing
describe('Material Analysis Workflow', () => {
  it('should complete full material analysis', async () => {
    // 1. Upload image
    await uploadImage('material-sample.jpg');
    
    // 2. Process with AI
    await waitForProcessing();
    
    // 3. Verify results
    const results = await getAnalysisResults();
    expect(results.materialType).toBeDefined();
    expect(results.properties).toHaveLength.greaterThan(0);
    
    // 4. Save to database
    await saveResults();
    
    // 5. Verify persistence
    const saved = await getStoredResults();
    expect(saved.id).toBeDefined();
  });
});
```

### 4. Performance Testing Strategy

#### Load Testing
```python
# Example: Performance testing with locust
from locust import HttpUser, task, between

class MaterialKaiUser(HttpUser):
    wait_time = between(1, 3)
    
    @task(3)
    def upload_document(self):
        with open('test-document.pdf', 'rb') as f:
            self.client.post('/api/documents/process', files={'file': f})
    
    @task(1)
    def query_rag(self):
        self.client.post('/api/rag/query', json={
            'query': 'material properties',
            'workspace_id': 'test-workspace'
        })
```

#### Performance Benchmarks
```typescript
// Example: Performance benchmarking
describe('Performance Benchmarks', () => {
  it('should process PDF under 30 seconds', async () => {
    const startTime = Date.now();
    
    await processPDF(largePdfFile);
    
    const processingTime = Date.now() - startTime;
    expect(processingTime).toBeLessThan(30000); // 30 seconds
  });
  
  it('should handle 100 concurrent requests', async () => {
    const requests = Array(100).fill().map(() => 
      fetch('/api/health')
    );
    
    const responses = await Promise.all(requests);
    const successCount = responses.filter(r => r.ok).length;
    
    expect(successCount).toBeGreaterThan(95); // 95% success rate
  });
});
```

## 🔒 Security Testing

### Security Test Suite

**Location**: `tests/suites/security_feature_testing_suite.md`

#### 1. Authentication Testing
```python
@pytest.mark.security
def test_jwt_token_validation():
    # Test invalid tokens
    invalid_tokens = ['invalid', 'expired', 'malformed']
    for token in invalid_tokens:
        response = client.get('/api/protected', headers={'Authorization': f'Bearer {token}'})
        assert response.status_code == 401

@pytest.mark.security
def test_api_key_validation():
    # Test API key security
    invalid_keys = ['short', 'invalid-format', '']
    for key in invalid_keys:
        response = client.post('/api/mivaa/gateway', headers={'X-API-Key': key})
        assert response.status_code == 401
```

#### 2. Input Validation Testing
```python
@pytest.mark.security
def test_input_sanitization():
    # Test XSS prevention
    malicious_inputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<iframe src="malicious.com"></iframe>'
    ]
    
    for malicious_input in malicious_inputs:
        response = client.post('/api/documents/process', json={
            'content': malicious_input
        })
        # Should either reject or sanitize
        assert response.status_code in [400, 422] or 'script' not in response.json()
```

#### 3. Rate Limiting Testing
```python
@pytest.mark.security
def test_rate_limiting():
    # Test rate limiting enforcement
    for i in range(150):  # Exceed rate limit
        response = client.get('/api/health')
    
    # Should be rate limited
    assert response.status_code == 429
```

## 📈 Test Automation & CI/CD

### GitHub Actions Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test
      - run: npm run test:coverage

  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.9'
      - run: pip install -r requirements.txt
      - run: pytest tests/unit/ -v --cov=app
      - run: pytest tests/integration/ -v
      - run: pytest tests/security/ -v

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [frontend-tests, backend-tests]
    steps:
      - uses: actions/checkout@v3
      - run: docker-compose up -d
      - run: npm run test:e2e
      - run: docker-compose down
```

### Test Execution Commands

```bash
# Frontend tests
npm run test                    # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage
npm run test:ci               # CI mode

# Backend tests
cd mivaa-pdf-extractor
pytest tests/unit/ -v          # Unit tests
pytest tests/integration/ -v   # Integration tests
pytest tests/e2e/ -v          # E2E tests
pytest tests/performance/ -v   # Performance tests
pytest tests/security/ -v      # Security tests

# All tests
make test-all                  # Run complete test suite
```

## 🚨 Current Testing Issues

### 1. Missing Test Coverage

**Problems Identified**:
- No actual test files found in `tests/` directories
- Test configuration exists but no implementation
- Unknown current coverage levels

**Impact**: No quality assurance for deployments

### 2. Broken Test Commands

**Issue**: ESLint configuration error affects test pipeline
```bash
# Current error
npm run lint
# Invalid option '--ext' - perhaps you meant '-c'?
```

### 3. Missing Test Data

**Problems**:
- No test fixtures for PDF processing
- No mock data for AI services
- No sample images for material recognition

### 4. No Performance Baselines

**Missing**:
- Performance benchmarks
- Load testing scenarios
- Memory usage monitoring

## 🔧 Immediate Testing Improvements

### 1. Fix ESLint Configuration

```javascript
// Update package.json
{
  "scripts": {
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0"
  }
}
```

### 2. Create Test Fixtures

```
tests/fixtures/
├── pdfs/
│   ├── sample-document.pdf
│   ├── large-document.pdf
│   └── malformed.pdf
├── images/
│   ├── material-samples/
│   └── test-images/
└── data/
    ├── mock-responses.json
    └── test-materials.json
```

### 3. Implement Basic Test Suite

**Priority Order**:
1. Health check tests
2. Authentication tests
3. Core API endpoint tests
4. PDF processing tests
5. RAG system tests

### 4. Set Up Test Environment

```bash
# Create test database
supabase db reset --local

# Set up test environment variables
cp .env.test.example .env.test

# Install test dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

## 📊 Test Metrics & Reporting

### Key Metrics

1. **Test Coverage**: Line, branch, function coverage
2. **Test Execution Time**: Per test suite and total
3. **Test Reliability**: Pass/fail rates over time
4. **Performance Metrics**: Response times, throughput
5. **Security Metrics**: Vulnerability detection rates

### Reporting Tools

- **Coverage**: Istanbul/nyc for JavaScript, pytest-cov for Python
- **Performance**: Custom benchmarking utilities
- **Security**: Bandit, Safety, custom security tests
- **CI Integration**: GitHub Actions with artifact uploads

## 🔗 Related Documentation

- [Setup & Configuration](./setup-configuration.md) - Test environment setup
- [Security & Authentication](./security-authentication.md) - Security testing
- [API Documentation](./api-documentation.md) - API testing
- [Deployment Guide](./deployment-guide.md) - Production testing
