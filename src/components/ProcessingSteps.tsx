import React from 'react';
import { ProcessingStep } from '@/services/pollingService';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingStepsProps {
  steps: ProcessingStep[];
  currentStep: string;
  className?: string;
}

const ProcessingSteps: React.FC<ProcessingStepsProps> = ({ 
  steps, 
  currentStep, 
  className 
}) => {
  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepBorderColor = (step: ProcessingStep, isActive: boolean) => {
    if (isActive) return 'border-white';
    
    switch (step.status) {
      case 'completed':
        return 'border-green-500';
      case 'error':
        return 'border-red-500';
      case 'in-progress':
        return 'border-blue-500';
      default:
        return 'border-gray-600';
    }
  };

  const getProgressBarColor = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'in-progress':
        return 'bg-blue-500';
      default:
        return 'bg-gray-600';
    }
  };

  const formatDuration = (timestamp?: string) => {
    if (!timestamp) return '';
    const duration = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm font-medium text-gray-300 mb-4">
        Processing Steps
      </div>
      
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isLast = index === steps.length - 1;
        
        return (
          <div key={step.id} className="relative">
            {/* Step Container */}
            <div
              className={cn(
                "relative p-4 rounded-lg border-2 transition-all duration-300",
                "bg-[#1f2937]", // Background color as requested
                getStepBorderColor(step, isActive)
              )}
            >
              {/* Step Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  {getStepIcon(step)}
                  <div>
                    <h3 className="text-sm font-medium text-white">
                      {step.name}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {step.description}
                    </p>
                  </div>
                </div>
                
                {/* Status Badge */}
                <div className="flex items-center space-x-2">
                  {step.timestamp && (
                    <span className="text-xs text-gray-500">
                      {formatDuration(step.timestamp)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      step.status === 'completed' && "bg-green-900 text-green-300",
                      step.status === 'in-progress' && "bg-blue-900 text-blue-300",
                      step.status === 'error' && "bg-red-900 text-red-300",
                      step.status === 'pending' && "bg-gray-700 text-gray-400"
                    )}
                  >
                    {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              {(step.status === 'in-progress' || step.status === 'completed') && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{step.progress || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        getProgressBarColor(step)
                      )}
                      style={{ width: `${step.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Step Details */}
              {step.details && (
                <div className="mt-2 p-2 bg-gray-800 rounded text-xs text-gray-300">
                  {step.details}
                </div>
              )}

              {/* Active Step Pulse Effect */}
              {isActive && step.status === 'in-progress' && (
                <div className="absolute inset-0 rounded-lg border-2 border-white animate-pulse opacity-50" />
              )}
            </div>

            {/* Connector Line */}
            {!isLast && (
              <div className="absolute left-6 top-full w-0.5 h-4 bg-gray-600 transform translate-y-0" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ProcessingSteps;
