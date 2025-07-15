-- Create default CrewAI agents if none exist
INSERT INTO public.crewai_agents (
  agent_name,
  agent_type,
  specialization,
  capabilities,
  status,
  performance_metrics
) VALUES 
(
  'Material Expert',
  'specialist',
  'Material Analysis and Properties',
  '{
    "expertise": ["material_properties", "sustainability", "cost_analysis", "durability"],
    "knowledge_domains": ["construction", "interior_design", "engineering"],
    "analysis_types": ["composition", "performance", "environmental_impact"]
  }'::jsonb,
  'active',
  '{
    "total_executions": 0,
    "average_confidence": 0.85,
    "last_execution_time": 0,
    "success_rate": 0.95
  }'::jsonb
),
(
  'Space Planner',
  'designer',
  'Spatial Design and Layout Optimization',
  '{
    "expertise": ["space_optimization", "layout_design", "user_experience", "accessibility"],
    "knowledge_domains": ["interior_design", "architecture", "ergonomics"],
    "analysis_types": ["spatial_analysis", "flow_optimization", "aesthetic_evaluation"]
  }'::jsonb,
  'active',
  '{
    "total_executions": 0,
    "average_confidence": 0.82,
    "last_execution_time": 0,
    "success_rate": 0.92
  }'::jsonb
),
(
  'Quality Assessor',
  'evaluator',
  'Quality Control and Standards Compliance',
  '{
    "expertise": ["quality_standards", "safety_compliance", "testing_protocols", "certification"],
    "knowledge_domains": ["manufacturing", "construction", "regulatory"],
    "analysis_types": ["compliance_check", "quality_metrics", "risk_assessment"]
  }'::jsonb,
  'active',
  '{
    "total_executions": 0,
    "average_confidence": 0.88,
    "last_execution_time": 0,
    "success_rate": 0.94
  }'::jsonb
),
(
  'Design Critic',
  'reviewer',
  'Design Critique and Aesthetic Analysis',
  '{
    "expertise": ["aesthetic_evaluation", "design_principles", "trend_analysis", "user_feedback"],
    "knowledge_domains": ["design_theory", "color_theory", "visual_arts"],
    "analysis_types": ["aesthetic_review", "trend_alignment", "user_preference"]
  }'::jsonb,
  'active',
  '{
    "total_executions": 0,
    "average_confidence": 0.79,
    "last_execution_time": 0,
    "success_rate": 0.89
  }'::jsonb
),
(
  'Budget Optimizer',
  'analyst',
  'Cost Analysis and Budget Optimization',
  '{
    "expertise": ["cost_analysis", "budget_planning", "value_engineering", "roi_calculation"],
    "knowledge_domains": ["finance", "procurement", "market_analysis"],
    "analysis_types": ["cost_breakdown", "budget_optimization", "value_analysis"]
  }'::jsonb,
  'active',
  '{
    "total_executions": 0,
    "average_confidence": 0.86,
    "last_execution_time": 0,
    "success_rate": 0.91
  }'::jsonb
)
ON CONFLICT (agent_name) DO NOTHING;