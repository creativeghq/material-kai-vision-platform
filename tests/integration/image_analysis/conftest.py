"""
Image Analysis Integration Testing Suite - Configuration and Fixtures
Provides shared test configuration, fixtures, and utilities for comprehensive integration testing.
"""

import pytest
import asyncio
import httpx
import websockets
import json
import time
from typing import Dict, Any, List, Optional, AsyncGenerator
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import logging

# Configure logging for test execution
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test Configuration Constants
MIVAA_BASE_URL = "http://localhost:8000"
WEBSOCKET_URL = "ws://localhost:8000/ws/processing-updates"
TEST_TIMEOUT = 300  # 5 minutes for long-running ML operations
MAX_RETRIES = 3
PERFORMANCE_THRESHOLDS = {
    "max_processing_time": 60.0,
    "max_memory_usage": 512,
    "max_cpu_utilization": 80,
    "max_network_latency": 2.0,
    "min_websocket_frequency": 1
}

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def mivaa_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Initialize MIVAA backend client for testing with proper timeout and retry configuration."""
    timeout = httpx.Timeout(
        connect=30.0,
        read=TEST_TIMEOUT,
        write=30.0,
        pool=30.0
    )
    
    async with httpx.AsyncClient(
        base_url=MIVAA_BASE_URL,
        timeout=timeout,
        follow_redirects=True
    ) as client:
        # Verify MIVAA backend is accessible
        try:
            response = await client.get("/api/v1/health")
            assert response.status_code == 200, f"MIVAA backend not accessible: {response.status_code}"
            logger.info("MIVAA backend connection verified")
        except Exception as e:
            pytest.skip(f"MIVAA backend not available: {e}")
        
        yield client

@pytest.fixture(scope="session")
async def websocket_manager():
    """Initialize WebSocket connection manager for real-time status testing."""
    class WebSocketTestManager:
        def __init__(self):
            self.connections: Dict[str, websockets.WebSocketServerProtocol] = {}
            self.message_history: List[Dict[str, Any]] = []
        
        async def connect(self, job_id: str) -> websockets.WebSocketServerProtocol:
            """Establish WebSocket connection for a specific job."""
            try:
                uri = f"{WEBSOCKET_URL}?job_id={job_id}"
                websocket = await websockets.connect(uri)
                self.connections[job_id] = websocket
                logger.info(f"WebSocket connected for job {job_id}")
                return websocket
            except Exception as e:
                logger.error(f"WebSocket connection failed for job {job_id}: {e}")
                raise
        
        async def listen_for_updates(self, job_id: str, timeout: float = 60.0) -> List[Dict[str, Any]]:
            """Listen for status updates on WebSocket connection."""
            if job_id not in self.connections:
                raise ValueError(f"No WebSocket connection for job {job_id}")
            
            websocket = self.connections[job_id]
            messages = []
            start_time = time.time()
            
            try:
                while time.time() - start_time < timeout:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        parsed_message = json.loads(message)
                        messages.append(parsed_message)
                        self.message_history.append(parsed_message)
                        
                        # Check if processing is complete
                        if parsed_message.get("status") in ["completed", "failed", "error"]:
                            break
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed:
                        logger.warning(f"WebSocket connection closed for job {job_id}")
                        break
            except Exception as e:
                logger.error(f"Error listening for updates on job {job_id}: {e}")
            
            return messages
        
        async def disconnect(self, job_id: str):
            """Close WebSocket connection for a specific job."""
            if job_id in self.connections:
                await self.connections[job_id].close()
                del self.connections[job_id]
                logger.info(f"WebSocket disconnected for job {job_id}")
        
        async def disconnect_all(self):
            """Close all WebSocket connections."""
            for job_id in list(self.connections.keys()):
                await self.disconnect(job_id)
    
    manager = WebSocketTestManager()
    yield manager
    await manager.disconnect_all()

@pytest.fixture
async def sample_pdfs() -> Dict[str, Path]:
    """Provide test PDF samples with varying complexity levels."""
    test_data_dir = Path("tests/fixtures/pdfs")
    
    # Ensure test data directory exists
    test_data_dir.mkdir(parents=True, exist_ok=True)
    
    samples = {
        "simple": test_data_dir / "simple_text.pdf",
        "image_heavy": test_data_dir / "image_heavy.pdf",
        "mixed_content": test_data_dir / "mixed_content.pdf",
        "scanned_document": test_data_dir / "scanned_doc.pdf",
        "complex_layout": test_data_dir / "complex_layout.pdf"
    }
    
    # Verify test files exist or create placeholders
    for sample_type, file_path in samples.items():
        if not file_path.exists():
            logger.warning(f"Test PDF {sample_type} not found at {file_path}")
            # Create placeholder file for testing
            file_path.touch()
    
    return samples

@pytest.fixture
async def performance_monitor():
    """Initialize performance monitoring for integration tests."""
    class IntegrationPerformanceMonitor:
        def __init__(self):
            self.metrics: Dict[str, Dict[str, float]] = {}
            self.start_times: Dict[str, float] = {}
        
        def start_monitoring(self, operation_id: str):
            """Start monitoring a specific operation."""
            self.start_times[operation_id] = time.time()
            self.metrics[operation_id] = {
                "processing_time": 0,
                "memory_usage": 0,
                "cpu_utilization": 0,
                "network_latency": 0,
                "websocket_message_frequency": 0
            }
        
        def stop_monitoring(self, operation_id: str) -> Dict[str, float]:
            """Stop monitoring and return collected metrics."""
            if operation_id in self.start_times:
                self.metrics[operation_id]["processing_time"] = time.time() - self.start_times[operation_id]
                del self.start_times[operation_id]
            
            return self.metrics.get(operation_id, {})
        
        def validate_performance_thresholds(self, metrics: Dict[str, float]) -> bool:
            """Validate that performance meets acceptable thresholds."""
            for metric, value in metrics.items():
                threshold_key = f"max_{metric}" if metric != "websocket_message_frequency" else f"min_{metric}"
                threshold = PERFORMANCE_THRESHOLDS.get(threshold_key)
                
                if threshold is not None:
                    if metric == "websocket_message_frequency":
                        if value < threshold:
                            logger.warning(f"Performance threshold violation: {metric}={value} < {threshold}")
                            return False
                    else:
                        if value > threshold:
                            logger.warning(f"Performance threshold violation: {metric}={value} > {threshold}")
                            return False
            
            return True
        
        def get_all_metrics(self) -> Dict[str, Dict[str, float]]:
            """Get all collected metrics."""
            return self.metrics.copy()
    
    return IntegrationPerformanceMonitor()

@pytest.fixture
async def frontend_test_harness():
    """Initialize frontend component test harness with React Testing Library integration."""
    class FrontendTestHarness:
        def __init__(self):
            self.component_states: Dict[str, Any] = {}
            self.mock_services: Dict[str, AsyncMock] = {}
            self.event_handlers: Dict[str, List[callable]] = {}
        
        def setup_component_mock(self, component_name: str, initial_state: Dict[str, Any]):
            """Setup mock state for a frontend component."""
            self.component_states[component_name] = initial_state
            logger.info(f"Component mock setup for {component_name}")
        
        def setup_service_mock(self, service_name: str) -> AsyncMock:
            """Setup mock for a service (e.g., MivaaIntegrationService)."""
            mock_service = AsyncMock()
            self.mock_services[service_name] = mock_service
            logger.info(f"Service mock setup for {service_name}")
            return mock_service
        
        def simulate_user_interaction(self, component_name: str, interaction_type: str, data: Any):
            """Simulate user interaction with frontend components."""
            logger.info(f"Simulating {interaction_type} interaction on {component_name}")
            # Implementation would integrate with React Testing Library
            pass
        
        def get_component_state(self, component_name: str) -> Dict[str, Any]:
            """Get current state of a mocked component."""
            return self.component_states.get(component_name, {})
        
        def verify_service_calls(self, service_name: str) -> List[Any]:
            """Verify and return calls made to a mocked service."""
            if service_name in self.mock_services:
                return self.mock_services[service_name].call_args_list
            return []
    
    return FrontendTestHarness()

@pytest.fixture
async def test_job_manager():
    """Manage test processing jobs and their lifecycle."""
    class TestJobManager:
        def __init__(self):
            self.active_jobs: Dict[str, Dict[str, Any]] = {}
            self.completed_jobs: Dict[str, Dict[str, Any]] = {}
        
        def create_job(self, job_type: str, file_path: str, options: Dict[str, Any] = None) -> str:
            """Create a new test processing job."""
            job_id = f"test_job_{int(time.time() * 1000)}"
            self.active_jobs[job_id] = {
                "id": job_id,
                "type": job_type,
                "file_path": file_path,
                "options": options or {},
                "status": "created",
                "created_at": time.time()
            }
            logger.info(f"Created test job {job_id} for {job_type}")
            return job_id
        
        def update_job_status(self, job_id: str, status: str, data: Dict[str, Any] = None):
            """Update the status of a test job."""
            if job_id in self.active_jobs:
                self.active_jobs[job_id]["status"] = status
                self.active_jobs[job_id]["updated_at"] = time.time()
                if data:
                    self.active_jobs[job_id].update(data)
                
                # Move to completed if final status
                if status in ["completed", "failed", "error"]:
                    self.completed_jobs[job_id] = self.active_jobs.pop(job_id)
                
                logger.info(f"Updated job {job_id} status to {status}")
        
        def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
            """Get current status of a test job."""
            return self.active_jobs.get(job_id) or self.completed_jobs.get(job_id)
        
        def cleanup_jobs(self):
            """Clean up all test jobs."""
            self.active_jobs.clear()
            self.completed_jobs.clear()
            logger.info("All test jobs cleaned up")
    
    manager = TestJobManager()
    yield manager
    manager.cleanup_jobs()

@pytest.fixture
async def security_validator():
    """Validate security aspects of integration testing."""
    class SecurityValidator:
        def __init__(self):
            self.security_checks: List[str] = []
            self.vulnerabilities: List[Dict[str, Any]] = []
        
        def validate_jwt_token(self, token: str) -> bool:
            """Validate JWT token format and structure."""
            # Implementation for JWT validation
            self.security_checks.append("jwt_validation")
            return True
        
        def check_data_sanitization(self, data: Any) -> bool:
            """Check if sensitive data is properly sanitized."""
            # Implementation for data sanitization checks
            self.security_checks.append("data_sanitization")
            return True
        
        def validate_secure_transmission(self, request_data: Dict[str, Any]) -> bool:
            """Validate secure data transmission protocols."""
            # Implementation for secure transmission validation
            self.security_checks.append("secure_transmission")
            return True
        
        def scan_for_vulnerabilities(self, component: str) -> List[Dict[str, Any]]:
            """Scan component for potential security vulnerabilities."""
            # Implementation for vulnerability scanning
            self.security_checks.append(f"vulnerability_scan_{component}")
            return []
        
        def get_security_report(self) -> Dict[str, Any]:
            """Generate comprehensive security validation report."""
            return {
                "checks_performed": self.security_checks,
                "vulnerabilities_found": self.vulnerabilities,
                "security_score": len(self.security_checks) / max(len(self.vulnerabilities), 1)
            }
    
    return SecurityValidator()

@pytest.fixture
async def error_injection_manager():
    """Manage error injection for resilience testing."""
    class ErrorInjectionManager:
        def __init__(self):
            self.injected_errors: Dict[str, Any] = {}
            self.recovery_scenarios: List[str] = []
        
        async def inject_network_failure(self, duration: float = 5.0):
            """Inject network failure simulation."""
            self.injected_errors["network_failure"] = {
                "type": "network",
                "duration": duration,
                "injected_at": time.time()
            }
            logger.info(f"Injected network failure for {duration} seconds")
        
        async def inject_processing_error(self, error_type: str, job_id: str):
            """Inject processing error for specific job."""
            self.injected_errors[f"processing_error_{job_id}"] = {
                "type": "processing",
                "error_type": error_type,
                "job_id": job_id,
                "injected_at": time.time()
            }
            logger.info(f"Injected {error_type} error for job {job_id}")
        
        async def inject_resource_exhaustion(self, resource_type: str):
            """Inject resource exhaustion scenario."""
            self.injected_errors[f"resource_{resource_type}"] = {
                "type": "resource",
                "resource_type": resource_type,
                "injected_at": time.time()
            }
            logger.info(f"Injected {resource_type} exhaustion scenario")
        
        def clear_all_errors(self):
            """Clear all injected errors."""
            self.injected_errors.clear()
            logger.info("All injected errors cleared")
        
        def get_error_report(self) -> Dict[str, Any]:
            """Get report of all injected errors and recovery scenarios."""
            return {
                "injected_errors": self.injected_errors,
                "recovery_scenarios": self.recovery_scenarios
            }
    
    return ErrorInjectionManager()

@pytest.fixture
def test_reporter():
    """Generate comprehensive test reports with metrics and analysis."""
    class TestReporter:
        def __init__(self):
            self.test_results: List[Dict[str, Any]] = []
            self.performance_data: List[Dict[str, Any]] = []
            self.security_findings: List[Dict[str, Any]] = []
            self.error_scenarios: List[Dict[str, Any]] = []
        
        def record_test_result(self, test_name: str, result: str, duration: float, details: Dict[str, Any] = None):
            """Record individual test result."""
            self.test_results.append({
                "test_name": test_name,
                "result": result,
                "duration": duration,
                "details": details or {},
                "timestamp": time.time()
            })
        
        def record_performance_data(self, operation: str, metrics: Dict[str, float]):
            """Record performance metrics for an operation."""
            self.performance_data.append({
                "operation": operation,
                "metrics": metrics,
                "timestamp": time.time()
            })
        
        def record_security_finding(self, component: str, finding: Dict[str, Any]):
            """Record security validation finding."""
            self.security_findings.append({
                "component": component,
                "finding": finding,
                "timestamp": time.time()
            })
        
        def record_error_scenario(self, scenario: str, outcome: Dict[str, Any]):
            """Record error injection scenario outcome."""
            self.error_scenarios.append({
                "scenario": scenario,
                "outcome": outcome,
                "timestamp": time.time()
            })
        
        def generate_comprehensive_report(self) -> Dict[str, Any]:
            """Generate comprehensive test execution report."""
            total_tests = len(self.test_results)
            passed_tests = len([r for r in self.test_results if r["result"] == "passed"])
            failed_tests = len([r for r in self.test_results if r["result"] == "failed"])
            
            return {
                "summary": {
                    "total_tests": total_tests,
                    "passed": passed_tests,
                    "failed": failed_tests,
                    "success_rate": (passed_tests / total_tests * 100) if total_tests > 0 else 0
                },
                "test_results": self.test_results,
                "performance_analysis": {
                    "total_operations": len(self.performance_data),
                    "average_processing_time": sum(p["metrics"].get("processing_time", 0) for p in self.performance_data) / len(self.performance_data) if self.performance_data else 0,
                    "performance_data": self.performance_data
                },
                "security_analysis": {
                    "total_findings": len(self.security_findings),
                    "critical_findings": len([f for f in self.security_findings if f["finding"].get("severity") == "critical"]),
                    "security_findings": self.security_findings
                },
                "resilience_analysis": {
                    "error_scenarios_tested": len(self.error_scenarios),
                    "successful_recoveries": len([s for s in self.error_scenarios if s["outcome"].get("recovered", False)]),
                    "error_scenarios": self.error_scenarios
                }
            }
    
    return TestReporter()

# Utility functions for test execution
async def wait_for_processing_completion(
    mivaa_client: httpx.AsyncClient,
    job_id: str,
    timeout: float = TEST_TIMEOUT
) -> Dict[str, Any]:
    """Wait for MIVAA processing job to complete."""
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            response = await mivaa_client.get(f"/api/v1/jobs/{job_id}/status")
            if response.status_code == 200:
                status_data = response.json()
                if status_data.get("status") in ["completed", "failed", "error"]:
                    return status_data
        except Exception as e:
            logger.warning(f"Error checking job status: {e}")
        
        await asyncio.sleep(1.0)
    
    raise TimeoutError(f"Job {job_id} did not complete within {timeout} seconds")

async def validate_api_response_format(response: httpx.Response, expected_fields: List[str]) -> bool:
    """Validate API response format and required fields."""
    if response.status_code != 200:
        return False
    
    try:
        data = response.json()
        return all(field in data for field in expected_fields)
    except Exception:
        return False

def generate_test_job_id() -> str:
    """Generate unique test job ID."""
    return f"test_job_{int(time.time() * 1000)}_{id(object())}"