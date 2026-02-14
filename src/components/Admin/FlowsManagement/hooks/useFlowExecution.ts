import { useState, useCallback } from 'react';
import { flowService } from '@/services/flows';
import type { FlowRun, FlowRunStep } from '@/services/flows';

interface UseFlowExecutionReturn {
  executing: boolean;
  testing: boolean;
  lastRun: FlowRun | null;
  executeFlow: (flowId: string, triggerData?: Record<string, unknown>) => Promise<FlowRun | null>;
  testFlow: (flowId: string, sampleData?: Record<string, unknown>) => Promise<FlowRun | null>;
}

export function useFlowExecution(): UseFlowExecutionReturn {
  const [executing, setExecuting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastRun, setLastRun] = useState<FlowRun | null>(null);

  const executeFlow = useCallback(async (
    flowId: string,
    triggerData: Record<string, unknown> = {},
  ): Promise<FlowRun | null> => {
    setExecuting(true);
    try {
      const run = await flowService.executeFlow(flowId, triggerData);
      setLastRun(run);
      return run;
    } catch (error) {
      console.error('Flow execution failed:', error);
      return null;
    } finally {
      setExecuting(false);
    }
  }, []);

  const testFlow = useCallback(async (
    flowId: string,
    sampleData: Record<string, unknown> = {},
  ): Promise<FlowRun | null> => {
    setTesting(true);
    try {
      const run = await flowService.testFlow(flowId, sampleData);
      setLastRun(run);
      return run;
    } catch (error) {
      console.error('Flow test failed:', error);
      return null;
    } finally {
      setTesting(false);
    }
  }, []);

  return { executing, testing, lastRun, executeFlow, testFlow };
}
