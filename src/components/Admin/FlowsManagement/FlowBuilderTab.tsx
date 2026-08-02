import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, AlertTriangle, CheckCircle2, Loader2, Play, TestTube } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFlowExecution } from './hooks/useFlowExecution';
import { useFlowBuilder } from './hooks/useFlowBuilder';
import { flowService } from '@/services/flows';
import { nodeTypes } from './nodes/nodeTypes';
import { edgeTypes } from './edges/edgeTypes';
import { NodePalette } from './panels/NodePalette';
import { NodeConfigPanel } from './panels/NodeConfigPanel';
import type { FlowNodeData } from '@/services/flows/types';

interface FlowBuilderTabProps {
  flowId: string | null;
  /** #256 — workspace (tenant) builder: restrict the palette to the tenant-safe node subset.
   *  The DB guard trigger enforces it regardless; this trims the UI. Admin surface leaves it off. */
  tenantMode?: boolean;
}

function FlowBuilderCanvas({ flowId, tenantMode = false }: FlowBuilderTabProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const { toast } = useToast();
  const { executing, testing, executeFlow, testFlow } = useFlowExecution();

  const {
    nodes,
    edges,
    flowName,
    isDirty,
    isSaving,
    selectedNodeId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    loadGraph,
    saveGraph,
    validateGraph,
    resetBuilder,
  } = useFlowBuilder();

  // Load flow data when flowId changes
  useEffect(() => {
    if (!flowId) {
      resetBuilder();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const flow = await flowService.getFlow(flowId);
        if (!cancelled) {
          loadGraph(flow.id, flow.name, flow.graph_definition, flow.version);
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to load flow',
            variant: 'destructive',
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [flowId, loadGraph, resetBuilder, toast]);

  // Handle drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const type = e.dataTransfer.getData('application/reactflow-type');
      const dataStr = e.dataTransfer.getData('application/reactflow-data');
      if (!type || !dataStr || !reactFlowInstance) return;

      const position: XYPosition = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const data = JSON.parse(dataStr) as FlowNodeData;
      addNode(type, position, data);
    },
    [reactFlowInstance, addNode],
  );

  // Handle save
  const handleSave = useCallback(async () => {
    const validation = validateGraph();
    if (!validation.valid) {
      toast({
        title: 'Validation Error',
        description: validation.errors.join('. '),
        variant: 'destructive',
      });
      return;
    }

    if (validation.warnings.length > 0) {
      toast({
        title: 'Warning',
        description: validation.warnings.join('. '),
      });
    }

    try {
      await saveGraph();
      toast({ title: 'Saved', description: 'Flow saved successfully' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save flow',
        variant: 'destructive',
      });
    }
  }, [saveGraph, validateGraph, toast]);

  // Handle click on pane (deselect node)
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle node click (select node)
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  if (!flowId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-300px)] border-2 border-dashed border-muted-foreground/25 rounded-lg">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No flow selected</p>
          <p className="text-sm">Select a flow from "My Flows" tab or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{flowName || 'Untitled Flow'}</h3>
          {isDirty && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Unsaved
            </Badge>
          )}
          {!isDirty && nodes.length > 0 && (
            <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!flowId) return;
              const run = await testFlow(flowId);
              if (run) {
                toast({ title: 'Test Complete', description: `Test run finished with status: ${(run as unknown as { status: string }).status || 'unknown'}` });
              } else {
                toast({ title: 'Test Failed', description: 'Check run history for details', variant: 'destructive' });
              }
            }}
            disabled={testing || nodes.length === 0}
            className="gap-1.5"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TestTube className="h-3.5 w-3.5" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!flowId) return;
              const run = await executeFlow(flowId);
              if (run) {
                toast({ title: 'Executed', description: `Flow run finished with status: ${(run as unknown as { status: string }).status || 'unknown'}` });
              } else {
                toast({ title: 'Execution Failed', description: 'Check run history for details', variant: 'destructive' });
              }
            }}
            disabled={executing || nodes.length === 0}
            className="gap-1.5"
          >
            {executing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={reactFlowWrapper}
        className="h-[calc(100vh-340px)] border rounded-lg overflow-hidden flex"
      >
        {/* Left: Palette */}
        <NodePalette tenantMode={tenantMode} />

        {/* Center: Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{
              type: 'flowEdge',
              animated: true,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="!bg-background !border"
            />
          </ReactFlow>
        </div>

        {/* Right: Config Panel */}
        {selectedNodeId && <NodeConfigPanel />}
      </div>
    </div>
  );
}

export function FlowBuilderTab({ flowId, tenantMode = false }: FlowBuilderTabProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderCanvas flowId={flowId} tenantMode={tenantMode} />
    </ReactFlowProvider>
  );
}
