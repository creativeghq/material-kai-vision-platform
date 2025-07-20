+++
id = "PDF2HTML-JAVA-DEPLOYMENT-V1"
title = "PDF2HTML Java Runtime Deployment Strategy"
context_type = "architecture"
scope = "Deployment strategies for pdf2html solution addressing Java runtime requirements"
target_audience = ["core-architect", "lead-devops", "infra-specialist", "cloud-aws"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-20"
tags = ["pdf-processing", "java", "deployment", "aws-lambda", "docker", "pdf2html", "architecture"]
related_context = [
    ".ruru/decisions/ADR-001_PDF_Processing_Solution_Evaluation.md",
    ".ruru/docs/architecture/pdf2html_serverless_architecture.md",
    "src/services/hybridPDFPipeline.ts"
]
template_schema_doc = ".ruru/templates/toml-md/08_architecture.README.md"
relevance = "Critical: Addresses Java runtime compatibility for pdf2html deployment"
+++

# PDF2HTML Java Runtime Deployment Strategy

## Executive Summary

**Problem:** The pdf2html solution requires Java Runtime Environment (JRE) which is incompatible with JavaScript-based serverless platforms like Supabase Edge Functions and Vercel Functions.

**Solution:** Deploy pdf2html as a containerized microservice with Java runtime support, accessible via HTTP API.

**Recommended Approach:** Digital Ocean Docker Deployment
**Alternative Options:** AWS Lambda with Java runtime, AWS ECS, or hybrid approach
**Timeline:** 2-3 weeks implementation

## Architecture Overview

### Current Constraint
```
pdf2html (Node.js) → Apache Tika + PDFBox → Requires Java Runtime Environment
```

### Target Architecture
```
React Frontend → HybridPDFPipelineService → Digital Ocean Load Balancer → Docker Container (Java) → pdf2html
```

## Deployment Options Analysis

### Option 1: Digital Ocean Docker Deployment (RECOMMENDED)

#### Architecture Components

**1. AWS Lambda Function (Java Runtime)**
```
Runtime: Java 11 or 17
Memory: 1024MB - 3008MB (configurable)
Timeout: 15 minutes (max)
Concurrent Executions: 1000 (default)
```

**2. API Gateway Integration**
```
Endpoint: https://api.yourdomain.com/pdf2html
Method: POST
Content-Type: multipart/form-data
Max Payload: 10MB (API Gateway limit)
```

**3. Implementation Structure**
```java
// Lambda Function Handler
public class PdfToHtmlHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
    
    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        try {
            // Extract PDF from multipart request
            byte[] pdfBytes = extractPdfFromRequest(input);
            
            // Process with Apache Tika/PDFBox
            String htmlResult = processPdfToHtml(pdfBytes);
            
            // Return structured response
            return createSuccessResponse(htmlResult);
            
        } catch (Exception e) {
            return createErrorResponse(e.getMessage());
        }
    }
    
    private String processPdfToHtml(byte[] pdfBytes) {
        // Use Apache Tika or PDFBox directly
        // This is the core pdf2html functionality
        AutoDetectParser parser = new AutoDetectParser();
        BodyContentHandler handler = new BodyContentHandler(-1);
        Metadata metadata = new Metadata();
        ParseContext context = new ParseContext();
        
        parser.parse(new ByteArrayInputStream(pdfBytes), handler, metadata, context);
        return handler.toString();
    }
}
```

#### Deployment Configuration

**1. AWS SAM Template**
```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  PdfToHtmlFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: target/pdf2html-lambda-1.0.jar
      Handler: com.yourcompany.PdfToHtmlHandler::handleRequest
      Runtime: java17
      MemorySize: 2048
      Timeout: 300
      Environment:
        Variables:
          MAX_FILE_SIZE: 52428800  # 50MB
      Events:
        PdfProcessingApi:
          Type: Api
          Properties:
            Path: /pdf2html
            Method: post
            RequestParameters:
              - method.request.header.Content-Type:
                  Required: true
```

**2. Maven Dependencies**
```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>com.amazonaws</groupId>
        <artifactId>aws-lambda-java-core</artifactId>
        <version>1.2.2</version>
    </dependency>
    <dependency>
        <groupId>com.amazonaws</groupId>
        <artifactId>aws-lambda-java-events</artifactId>
        <version>3.11.0</version>
    </dependency>
    <dependency>
        <groupId>org.apache.tika</groupId>
        <artifactId>tika-core</artifactId>
        <version>2.9.1</version>
    </dependency>
    <dependency>
        <groupId>org.apache.tika</groupId>
        <artifactId>tika-parsers-standard-package</artifactId>
        <version>2.9.1</version>
    </dependency>
</dependencies>
```

#### Integration with Frontend

**Modified HybridPDFPipelineService:**
```typescript
// src/services/hybridPDFPipeline.ts
async function processWithPdf2Html(pdfBuffer: ArrayBuffer): Promise<ProcessingResult> {
  const formData = new FormData()
  formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }))
  
  const response = await fetch(
    'https://api.yourdomain.com/pdf2html',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PDF_API_KEY}`,
      },
      body: formData
    }
  )
  
  if (!response.ok) {
    throw new Error(`PDF processing failed: ${response.statusText}`)
  }
  
  const result = await response.json()
  
  return {
    html: result.html,
    metadata: {
      pages: result.metadata?.pages || 0,
      processingTime: result.metadata?.processingTime || 0
    }
  }
}
```

#### Cost Analysis (AWS Lambda)
```
Base Cost: $0.20 per 1M requests
Compute Cost: $0.0000166667 per GB-second
Storage Cost: $0.50 per GB-month

Example Monthly Usage (10,000 requests):
- Requests: 10,000 × $0.0000002 = $2.00
- Compute (2GB, 10s avg): 10,000 × 2 × 10 × $0.0000166667 = $33.33
- Total: ~$35/month

Compared to ConvertAPI: $200-500/month
Savings: 85-93%
```

### Option 2: Docker Container on Digital Ocean

#### Architecture Components

**1. Docker Container Setup**
```dockerfile
# Dockerfile
FROM openjdk:17-jre-slim

# Install Node.js for pdf2html wrapper
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy application
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

**2. Express.js Server**
```javascript
// server.js
const express = require('express');
const multer = require('multer');
const pdf2html = require('pdf2html');

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

app.post('/pdf2html', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const result = await pdf2html.html(req.file.buffer, {
      bufferSize: 1024 * 1024 * 10 // 10MB buffer
    });

    res.json({
      success: true,
      html: result.html,
      metadata: {
        pages: result.pages,
        processingTime: Date.now() - req.startTime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3000, () => {
  console.log('PDF2HTML service running on port 3000');
});
```

**3. Digital Ocean Deployment**
```yaml
# docker-compose.yml
version: '3.8'
services:
  pdf2html:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MAX_FILE_SIZE=52428800
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

#### Cost Analysis (Digital Ocean)
```
Droplet (2GB RAM, 1 vCPU): $12/month
Load Balancer (optional): $12/month
Backup (optional): $2.40/month
Total: $14-26/month

Compared to ConvertAPI: $200-500/month
Savings: 90-95%
```

### Option 3: AWS ECS with Fargate

#### Architecture Components

**1. ECS Task Definition**
```json
{
  "family": "pdf2html-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "pdf2html",
      "image": "your-account.dkr.ecr.region.amazonaws.com/pdf2html:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/pdf2html",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**2. Application Load Balancer**
```yaml
# ALB Configuration
Type: AWS::ElasticLoadBalancingV2::LoadBalancer
Properties:
  Type: application
  Scheme: internet-facing
  SecurityGroups:
    - !Ref ALBSecurityGroup
  Subnets:
    - !Ref PublicSubnet1
    - !Ref PublicSubnet2
```

#### Cost Analysis (AWS ECS)
```
Fargate (1 vCPU, 2GB): ~$35/month (continuous)
ALB: $16/month + $0.008 per LCU-hour
Total: ~$51-60/month

Compared to ConvertAPI: $200-500/month
Savings: 75-88%
```

## Deployment Comparison Matrix

| Feature | AWS Lambda | Digital Ocean | AWS ECS |
|---------|------------|---------------|---------|
| **Setup Complexity** | Medium | Low | High |
| **Java Runtime** | ✅ Native | ✅ Docker | ✅ Docker |
| **Auto Scaling** | ✅ Automatic | ❌ Manual | ✅ Automatic |
| **Cold Start** | 2-5 seconds | None | None |
| **Cost (Low Usage)** | $35/month | $14/month | $51/month |
| **Cost (High Usage)** | Variable | $14/month | $51/month |
| **Maintenance** | Minimal | Medium | Medium |
| **Monitoring** | CloudWatch | Manual/3rd party | CloudWatch |
| **File Size Limit** | 10MB (API Gateway) | 50MB+ | 50MB+ |

## Recommended Implementation Plan

### Phase 1: AWS Lambda Proof of Concept (Week 1)

**Day 1-2: Setup Development Environment**
```bash
# Install AWS CLI and SAM CLI
npm install -g @aws-amplify/cli
pip install aws-sam-cli

# Create Java Lambda project
sam init --runtime java17 --name pdf2html-lambda
```

**Day 3-4: Implement Core Functionality**
- Create Java Lambda handler
- Integrate Apache Tika/PDFBox
- Add multipart form data parsing
- Implement error handling

**Day 5-7: Testing and Optimization**
- Local testing with SAM
- Performance optimization
- Memory and timeout tuning

### Phase 2: Integration and Deployment (Week 2)

**Day 1-3: Frontend Integration**
- Modify HybridPDFPipelineService
- Add API authentication
- Implement error handling and retries

**Day 4-5: Production Deployment**
- Deploy to AWS using SAM
- Configure API Gateway
- Set up monitoring and logging

**Day 6-7: Testing and Validation**
- End-to-end testing
- Performance benchmarking
- Compare results with ConvertAPI

### Phase 3: Optimization and Monitoring (Week 3)

**Day 1-3: Performance Tuning**
- Optimize memory allocation
- Implement caching strategies
- Fine-tune timeout settings

**Day 4-5: Monitoring Setup**
- CloudWatch dashboards
- Error alerting
- Performance metrics

**Day 6-7: Documentation and Handover**
- Update documentation
- Create runbooks
- Team training

## Security Considerations

### 1. Authentication and Authorization
```java
// Lambda function with API key validation
public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
    // Validate API key
    String apiKey = input.getHeaders().get("Authorization");
    if (!isValidApiKey(apiKey)) {
        return createErrorResponse("Unauthorized", 401);
    }
    
    // Continue with processing...
}
```

### 2. Input Validation
```java
private void validateInput(byte[] pdfBytes) throws ValidationException {
    // File size validation
    if (pdfBytes.length > MAX_FILE_SIZE) {
        throw new ValidationException("File too large");
    }
    
    // File type validation (PDF magic number)
    if (!isPdfFile(pdfBytes)) {
        throw new ValidationException("Invalid file type");
    }
}
```

### 3. Rate Limiting
```yaml
# API Gateway rate limiting
RequestParameters:
  method.request.header.X-API-Key:
    Required: true
ThrottleSettings:
  RateLimit: 100
  BurstLimit: 200
```

## Monitoring and Observability

### 1. CloudWatch Metrics
```java
// Custom metrics in Lambda
CloudWatchClient cloudWatch = CloudWatchClient.create();

PutMetricDataRequest request = PutMetricDataRequest.builder()
    .namespace("PDF2HTML/Processing")
    .metricData(MetricDatum.builder()
        .metricName("ProcessingTime")
        .value((double) processingTime)
        .unit(StandardUnit.MILLISECONDS)
        .build())
    .build();

cloudWatch.putMetricData(request);
```

### 2. Structured Logging
```java
// JSON structured logging
ObjectMapper mapper = new ObjectMapper();
Map<String, Object> logEntry = Map.of(
    "timestamp", Instant.now().toString(),
    "level", "INFO",
    "event", "pdf_processing_completed",
    "fileSize", pdfBytes.length,
    "processingTime", processingTime,
    "requestId", context.getAwsRequestId()
);

System.out.println(mapper.writeValueAsString(logEntry));
```

### 3. Error Tracking
```java
// Error handling with context
try {
    // Processing logic
} catch (Exception e) {
    Map<String, Object> errorLog = Map.of(
        "timestamp", Instant.now().toString(),
        "level", "ERROR",
        "event", "pdf_processing_failed",
        "error", e.getMessage(),
        "requestId", context.getAwsRequestId(),
        "fileSize", pdfBytes.length
    );
    
    System.err.println(mapper.writeValueAsString(errorLog));
    throw e;
}
```

## Disaster Recovery and Fallback

### 1. Multi-Region Deployment
```yaml
# Deploy to multiple regions for redundancy
Regions:
  Primary: us-east-1
  Secondary: us-west-2
  
# Route 53 health checks and failover
HealthCheck:
  Type: HTTPS
  ResourcePath: /health
  FailureThreshold: 3
```

### 2. Graceful Degradation
```typescript
// Frontend fallback strategy
async function processWithPdf2Html(pdfBuffer: ArrayBuffer): Promise<ProcessingResult> {
  try {
    // Try primary AWS Lambda endpoint
    return await callPdf2HtmlLambda(pdfBuffer);
  } catch (error) {
    console.warn('Primary PDF processing failed, trying fallback');
    
    // Fallback to secondary region or ConvertAPI
    if (ENABLE_FALLBACK) {
      return await callFallbackService(pdfBuffer);
    }
    
    throw new Error('PDF processing unavailable');
  }
}
```

### 3. Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

## Implementation Checklist

### Prerequisites
- [ ] AWS account with appropriate permissions
- [ ] Java 17 development environment
- [ ] AWS CLI and SAM CLI installed
- [ ] Maven or Gradle build tool

### Development Tasks
- [ ] Create AWS Lambda Java project
- [ ] Implement PDF processing with Apache Tika
- [ ] Add multipart form data handling
- [ ] Implement input validation and security
- [ ] Add structured logging and metrics
- [ ] Create unit and integration tests

### Deployment Tasks
- [ ] Configure AWS SAM template
- [ ] Set up API Gateway integration
- [ ] Deploy to development environment
- [ ] Configure monitoring and alerting
- [ ] Deploy to production environment

### Integration Tasks
- [ ] Modify HybridPDFPipelineService
- [ ] Update environment configuration
- [ ] Implement error handling and retries
- [ ] Add authentication and rate limiting
- [ ] Perform end-to-end testing

### Validation Tasks
- [ ] Performance benchmarking
- [ ] Security testing
- [ ] Load testing
- [ ] Compare output quality with ConvertAPI
- [ ] Document API specifications

This deployment strategy addresses the Java runtime requirement while maintaining the benefits of serverless architecture through AWS Lambda, providing a scalable, cost-effective solution for the pdf2html migration.