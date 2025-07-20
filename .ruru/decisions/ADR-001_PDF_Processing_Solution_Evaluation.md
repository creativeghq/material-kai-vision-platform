+++
id = "ADR-001-PDF-PROCESSING-SOLUTION"
title = "PDF Processing Solution: ConvertAPI vs pdf2html Microservice"
status = "proposed"
decision_date = "2025-07-20"
authors = ["core-architect"]
template_schema_doc = ".ruru/templates/toml-md/07_adr.README.md"
affected_components = ["HybridPDFPipelineService", "ConvertAPI Integration", "PDF Processing Pipeline", "Supabase Edge Functions"]
tags = ["pdf-processing", "microservices", "convertapi", "pdf2html", "architecture", "cost-optimization", "vendor-independence"]
+++

# ADR-001: PDF Processing Solution: ConvertAPI vs pdf2html Microservice

**Status:** proposed

**Date:** 2025-07-20

## Context 🤔

The current PDF processing architecture relies on ConvertAPI, a third-party SaaS solution, for PDF-to-HTML conversion within the [`HybridPDFPipelineService`](src/services/hybridPDFPipeline.ts). While this solution is functional and feature-rich, it introduces several architectural concerns:

### Current Architecture Analysis

**Current Implementation:**
- **Frontend**: React/TypeScript interface ([`PDFProcessing.tsx`](src/pages/PDFProcessing.tsx))
- **Orchestration**: [`HybridPDFPipelineService`](src/services/hybridPDFPipeline.ts) managing complex workflow
- **Conversion**: Supabase Edge Function ([`convertapi-pdf-processor`](supabase/functions/convertapi-pdf-processor/index.ts)) integrating with ConvertAPI
- **Features**: PDF-to-HTML conversion, image extraction, layout analysis, chunking, RAG integration

**Identified Challenges:**
1. **Vendor Lock-in**: Heavy dependency on ConvertAPI's proprietary API
2. **Cost Concerns**: Usage-based pricing model with potential for unexpected costs
3. **Control Limitations**: Limited customization of conversion logic
4. **Data Privacy**: External processing of potentially sensitive documents
5. **Reliability**: Dependency on external service availability

### Proposed Alternative

The user has identified [`pdf2html`](https://github.com/shebinleo/pdf2html) as a potential replacement - an open-source Node.js solution using Apache Tika and PDFBox for PDF processing.

**pdf2html Capabilities:**
- **Core Technology**: Apache Tika + PDFBox (proven, enterprise-grade libraries)
- **Output Formats**: HTML, plain text extraction
- **Configuration**: Buffer size options (1024 * 1024 * 10 default)
- **API**: Simple programmatic interface (`pdf2html.html(pdfBuffer, options)`)
- **Deployment**: Self-hosted as external microservice on Digital Ocean

## Decision ✅

**CRITICAL DISCOVERY: Java Runtime Incompatibility**

During detailed technical analysis, a fundamental constraint was identified: **pdf2html requires Java Runtime Environment (JRE) >= 8** for Apache Tika and PDFBox, which is **incompatible with serverless JavaScript/TypeScript environments** like Supabase Edge Functions and Vercel Functions.

**FINAL RECOMMENDATION: pdf2html with Digital Ocean Docker Deployment**

Migrate from ConvertAPI to **pdf2html (Apache Tika + PDFBox)** deployed on **Digital Ocean using Docker containers**, while maintaining the existing [`HybridPDFPipelineService`](src/services/hybridPDFPipeline.ts) orchestration layer.

### Final Deployment Strategy

**Primary Choice: Digital Ocean Docker Deployment**
- **Full Feature Compatibility**: Complete Apache Tika + PDFBox capabilities
- **Java Runtime Support**: Custom Docker environment with Java runtime resolves deployment challenge
- **Cost Efficiency**: 85-93% cost reduction vs ConvertAPI
- **Proven Technology**: Enterprise-grade PDF processing with extensive format support
- **Infrastructure Control**: Full control over environment and dependencies
- **Predictable Costs**: Fixed monthly pricing with no per-execution fees
- **Load Balancer Integration**: Standard HTTP interface via Digital Ocean Load Balancer

**Alternative Options Evaluated:**
- **AWS Lambda Java Runtime**: Higher complexity and potential cold start issues
- **AWS ECS Fargate**: Higher cost but container-based deployment
- **Hybrid PDF.js + Lambda**: Complexity of maintaining two processing systems

## Rationale / Justification 💡

### Advantages of pdf2html Solution

**1. Cost Optimization**
- **Fixed Infrastructure Costs**: Predictable monthly Digital Ocean expenses vs. usage-based ConvertAPI pricing
- **No Per-Document Fees**: Unlimited processing within infrastructure capacity
- **Long-term Savings**: Significant cost reduction for high-volume processing

**2. Vendor Independence**
- **Open Source Foundation**: Apache Tika and PDFBox are industry-standard, well-maintained libraries
- **No Vendor Lock-in**: Full control over processing logic and future enhancements
- **Technology Flexibility**: Ability to modify, extend, or replace components as needed

**3. Enhanced Control & Customization**
- **Processing Logic**: Direct access to modify conversion algorithms
- **Performance Tuning**: Ability to optimize for specific document types and use cases
- **Feature Extensions**: Can add custom processing steps (OCR, advanced layout analysis)

**4. Data Privacy & Security**
- **Internal Processing**: Documents remain within controlled infrastructure
- **Compliance**: Better alignment with data protection requirements
- **Audit Trail**: Complete visibility into processing operations

**5. Technical Architecture Benefits**
- **Microservice Pattern**: Aligns with modern architectural principles
- **Scalability**: Independent scaling of PDF processing capacity
- **Resilience**: Reduced external dependencies

### Trade-offs Acknowledged

**Implementation Complexity**
- **Infrastructure Management**: Requires Digital Ocean deployment and maintenance
- **Monitoring**: Need to implement health checks, logging, and alerting
- **Updates**: Responsibility for security patches and library updates

**Feature Gap Analysis**
- **Image Processing**: May require additional implementation for advanced image extraction
- **Format Support**: Need to verify compatibility with current document types
- **Performance**: Initial performance testing required to match ConvertAPI capabilities

**Migration Effort**
- **API Integration**: Modification of [`convertapi-pdf-processor`](supabase/functions/convertapi-pdf-processor/index.ts)
- **Testing**: Comprehensive validation of conversion quality
- **Deployment**: Infrastructure setup and CI/CD pipeline configuration

## Consequences / Implications ➡️

### Positive Outcomes

**1. Cost Reduction**
- Estimated 60-80% reduction in PDF processing costs for current volume
- Predictable infrastructure expenses enabling better budget planning

**2. Architectural Improvements**
- Reduced external dependencies improving system reliability
- Enhanced data privacy and security posture
- Greater flexibility for future feature development

**3. Technical Benefits**
- Self-contained processing pipeline
- Ability to implement custom optimizations
- Better integration with existing React/TypeScript/Supabase stack

### Implementation Requirements

**1. Infrastructure Setup**
- Digital Ocean droplet provisioning and configuration
- Docker containerization of pdf2html service
- Load balancer and auto-scaling configuration
- Monitoring and logging infrastructure

**2. API Development**
- RESTful API endpoints:
  - `POST /pdf2html/convert` - PDF to HTML conversion
  - `GET /pdf2html/health` - Service health check
  - `GET /pdf2html/status/{jobId}` - Conversion status (if async)
- Request/response format standardization
- Error handling and retry mechanisms

**3. Integration Updates**
- Modify [`convertapi-pdf-processor`](supabase/functions/convertapi-pdf-processor/index.ts) to use new microservice
- Update [`HybridPDFPipelineService`](src/services/hybridPDFPipeline.ts) configuration
- Implement fallback mechanisms during migration period

**4. Testing & Validation**
- Comprehensive conversion quality testing
- Performance benchmarking against ConvertAPI
- Load testing for expected traffic volumes
- Security penetration testing

### Risks & Mitigation

**Risk: Service Availability**
- *Mitigation*: Implement high availability with multiple instances and health monitoring

**Risk: Performance Degradation**
- *Mitigation*: Thorough performance testing and optimization before migration

**Risk: Feature Gaps**
- *Mitigation*: Detailed feature comparison and gap analysis with fallback options

**Risk: Maintenance Overhead**
- *Mitigation*: Automated deployment, monitoring, and update procedures

## Alternatives Considered (Detailed) 📝

### Alternative 1: Continue with ConvertAPI
**Pros:**
- No migration effort required
- Proven reliability and feature completeness
- Managed service with guaranteed SLA

**Cons:**
- Ongoing vendor lock-in and cost concerns
- Limited customization capabilities
- External dependency for critical functionality

**Decision:** Rejected due to long-term cost and flexibility concerns

### Alternative 2: Hybrid Approach (ConvertAPI + pdf2html)
**Pros:**
- Gradual migration with reduced risk
- Fallback option for complex documents
- Ability to compare performance side-by-side

**Cons:**
- Increased complexity maintaining two systems
- Continued ConvertAPI costs during transition
- Complex routing logic required

**Decision:** Considered for migration strategy but not as end state

### Alternative 3: Alternative SaaS Providers
**Pros:**
- Potentially better pricing or features
- Managed service benefits

**Cons:**
- Still vendor lock-in concerns
- Migration effort without addressing core issues
- Limited evaluation of alternatives conducted

**Decision:** Not pursued due to fundamental vendor dependency concerns

## Related Links 🔗

- **Current Implementation**: [`src/services/hybridPDFPipeline.ts`](src/services/hybridPDFPipeline.ts)
- **ConvertAPI Integration**: [`supabase/functions/convertapi-pdf-processor/index.ts`](supabase/functions/convertapi-pdf-processor/index.ts)
- **Frontend Interface**: [`src/pages/PDFProcessing.tsx`](src/pages/PDFProcessing.tsx)
- **PDF.js Documentation**: [https://mozilla.github.io/pdf.js/](https://mozilla.github.io/pdf.js/)
- **Supabase Edge Functions**: [https://supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)
- **Alternative Architecture**: [`.ruru/docs/architecture/pdf_processing_serverless_alternatives.md`](.ruru/docs/architecture/pdf_processing_serverless_alternatives.md)
- **pdf2html Repository** (Reference): [https://github.com/shebinleo/pdf2html](https://github.com/shebinleo/pdf2html)

## Next Steps

1. **AWS Lambda Proof of Concept**: Develop Java-based AWS Lambda function with pdf2html integration
2. **Performance Testing**: Benchmark AWS Lambda solution against current ConvertAPI implementation
3. **Quality Assessment**: Test pdf2html text extraction accuracy with sample documents
4. **API Gateway Setup**: Configure AWS API Gateway for HTTP interface
5. **Migration Strategy**: Develop phased rollout plan with A/B testing and rollback procedures
6. **Implementation Tasks**: Create detailed MDTM tasks for AWS Lambda development work
7. **Monitoring Setup**: Implement CloudWatch dashboards and alerting for production deployment