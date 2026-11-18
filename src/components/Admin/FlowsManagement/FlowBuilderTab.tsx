import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Save, AlertTriangle, CheckCircle2, Loader2, Play, TestTube, Settings2, Workflow } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { useFlowExecution } from './hooks/useFlowExecution';
import { useFlowBuilder } from './hooks/useFlowBuilder';
import { flowService, RUNNABLE_FLOW_STATUSES } from '@/services/flows';
import { getTriggerVariables } from '@/services/flows/triggerVariables';
import { nodeTypes } from './nodes/nodeTypes';
import { edgeTypes } from './edges/edgeTypes';
import { NodePalette } from './panels/NodePalette';
import { NodeConfigPanel } from './panels/NodeConfigPanel';
import { runOutcomeToast } from './utils/runOutcome';
import type { Flow, FlowNodeData, FlowStatus, TriggerNodeData } from '@/services/flows/types';

interface FlowBuilderTabProps {
  flowId: string | null;
  /** Workspace (tenant) builder: restrict the palette to the tenant-safe node subset.
   *  The DB guard trigger enforces it regardless; this trims the UI. Admin surface leaves it off. */
  tenantMode?: boolean;
  /** Operator surface: the flows to switch between, and how to open one. */
  flows?: Flow[];
  onSelectFlow?: (flowId: string) => void;
  onSaved?: () => void;
}

const STATUSES: FlowStatus[] = ['draft', 'active', 'paused', 'archived'];

/** A sample `trigger.data` built from the trigger's documented variables, for the Test dialog. */
function samplePayload(triggerType: string | undefined): string {
  const sample: Record<string, unknown> = {};
  for (const v of getTriggerVariables(triggerType)) sample[v.key] = v.example ?? '';
  return JSON.stringify(sample, null, 2);
}

function FlowBuilderCanvas({ flowId, tenantMode = false, flows, onSelectFlow, onSaved }: FlowBuilderTabProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState({ name: '', description: '', status: 'draft' as FlowStatus });
  const [savingDetails, setSavingDetails] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPayload, setTestPayload] = useState('{}');
  const { toast } = useToast();
  const { executing, testing, executeFlow, testFlow } = useFlowExecution();

  const {
    nodes, edges, flowName, isDirty, isSaving, selectedNodeId,
    onNodesChange, onEdgesChange, onConnect, addNode, selectNode, loadGraph, saveGraph, validateGraph, resetBuilder,
  } = useFlowBuilder();

  useEffect(() => {
    if (!flowId) {
      resetBuilder();
      setFlow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const f = await flowService.getFlow(flowId);
        if (!cancelled) {
          setFlow(f);
          loadGraph(f.id, f.name, f.graph_definition, f.version);
        }
      } catch (error) {
        if (!cancelled) toast({ title: 'Could not load the flow', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [flowId, loadGraph, resetBuilder, toast]);

  // Warn before a reload or tab close drops unsaved canvas changes.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const triggerType = useMemo(() => {
    const t = nodes.find((n) => n.type === 'triggerNode');
    return (t?.data as TriggerNodeData | undefined)?.triggerType ?? flow?.trigger_type;
  }, [nodes, flow]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    const dataStr = e.dataTransfer.getData('application/reactflow-data');
    if (!type || !dataStr || !reactFlowInstance) return;
    const position: XYPosition = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, position, JSON.parse(dataStr) as FlowNodeData);
  }, [reactFlowInstance, addNode]);

  // Keyboard/click path: the node goes to the middle of what the user is looking at.
  const handleAddNodeFromPalette = useCallback((type: string, data: FlowNodeData) => {
    if (!reactFlowInstance) return;
    addNode(type, reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }), data);
  }, [reactFlowInstance, addNode]);

  const handleSave = useCallback(async () => {
    const validation = validateGraph();
    if (!validation.valid) {
      toast({ title: 'Cannot save yet', description: validation.errors.join('. '), variant: 'destructive' });
      return;
    }
    if (validation.warnings.length > 0) toast({ title: 'Saved with warnings', description: validation.warnings.join('. ') });
    try {
      await saveGraph(reactFlowInstance?.getViewport());
      if (!validation.warnings.length) toast({ title: 'Saved' });
      onSaved?.();
    } catch (error) {
      toast({ title: 'Could not save the flow', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  }, [saveGraph, validateGraph, reactFlowInstance, toast, onSaved]);

  const openDetails = () => {
    if (!flow) return;
    setDetails({ name: flow.name, description: flow.description ?? '', status: flow.status });
    setDetailsOpen(true);
  };

  const saveDetails = async () => {
    if (!flow || !details.name.trim()) return;
    setSavingDetails(true);
    try {
      const updated = await flowService.updateFlow(flow.id, {
        name: details.name.trim(), description: details.description.trim() || null, status: details.status,
      });
      setFlow(updated);
      useFlowBuilder.setState({ flowName: updated.name });
      setDetailsOpen(false);
      onSaved?.();
    } catch (error) {
      toast({ title: 'Could not update the flow', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSavingDetails(false);
    }
  };

  const runTest = async () => {
    if (!flowId) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(testPayload || '{}') as Record<string, unknown>;
    } catch {
      toast({ title: 'The sample payload is not valid JSON', variant: 'destructive' });
      return;
    }
    try {
      toast(runOutcomeToast(flowName || 'Flow', await testFlow(flowId, data), true));
      setTestOpen(false);
    } catch (error) {
      toast({ title: 'Test run failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const runNow = async () => {
    if (!flowId) return;
    try {
      toast(runOutcomeToast(flowName || 'Flow', await executeFlow(flowId)));
    } catch (error) {
      toast({ title: 'Run failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const flowPicker = flows && onSelectFlow ? (
    <Select value={flowId ?? undefined} onValueChange={onSelectFlow}>
      <SelectTrigger className="h-9 w-full sm:w-[280px]" aria-label="Open a flow"><SelectValue placeholder="Open a flow…" /></SelectTrigger>
      <SelectContent>
        {[...flows].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  if (!flowId) {
    return (
      <HubEmptyState
        icon={Workflow}
        title="Pick a flow to edit"
        description="Choose one here, or press Edit on a flow in My Flows."
        action={flowPicker ?? undefined}
      />
    );
  }

  const runnable = !flow || RUNNABLE_FLOW_STATUSES.has(flow.status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {flowPicker}
          {!flowPicker && <h3 className="text-sm font-medium">{flowName || 'Untitled Flow'}</h3>}
          {flow && <Badge variant={flow.status === 'active' ? 'success' : flow.status === 'paused' ? 'warning' : 'neutral'}>{humanizeLabel(flow.status)}</Badge>}
          {isDirty
            ? <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" />Unsaved</Badge>
            : nodes.length > 0 && <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Saved</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={openDetails} disabled={!flow} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Details
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setTestPayload(samplePayload(triggerType)); setTestOpen(true); }}
            disabled={testing || nodes.length === 0}
            title={isDirty ? 'Runs the last saved version' : undefined}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
            Test
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={() => void runNow()}
            disabled={executing || nodes.length === 0 || !runnable || isDirty}
            title={!runnable ? `A ${flow?.status} flow cannot run. Set it to active in Details.` : isDirty ? 'Save first: a run uses the saved version' : undefined}
          >
            {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={!isDirty || isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      <div ref={reactFlowWrapper} className="h-[calc(100vh-340px)] min-h-[420px] border border-hairline rounded-sm overflow-hidden flex">
        <NodePalette tenantMode={tenantMode} onAddNode={handleAddNodeFromPalette} />
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
            onPaneClick={() => selectNode(null)}
            onNodeClick={(_, node) => selectNode(node.id)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: 'flowEdge', animated: true }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} className="!bg-background !border" />
          </ReactFlow>
        </div>
        {selectedNodeId && <NodeConfigPanel />}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flow Details</DialogTitle>
            <DialogDescription>Name, description and status. The graph is saved separately with Save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="flow-details-name">Name</Label>
              <Input id="flow-details-name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-details-description">Description (optional)</Label>
              <Textarea id="flow-details-description" rows={2} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-details-status">Status</Label>
              <Select value={details.status} onValueChange={(v) => setDetails({ ...details, status: v as FlowStatus })}>
                <SelectTrigger id="flow-details-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{humanizeLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only Active flows fire on their trigger; Draft and Active can be run by hand.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveDetails()} disabled={savingDetails || !details.name.trim()}>{savingDetails ? 'Saving…' : 'Save details'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Test Run</DialogTitle>
            <DialogDescription>
              Runs the saved version as a test, with this sample as the trigger data. Templates such as {'{{trigger.data.user_id}}'} read from it; an action whose inputs stay empty is skipped and says why.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={testPayload} onChange={(e) => setTestPayload(e.target.value)} rows={12} className="font-mono text-xs" aria-label="Sample trigger data (JSON)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button onClick={() => void runTest()} disabled={testing}>{testing ? 'Running…' : 'Run test'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FlowBuilderTab(props: FlowBuilderTabProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderCanvas {...props} />
    </ReactFlowProvider>
  );
}
