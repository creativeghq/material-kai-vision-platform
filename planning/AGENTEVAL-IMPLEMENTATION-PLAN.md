# AgentEval Implementation Plan

**Priority:** HIGH  
**Estimated Effort:** 2-3 weeks  
**Status:** NOT STARTED

---

## 🎯 **Overview**

AgentEval is a comprehensive framework for testing, evaluating, and monitoring AI agents in the Material Kai Vision Platform. It provides automated testing, quality assurance, performance benchmarking, and regression detection for all AI agents.

**Inspired by:** AWS AgentEval, Fireworks AI Agent Evaluation

---

## 🏗️ **Architecture**

### **Components**

1. **Test Case Management**
   - YAML-based test plans
   - Test case versioning
   - Test suite organization
   - Expected output definitions

2. **Evaluation Engine**
   - Automated test execution
   - Multi-metric scoring
   - Comparison with expected outputs
   - Error detection and reporting

3. **Performance Monitoring**
   - Execution time tracking
   - Resource usage monitoring
   - Success rate calculation
   - Trend analysis over time

4. **Reporting & Visualization**
   - Test result dashboards
   - Performance benchmarks
   - Regression detection
   - Agent comparison views

---

## 📊 **Database Schema**

### **1. agent_test_cases**
```sql
CREATE TABLE agent_test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id),
    agent_id TEXT NOT NULL, -- 'pdf-processor', 'search', 'product', 'admin', 'interior-designer'
    test_name TEXT NOT NULL,
    test_description TEXT,
    test_category TEXT, -- 'functional', 'performance', 'accuracy', 'edge_case'
    
    -- Input Configuration
    input_data JSONB NOT NULL,
    -- Structure: {
    --   "query": "Find sustainable wood materials",
    --   "context": {...},
    --   "images": ["url1", "url2"],
    --   "pdf_file": "base64_data"
    -- }
    
    -- Expected Output
    expected_output JSONB NOT NULL,
    -- Structure: {
    --   "response_contains": ["sustainable", "wood"],
    --   "product_count": 5,
    --   "tools_used": ["material_search", "image_analysis"],
    --   "execution_time_max_ms": 5000
    -- }
    
    -- Evaluation Criteria
    evaluation_criteria JSONB DEFAULT '{}'::jsonb,
    -- Structure: {
    --   "min_accuracy": 0.90,
    --   "min_relevance": 0.85,
    --   "min_coherence": 0.80,
    --   "max_execution_time_ms": 10000,
    --   "required_tools": ["material_search"],
    --   "forbidden_errors": ["timeout", "api_error"]
    -- }
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high, 4=critical
    tags TEXT[],
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_test_cases_agent ON agent_test_cases(agent_id);
CREATE INDEX idx_agent_test_cases_category ON agent_test_cases(test_category);
CREATE INDEX idx_agent_test_cases_active ON agent_test_cases(is_active) WHERE is_active = TRUE;
```

### **2. agent_test_results**
```sql
CREATE TABLE agent_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id UUID REFERENCES agent_test_cases(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    model_used TEXT, -- 'claude-sonnet-4.5', 'gpt-5', 'llama-4-scout'
    
    -- Execution Details
    execution_time_ms FLOAT NOT NULL,
    memory_used_mb FLOAT,
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 6),
    
    -- Results
    success BOOLEAN NOT NULL,
    actual_output JSONB,
    error_message TEXT,
    error_type TEXT, -- 'timeout', 'api_error', 'validation_error', 'tool_error'
    
    -- Evaluation Scores
    evaluation_scores JSONB DEFAULT '{}'::jsonb,
    -- Structure: {
    --   "accuracy": 0.95,
    --   "relevance": 0.88,
    --   "coherence": 0.92,
    --   "tool_usage_score": 0.85,
    --   "response_quality": 0.90,
    --   "overall_score": 0.90
    -- }
    
    -- Tool Usage
    tools_used TEXT[],
    tool_execution_times JSONB, -- {"material_search": 1200, "image_analysis": 3400}
    
    -- Metadata
    test_run_id UUID, -- Group multiple tests in a suite run
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    executed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_agent_test_results_test_case ON agent_test_results(test_case_id);
CREATE INDEX idx_agent_test_results_agent ON agent_test_results(agent_id);
CREATE INDEX idx_agent_test_results_run ON agent_test_results(test_run_id);
CREATE INDEX idx_agent_test_results_executed ON agent_test_results(executed_at DESC);
CREATE INDEX idx_agent_test_results_success ON agent_test_results(success);
```

### **3. agent_performance_benchmarks**
```sql
CREATE TABLE agent_performance_benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    model_used TEXT,
    benchmark_period TEXT, -- 'daily', 'weekly', 'monthly'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Aggregated Metrics
    total_tests_run INTEGER DEFAULT 0,
    successful_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2), -- Percentage
    
    -- Performance Metrics
    avg_execution_time_ms FLOAT,
    p50_execution_time_ms FLOAT,
    p95_execution_time_ms FLOAT,
    p99_execution_time_ms FLOAT,
    avg_memory_used_mb FLOAT,
    avg_tokens_used FLOAT,
    total_cost_usd DECIMAL(10, 2),
    
    -- Quality Metrics
    avg_accuracy DECIMAL(5, 4),
    avg_relevance DECIMAL(5, 4),
    avg_coherence DECIMAL(5, 4),
    avg_overall_score DECIMAL(5, 4),
    
    -- Tool Usage Stats
    most_used_tools JSONB, -- {"material_search": 45, "image_analysis": 32}
    avg_tools_per_execution FLOAT,
    
    -- Error Analysis
    error_breakdown JSONB, -- {"timeout": 3, "api_error": 2, "validation_error": 1}
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_benchmarks_agent ON agent_performance_benchmarks(agent_id);
CREATE INDEX idx_agent_benchmarks_period ON agent_performance_benchmarks(period_start DESC);
```

---

## 🔧 **Backend Implementation**

### **1. Agent Evaluation Service** (`agent_evaluation_service.py`)

```python
class AgentEvaluationService:
    """Service for evaluating AI agent performance"""
    
    async def run_test_case(self, test_case_id: str) -> TestResult:
        """Execute a single test case and evaluate results"""
        
    async def run_test_suite(self, agent_id: str, category: str = None) -> SuiteResult:
        """Execute multiple test cases for an agent"""
        
    async def evaluate_response(
        self,
        actual_output: dict,
        expected_output: dict,
        criteria: dict
    ) -> EvaluationScores:
        """Evaluate agent response against expected output"""
        
    async def calculate_accuracy(self, actual: str, expected: str) -> float:
        """Calculate accuracy score using semantic similarity"""
        
    async def calculate_relevance(self, response: str, query: str) -> float:
        """Calculate relevance score"""
        
    async def calculate_coherence(self, response: str) -> float:
        """Calculate coherence score"""

    async def generate_benchmark_report(
        self,
        agent_id: str,
        period: str = 'weekly'
    ) -> BenchmarkReport:
        """Generate performance benchmark report"""
```

### **2. API Endpoints** (`agent_evaluation_routes.py`)

```python
@router.post("/api/agent-eval/run-test")
async def run_single_test(test_case_id: str) -> TestResultResponse:
    """Execute a single test case"""

@router.post("/api/agent-eval/run-suite")
async def run_test_suite(
    agent_id: str,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None
) -> SuiteResultResponse:
    """Execute a test suite for an agent"""

@router.get("/api/agent-eval/results/{agent_id}")
async def get_test_results(
    agent_id: str,
    limit: int = 50,
    success_only: bool = False
) -> List[TestResultResponse]:
    """Get test results for an agent"""

@router.get("/api/agent-eval/benchmarks/{agent_id}")
async def get_benchmarks(
    agent_id: str,
    period: str = 'weekly'
) -> BenchmarkResponse:
    """Get performance benchmarks"""

@router.post("/api/agent-eval/test-cases")
async def create_test_case(test_case: TestCaseCreate) -> TestCaseResponse:
    """Create a new test case"""

@router.get("/api/agent-eval/test-cases/{agent_id}")
async def list_test_cases(
    agent_id: str,
    category: Optional[str] = None
) -> List[TestCaseResponse]:
    """List test cases for an agent"""

@router.delete("/api/agent-eval/test-cases/{test_case_id}")
async def delete_test_case(test_case_id: str) -> dict:
    """Delete a test case"""
```

---

## 🎨 **Frontend Implementation**

### **1. AgentEval Dashboard** (`AgentEvalDashboard.tsx`)

**Features:**
- Overview of all agents with test statistics
- Recent test results (pass/fail)
- Performance trends over time
- Quick actions (run tests, view results)

**Components:**
```tsx
<AgentEvalDashboard>
  <AgentOverviewCards />
  <RecentTestResults />
  <PerformanceTrendsChart />
  <QuickActions />
</AgentEvalDashboard>
```

### **2. Test Case Manager** (`TestCaseManager.tsx`)

**Features:**
- Create/edit test cases
- YAML editor for test plans
- Test case library browser
- Bulk import/export

**Components:**
```tsx
<TestCaseManager>
  <TestCaseList />
  <TestCaseEditor>
    <YAMLEditor />
    <ExpectedOutputEditor />
    <EvaluationCriteriaEditor />
  </TestCaseEditor>
  <TestCaseActions />
</TestCaseManager>
```

### **3. Test Results Viewer** (`TestResultsViewer.tsx`)

**Features:**
- Detailed test execution results
- Side-by-side comparison (expected vs actual)
- Error analysis and debugging
- Execution timeline

**Components:**
```tsx
<TestResultsViewer>
  <ResultSummary />
  <OutputComparison>
    <ExpectedOutput />
    <ActualOutput />
    <DiffViewer />
  </OutputComparison>
  <EvaluationScores />
  <ExecutionTimeline />
  <ErrorDetails />
</TestResultsViewer>
```

### **4. Agent Benchmark Comparison** (`AgentBenchmarkComparison.tsx`)

**Features:**
- Compare multiple agents
- Performance metrics visualization
- Model comparison (Claude vs GPT vs Llama)
- Cost analysis

**Components:**
```tsx
<AgentBenchmarkComparison>
  <AgentSelector />
  <MetricsComparisonChart />
  <PerformanceTable />
  <CostAnalysis />
  <RecommendationEngine />
</AgentBenchmarkComparison>
```

---

## 📝 **Test Plan Format (YAML)**

### **Example 1: PDF Processor Agent**

```yaml
agent_id: pdf-processor
test_suite: product_discovery
description: Test product discovery from PDF catalogs

tests:
  - name: "Extract products from Harmony PDF"
    category: functional
    priority: 4
    tags: [product-discovery, harmony-pdf, critical]

    input_data:
      pdf_url: "https://storage.materialshub.gr/test-pdfs/harmony.pdf"
      category: "materials"
      workspace_id: "test-workspace-123"

    expected_output:
      product_count: 14
      products_include: ["NOVA", "HARMONY", "ECLIPSE"]
      metadata_extracted: true
      images_extracted: true
      chunks_created: true

    evaluation_criteria:
      min_accuracy: 0.90
      max_execution_time_ms: 120000
      required_stages: ["PDF_EXTRACTED", "PRODUCTS_DETECTED", "COMPLETED"]
      forbidden_errors: ["timeout", "memory_error"]

  - name: "Handle corrupted PDF gracefully"
    category: edge_case
    priority: 3
    tags: [error-handling, edge-case]

    input_data:
      pdf_url: "https://storage.materialshub.gr/test-pdfs/corrupted.pdf"
      category: "materials"

    expected_output:
      success: false
      error_type: "validation_error"
      error_message_contains: "corrupted"

    evaluation_criteria:
      max_execution_time_ms: 5000
      graceful_failure: true
```

### **Example 2: Search Agent**

```yaml
agent_id: search
test_suite: semantic_search
description: Test semantic search capabilities

tests:
  - name: "Find sustainable wood materials"
    category: functional
    priority: 4
    tags: [semantic-search, sustainability]

    input_data:
      query: "sustainable wood materials for flooring"
      workspace_id: "test-workspace-123"
      limit: 10

    expected_output:
      result_count_min: 5
      results_contain_keywords: ["wood", "sustainable", "flooring"]
      avg_relevance_score_min: 0.75
      tools_used: ["material_search", "semantic_search"]

    evaluation_criteria:
      min_relevance: 0.80
      max_execution_time_ms: 3000
      required_tools: ["material_search"]

  - name: "Handle typos in search query"
    category: functional
    priority: 3
    tags: [typo-correction, search]

    input_data:
      query: "sustanible wod materals" # Intentional typos
      workspace_id: "test-workspace-123"

    expected_output:
      typo_correction_applied: true
      corrected_query: "sustainable wood materials"
      result_count_min: 3

    evaluation_criteria:
      min_accuracy: 0.85
      max_execution_time_ms: 2000
```

### **Example 3: Interior Designer Agent**

```yaml
agent_id: interior-designer
test_suite: spatial_analysis
description: Test spatial analysis and 3D generation

tests:
  - name: "Analyze room layout and suggest materials"
    category: functional
    priority: 4
    tags: [spatial-analysis, material-matching]

    input_data:
      query: "Analyze this living room and suggest materials"
      images: ["https://storage.materialshub.gr/test-images/living-room-1.jpg"]
      user_preferences:
        style: "modern"
        budget: "medium"
        sustainability: "high"

    expected_output:
      spatial_analysis_complete: true
      room_type_detected: "living room"
      material_suggestions_count_min: 5
      tools_used: ["spaceformer_analysis", "material_search"]
      cost_estimate_provided: true

    evaluation_criteria:
      min_accuracy: 0.85
      min_relevance: 0.80
      max_execution_time_ms: 15000
      required_tools: ["spaceformer_analysis", "material_search"]
```

---

## 📊 **Evaluation Metrics**

### **1. Accuracy Score**
- Semantic similarity between expected and actual output
- Uses sentence transformers for embedding comparison
- Cosine similarity threshold: 0.85+

### **2. Relevance Score**
- How relevant the response is to the input query
- Measures topic alignment and context understanding
- Threshold: 0.80+

### **3. Coherence Score**
- Logical consistency and flow of response
- Grammar, structure, and readability
- Threshold: 0.75+

### **4. Tool Usage Score**
- Correct tool selection for the task
- Efficient tool usage (no redundant calls)
- Required tools used: 100%

### **5. Performance Score**
- Execution time within acceptable range
- Memory usage optimization
- Cost efficiency

### **6. Overall Score**
- Weighted average of all metrics
- Formula: `(accuracy * 0.3) + (relevance * 0.25) + (coherence * 0.20) + (tool_usage * 0.15) + (performance * 0.10)`

---

## 🚀 **Implementation Phases**

### **Phase 1: Foundation** (Week 1)
- [ ] Create database schema and migrations
- [ ] Implement `AgentEvaluationService` backend
- [ ] Create API endpoints
- [ ] Write basic test cases for each agent

### **Phase 2: Evaluation Engine** (Week 2)
- [ ] Implement evaluation metrics (accuracy, relevance, coherence)
- [ ] Build test execution engine
- [ ] Add performance monitoring
- [ ] Create benchmark calculation logic

### **Phase 3: Frontend** (Week 2-3)
- [ ] Build `AgentEvalDashboard.tsx`
- [ ] Create `TestCaseManager.tsx`
- [ ] Implement `TestResultsViewer.tsx`
- [ ] Add `AgentBenchmarkComparison.tsx`

### **Phase 4: Integration & Testing** (Week 3)
- [ ] Integrate with existing agents
- [ ] Create comprehensive test suites
- [ ] Run baseline benchmarks
- [ ] Document usage and best practices

---

## 🎯 **Success Criteria**

- [ ] All 5 agents have comprehensive test suites (10+ tests each)
- [ ] Automated test execution on every deployment
- [ ] Performance benchmarks tracked over time
- [ ] Regression detection alerts configured
- [ ] Admin dashboard shows real-time agent health
- [ ] Test coverage > 80% for critical agent paths
- [ ] Documentation complete with examples

---

## 📚 **References**

- [AWS AgentEval](https://github.com/awslabs/agent-evaluation)
- [Fireworks AI Agent Evaluation](https://docs.fireworks.ai/evaluators/developer_guide/agent_evaluation)
- [Amazon Bedrock Agent Evaluation](https://aws.amazon.com/blogs/machine-learning/evaluate-conversational-ai-agents-with-amazon-bedrock/)


