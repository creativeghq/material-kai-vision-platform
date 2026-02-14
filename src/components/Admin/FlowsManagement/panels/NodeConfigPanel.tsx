import React from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Separator } from '@/components/core/ui/separator';
import { useFlowBuilder } from '../hooks/useFlowBuilder';
import { TriggerConfigForm } from './configs/TriggerConfigForm';
import { ConditionConfigForm } from './configs/ConditionConfigForm';
import { ActionConfigForm } from './configs/ActionConfigForm';
import type { FlowNodeData, TriggerNodeData, ConditionNodeData, ActionNodeData } from '@/services/flows/types';

const categoryLabels: Record<string, string> = {
  trigger: 'Trigger',
  condition: 'Condition',
  action: 'Action',
};

const categoryColors: Record<string, string> = {
  trigger: 'bg-emerald-500',
  condition: 'bg-amber-500',
  action: 'bg-blue-500',
};

export function NodeConfigPanel() {
  const selectedNodeId = useFlowBuilder((s) => s.selectedNodeId);
  const nodes = useFlowBuilder((s) => s.nodes);
  const updateNodeData = useFlowBuilder((s) => s.updateNodeData);
  const deleteNode = useFlowBuilder((s) => s.deleteNode);
  const selectNode = useFlowBuilder((s) => s.selectNode);
  const flowId = useFlowBuilder((s) => s.flowId);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const nodeData = selectedNode.data as FlowNodeData;

  const handleLabelChange = (label: string) => {
    updateNodeData(selectedNode.id, { label } as Partial<FlowNodeData>);
  };

  const handleDescriptionChange = (description: string) => {
    updateNodeData(selectedNode.id, { description } as Partial<FlowNodeData>);
  };

  const handleConfigChange = (config: Record<string, unknown>) => {
    updateNodeData(selectedNode.id, { config } as unknown as Partial<FlowNodeData>);
  };

  return (
    <div className="w-[320px] border-l bg-muted/30 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${categoryColors[nodeData.category]}`} />
          <span className="text-sm font-medium">
            {categoryLabels[nodeData.category]} Configuration
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => selectNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 space-y-4">
        {/* Label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={nodeData.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            value={nodeData.description || ''}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder="Optional description..."
            className="h-8 text-sm"
          />
        </div>

        <Separator />

        {/* Type-specific config */}
        {nodeData.category === 'trigger' && (
          <TriggerConfigForm
            data={nodeData as TriggerNodeData}
            onChange={handleConfigChange}
            flowId={flowId}
          />
        )}
        {nodeData.category === 'condition' && (
          <ConditionConfigForm
            data={nodeData as ConditionNodeData}
            onChange={handleConfigChange}
          />
        )}
        {nodeData.category === 'action' && (
          <ActionConfigForm
            data={nodeData as ActionNodeData}
            onChange={handleConfigChange}
          />
        )}

        <Separator />

        {/* Delete button */}
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-2"
          onClick={() => {
            deleteNode(selectedNode.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}
