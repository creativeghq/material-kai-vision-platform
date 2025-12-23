import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  optional?: boolean;
}

interface MultiStepWizardProps {
  steps: Step[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  children: React.ReactNode;
  onNext?: () => void | Promise<void>;
  onPrevious?: () => void;
  onComplete?: () => void | Promise<void>;
  nextLabel?: string;
  previousLabel?: string;
  completeLabel?: string;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  isLoading?: boolean;
  className?: string;
}

export const MultiStepWizard: React.FC<MultiStepWizardProps> = ({
  steps,
  currentStep,
  onStepChange,
  children,
  onNext,
  onPrevious,
  onComplete,
  nextLabel = 'Next',
  previousLabel = 'Previous',
  completeLabel = 'Complete',
  canGoNext = true,
  canGoPrevious = true,
  isLoading = false,
  className,
}) => {
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = async () => {
    if (isLastStep && onComplete) {
      await onComplete();
    } else if (onNext) {
      await onNext();
    }
  };

  const handlePrevious = () => {
    if (onPrevious) {
      onPrevious();
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (onStepChange && stepIndex < currentStep) {
      onStepChange(stepIndex);
    }
  };

  return (
    <div className={cn('space-y-8', className)}>
      {/* Step Indicator */}
      <div className="relative">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.id}>
                {/* Step Circle */}
                <div className="flex flex-col items-center flex-1">
                  <button
                    onClick={() => handleStepClick(index)}
                    disabled={index >= currentStep}
                    className={cn(
                      'relative flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all',
                      isCompleted &&
                        'bg-primary border-primary text-primary-foreground cursor-pointer hover:bg-primary/90',
                      isCurrent && 'border-primary bg-primary/10 text-primary',
                      !isCompleted && !isCurrent && 'border-muted bg-background text-muted-foreground',
                      index < currentStep && 'cursor-pointer'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-6 w-6" />
                    ) : Icon ? (
                      <Icon className="h-6 w-6" />
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </button>
                  <div className="mt-2 text-center">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isCurrent && 'text-primary',
                        isCompleted && 'text-foreground',
                        !isCompleted && !isCurrent && 'text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-[120px]">
                        {step.description}
                      </p>
                    )}
                    {step.optional && (
                      <span className="text-xs text-muted-foreground italic">(Optional)</span>
                    )}
                  </div>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 mb-12">
                    <div
                      className={cn(
                        'h-full transition-all',
                        index < currentStep ? 'bg-primary' : 'bg-muted'
                      )}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">{children}</div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep || !canGoPrevious || isLoading}
        >
          {previousLabel}
        </Button>

        <Button onClick={handleNext} disabled={!canGoNext || isLoading}>
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Processing...
            </>
          ) : isLastStep ? (
            completeLabel
          ) : (
            <>
              {nextLabel}
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

