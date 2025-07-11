-- Create table for CrewAI agent management
CREATE TABLE public.crewai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  specialization TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  capabilities JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  memory_data JSONB DEFAULT '{}',
  learning_progress JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for agent tasks and coordination
CREATE TABLE public.agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_type TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  assigned_agents UUID[] DEFAULT '{}',
  input_data JSONB NOT NULL,
  result_data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  coordination_plan JSONB DEFAULT '{}',
  execution_timeline JSONB DEFAULT '{}',
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for SpaceFormer spatial analysis
CREATE TABLE public.spatial_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nerf_reconstruction_id UUID,
  room_type TEXT NOT NULL,
  room_dimensions JSONB DEFAULT '{}',
  spatial_features JSONB DEFAULT '{}',
  layout_suggestions JSONB DEFAULT '{}',
  material_placements JSONB DEFAULT '{}',
  accessibility_analysis JSONB DEFAULT '{}',
  flow_optimization JSONB DEFAULT '{}',
  reasoning_explanation TEXT,
  confidence_score FLOAT,
  processing_time_ms INTEGER,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for all tables
ALTER TABLE public.crewai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spatial_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for crewai_agents (admin access only)
CREATE POLICY "Admins can manage agents" 
ON public.crewai_agents 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view active agents" 
ON public.crewai_agents 
FOR SELECT 
USING (status = 'active');

-- Create policies for agent_tasks
CREATE POLICY "Users can view their own agent tasks" 
ON public.agent_tasks 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent tasks" 
ON public.agent_tasks 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent tasks" 
ON public.agent_tasks 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create policies for spatial_analysis
CREATE POLICY "Users can view their own spatial analysis" 
ON public.spatial_analysis 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own spatial analysis" 
ON public.spatial_analysis 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spatial analysis" 
ON public.spatial_analysis 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_crewai_agents_updated_at
BEFORE UPDATE ON public.crewai_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_tasks_updated_at
BEFORE UPDATE ON public.agent_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_spatial_analysis_updated_at
BEFORE UPDATE ON public.spatial_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_crewai_agents_type ON public.crewai_agents(agent_type);
CREATE INDEX idx_crewai_agents_status ON public.crewai_agents(status);
CREATE INDEX idx_agent_tasks_user_id ON public.agent_tasks(user_id);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks(status);
CREATE INDEX idx_agent_tasks_priority ON public.agent_tasks(priority DESC);
CREATE INDEX idx_spatial_analysis_user_id ON public.spatial_analysis(user_id);
CREATE INDEX idx_spatial_analysis_nerf_id ON public.spatial_analysis(nerf_reconstruction_id);
CREATE INDEX idx_spatial_analysis_status ON public.spatial_analysis(status);

-- Insert default CrewAI agents
INSERT INTO public.crewai_agents (agent_name, agent_type, specialization, capabilities) VALUES
('Material Expert', 'specialist', 'material_analysis', '{"expertise": ["SVBRDF", "material_properties", "durability_assessment"], "confidence_threshold": 0.8}'),
('Design Critic', 'evaluator', 'design_evaluation', '{"expertise": ["aesthetic_analysis", "functionality_review", "user_experience"], "confidence_threshold": 0.7}'),
('Space Planner', 'coordinator', 'spatial_planning', '{"expertise": ["layout_optimization", "traffic_flow", "accessibility"], "confidence_threshold": 0.9}'),
('Quality Assessor', 'validator', 'quality_control', '{"expertise": ["output_validation", "consistency_check", "error_detection"], "confidence_threshold": 0.85}'),
('Budget Optimizer', 'advisor', 'cost_analysis', '{"expertise": ["cost_estimation", "material_pricing", "budget_optimization"], "confidence_threshold": 0.75}');