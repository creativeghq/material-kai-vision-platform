import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  GitBranch, ArrowLeftRight, Filter, Timer,
  Repeat, CircleStop,
} from 'lucide-react';
import type {
  ConditionNodeData, ConditionType,
  IfElseConfig, SwitchConfig, DelayConfig, LoopConfig,
} from '@/services/flows/types';

const conditionIcons: Record<ConditionType, React.ElementType> = {
  if_else: GitBranch,
  switch: ArrowLeftRight,
  filter: Filter,
  delay: Timer,
  loop: Repeat,
  stop: CircleStop,
};

function getConditionSummary(data: ConditionNodeData): string {
  switch (data.conditionType) {
    case 'if_else': {
      const cfg = data.config as IfElseConfig;
      if (cfg.field && cfg.operator) {
        return `${cfg.field} ${cfg.operator} ${cfg.value || '""'}`;
      }
      return 'Configure condition...';
    }
    case 'switch': {
      const cfg = data.config as SwitchConfig;
      return cfg.field ? `Switch on: ${cfg.field}` : 'Configure switch...';
    }
    case 'filter':
      return 'Filter conditions';
    case 'delay': {
      const cfg = data.config as DelayConfig;
      return `Wait ${cfg.duration} ${cfg.unit}`;
    }
    case 'loop': {
      const cfg = data.config as LoopConfig;
      return cfg.collection_field ? `Loop over: ${cfg.collection_field}` : 'Configure loop...';
    }
    case 'stop':
      return 'End execution';
    default:
      return data.description || '';
  }
}

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const Icon = conditionIcons[nodeData.conditionType] || GitBranch;
  const summary = getConditionSummary(nodeData);
  const isIfElse = nodeData.conditionType === 'if_else';
  const isSwitch = nodeData.conditionType === 'switch';
  const isStop = nodeData.conditionType === 'stop';

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-background shadow-sm transition-colors ${
        selected ? 'border-amber-500 shadow-amber-500/20' : 'border-amber-500/30'
      }`}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-t-lg border-b border-amber-500/20">
        <Icon className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400 truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground truncate">{summary}</p>
      </div>

      {/* Output handles */}
      {isIfElse ? (
        <div className="flex justify-between px-3 pb-2">
          <div className="relative">
            <span className="text-[10px] text-emerald-600 font-medium">True</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background"
              style={{ left: '50%' }}
            />
          </div>
          <div className="relative">
            <span className="text-[10px] text-red-500 font-medium">False</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="!w-3 !h-3 !bg-red-500 !border-2 !border-background"
              style={{ left: '50%' }}
            />
          </div>
        </div>
      ) : isSwitch ? (
        <div className="flex justify-around px-2 pb-2">
          {((nodeData.config as SwitchConfig).cases || []).map((c, i) => (
            <div key={i} className="relative text-center">
              <span className="text-[10px] text-muted-foreground">{c.label || `Case ${i + 1}`}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`case_${i}`}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
                style={{ left: '50%' }}
              />
            </div>
          ))}
          <div className="relative text-center">
            <span className="text-[10px] text-muted-foreground">Default</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="default"
              className="!w-3 !h-3 !bg-gray-400 !border-2 !border-background"
              style={{ left: '50%' }}
            />
          </div>
        </div>
      ) : isStop ? null : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
        />
      )}
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
