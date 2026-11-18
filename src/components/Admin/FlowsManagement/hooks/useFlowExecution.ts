import { useState, useCallback } from 'react';
import { flowService } from '@/services/flows';
import type { FlowRunResult } from '@/services/flows';

/** Run / test a flow; errors propagate so the caller can show the engine's own message. */
export function useFlowExecution() {
  const [executing, setExecuting] = useState(false);
  const [testing, setTesting] = useState(false);

  const executeFlow = useCallback(async (flowId: string, triggerData: Record<string, unknown> = {}): Promise<FlowRunResult> => {
    setExecuting(true);
    try {
      return await flowService.executeFlow(flowId, triggerData);
    } finally {
      setExecuting(false);
    }
  }, []);

  const testFlow = useCallback(async (flowId: string, sampleData: Record<string, unknown> = {}): Promise<FlowRunResult> => {
    setTesting(true);
    try {
      return await flowService.testFlow(flowId, sampleData);
    } finally {
      setTesting(false);
    }
  }, []);

  return { executing, testing, executeFlow, testFlow };
}
