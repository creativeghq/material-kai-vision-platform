-- ML Model Management
CREATE TABLE public.ml_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  model_type VARCHAR(100) NOT NULL, -- 'recognition', 'style', 'embedding', etc.
  status VARCHAR(50) DEFAULT 'active',
  confidence_threshold DECIMAL(3,2) DEFAULT 0.7,
  model_path TEXT,
  metadata JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ML Training Jobs
CREATE TABLE public.ml_training_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES public.ml_models(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
  training_config JSONB NOT NULL,
  dataset_info JSONB,
  progress_percentage INTEGER DEFAULT 0,
  metrics JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

-- Style Analysis Results
CREATE TABLE public.material_style_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES public.materials_catalog(id),
  style_tags TEXT[] DEFAULT '{}',
  style_confidence JSONB DEFAULT '{}', -- {tag: confidence_score}
  color_palette JSONB DEFAULT '{}',
  texture_analysis JSONB DEFAULT '{}',
  room_suitability JSONB DEFAULT '{}', -- {room_type: suitability_score}
  trend_score DECIMAL(3,2),
  ml_model_version VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Agent ML Task Results
CREATE TABLE public.agent_ml_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_task_id UUID REFERENCES public.agent_tasks(id),
  ml_operation_type VARCHAR(100) NOT NULL, -- 'recognition', 'style_analysis', 'spatial_analysis'
  input_data JSONB NOT NULL,
  ml_results JSONB DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  processing_time_ms INTEGER,
  model_versions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Real-time ML Processing Queue
CREATE TABLE public.ml_processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 5,
  input_data JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed
  assigned_worker VARCHAR(100),
  progress_data JSONB DEFAULT '{}',
  result_data JSONB,
  error_details TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_style_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_ml_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "ML models viewable by everyone" ON public.ml_models
  FOR SELECT USING (true);

CREATE POLICY "Only admins can manage ML models" ON public.ml_models
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own training jobs" ON public.ml_training_jobs
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Admins can manage all training jobs" ON public.ml_training_jobs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Style analysis viewable by everyone" ON public.material_style_analysis
  FOR SELECT USING (true);

CREATE POLICY "Analysts can manage style analysis" ON public.material_style_analysis
  FOR ALL USING (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view ML tasks for their agent tasks" ON public.agent_ml_tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.agent_tasks 
    WHERE agent_tasks.id = agent_ml_tasks.agent_task_id 
    AND agent_tasks.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their own ML processing queue" ON public.ml_processing_queue
  FOR ALL USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_ml_models_type_status ON public.ml_models(model_type, status);
CREATE INDEX idx_ml_training_jobs_status ON public.ml_training_jobs(status);
CREATE INDEX idx_material_style_analysis_material_id ON public.material_style_analysis(material_id);
CREATE INDEX idx_agent_ml_tasks_agent_task_id ON public.agent_ml_tasks(agent_task_id);
CREATE INDEX idx_ml_processing_queue_status ON public.ml_processing_queue(status, priority);
CREATE INDEX idx_ml_processing_queue_user_status ON public.ml_processing_queue(user_id, status);

-- Triggers for updated_at
CREATE TRIGGER update_ml_models_updated_at
  BEFORE UPDATE ON public.ml_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_material_style_analysis_updated_at
  BEFORE UPDATE ON public.material_style_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();