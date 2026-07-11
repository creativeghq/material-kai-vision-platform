import React from 'react';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import type {
  ConditionNodeData,
  IfElseConfig,
  SwitchConfig,
  FilterConfig,
  DelayConfig,
  ABSplitConfig,
  LoopConfig,
  ComparisonOperator,
} from '@/services/flows/types';

interface ConditionConfigFormProps {
  data: ConditionNodeData;
  onChange: (config: Record<string, unknown>) => void;
}

const operatorLabels: Record<ComparisonOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Not Contains',
  starts_with: 'Starts With',
  ends_with: 'Ends With',
  gt: 'Greater Than',
  gte: 'Greater or Equal',
  lt: 'Less Than',
  lte: 'Less or Equal',
  is_empty: 'Is Empty',
  is_not_empty: 'Is Not Empty',
};

export function ConditionConfigForm({ data, onChange }: ConditionConfigFormProps) {
  const config = data.config;

  switch (data.conditionType) {
    case 'if_else': {
      const cfg = config as IfElseConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Field</Label>
            <Input
              value={cfg.field || ''}
              onChange={(e) => onChange({ ...cfg, field: e.target.value })}
              placeholder="e.g., trigger.data.email"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Operator</Label>
            <Select
              value={cfg.operator || 'equals'}
              onValueChange={(val) => onChange({ ...cfg, operator: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(operatorLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              value={cfg.value || ''}
              onChange={(e) => onChange({ ...cfg, value: e.target.value })}
              placeholder="Value to compare against"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'switch': {
      const cfg = config as SwitchConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Field to Switch On</Label>
            <Input
              value={cfg.field || ''}
              onChange={(e) => onChange({ ...cfg, field: e.target.value })}
              placeholder="e.g., trigger.data.role"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cases</Label>
            {(cfg.cases || []).map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={c.value}
                  onChange={(e) => {
                    const cases = [...(cfg.cases || [])];
                    cases[i] = { ...cases[i], value: e.target.value };
                    onChange({ ...cfg, cases });
                  }}
                  placeholder="Value"
                  className="h-8 text-sm flex-1"
                />
                <Input
                  value={c.label}
                  onChange={(e) => {
                    const cases = [...(cfg.cases || [])];
                    cases[i] = { ...cases[i], label: e.target.value };
                    onChange({ ...cfg, cases });
                  }}
                  placeholder="Label"
                  className="h-8 text-sm flex-1"
                />
              </div>
            ))}
            <button
              onClick={() => {
                const cases = [...(cfg.cases || []), { value: '', label: `Case ${(cfg.cases || []).length + 1}` }];
                onChange({ ...cfg, cases });
              }}
              className="text-xs text-primary hover:underline"
            >
              + Add case
            </button>
          </div>
        </div>
      );
    }

    case 'filter': {
      const cfg = config as FilterConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Logic</Label>
            <Select
              value={cfg.logic || 'and'}
              onValueChange={(val) => onChange({ ...cfg, logic: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">All conditions (AND)</SelectItem>
                <SelectItem value="or">Any condition (OR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(cfg.conditions || []).map((cond, i) => (
            <div key={i} className="space-y-1.5 p-2 border rounded">
              <Input
                value={cond.field || ''}
                onChange={(e) => {
                  const conditions = [...(cfg.conditions || [])];
                  conditions[i] = { ...conditions[i], field: e.target.value };
                  onChange({ ...cfg, conditions });
                }}
                placeholder="Field"
                className="h-7 text-xs font-mono"
              />
              <Select
                value={cond.operator || 'equals'}
                onValueChange={(val) => {
                  const conditions = [...(cfg.conditions || [])];
                  conditions[i] = { ...conditions[i], operator: val as ComparisonOperator };
                  onChange({ ...cfg, conditions });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(operatorLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={cond.value || ''}
                onChange={(e) => {
                  const conditions = [...(cfg.conditions || [])];
                  conditions[i] = { ...conditions[i], value: e.target.value };
                  onChange({ ...cfg, conditions });
                }}
                placeholder="Value"
                className="h-7 text-xs"
              />
            </div>
          ))}
          <button
            onClick={() => {
              const conditions = [...(cfg.conditions || []), { field: '', operator: 'equals' as ComparisonOperator, value: '' }];
              onChange({ ...cfg, conditions });
            }}
            className="text-xs text-primary hover:underline"
          >
            + Add condition
          </button>
        </div>
      );
    }

    case 'delay': {
      const cfg = config as DelayConfig;
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Duration</Label>
              <Input
                type="number"
                min={1}
                value={cfg.duration || 5}
                onChange={(e) => onChange({ ...cfg, duration: parseInt(e.target.value) || 1 })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Unit</Label>
              <Select
                value={cfg.unit || 'minutes'}
                onValueChange={(val) => onChange({ ...cfg, unit: val })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Seconds</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    }

    case 'ab_split': {
      const cfg = config as ABSplitConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Split Percentage (A)</Label>
            <Input
              type="number"
              min={1}
              max={99}
              value={cfg.split_percentage || 50}
              onChange={(e) => onChange({ ...cfg, split_percentage: parseInt(e.target.value) || 50 })}
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              A: {cfg.split_percentage || 50}% / B: {100 - (cfg.split_percentage || 50)}%
            </p>
          </div>
        </div>
      );
    }

    case 'loop': {
      const cfg = config as LoopConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Collection Field</Label>
            <Input
              value={cfg.collection_field || ''}
              onChange={(e) => onChange({ ...cfg, collection_field: e.target.value })}
              placeholder="e.g., trigger.data.items"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Item Variable Name</Label>
            <Input
              value={cfg.item_variable || 'item'}
              onChange={(e) => onChange({ ...cfg, item_variable: e.target.value })}
              placeholder="item"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max Iterations</Label>
            <Input
              type="number"
              min={1}
              value={cfg.max_iterations || 100}
              onChange={(e) => onChange({ ...cfg, max_iterations: parseInt(e.target.value) || 100 })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'stop':
      return (
        <div className="text-xs text-muted-foreground">
          This node will stop the current execution path. No further nodes after this will be processed.
        </div>
      );

    default:
      return null;
  }
}
