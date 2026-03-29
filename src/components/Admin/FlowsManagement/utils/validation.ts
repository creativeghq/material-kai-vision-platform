import type { FlowGraphDefinition } from '@/services/flows/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGraph(graph: FlowGraphDefinition): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { nodes, edges } = graph;

  // Must have at least one node
  if (nodes.length === 0) {
    errors.push('Flow must have at least one node');
    return { valid: false, errors, warnings };
  }

  // Must have exactly one trigger node
  const triggerNodes = nodes.filter(n => n.type === 'triggerNode');
  if (triggerNodes.length === 0) {
    errors.push('Flow must have a trigger node');
  } else if (triggerNodes.length > 1) {
    errors.push('Flow can only have one trigger node');
  }

  // Check for orphan nodes (no connections)
  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  const orphans = nodes.filter(n =>
    n.type !== 'triggerNode' && !connectedNodeIds.has(n.id),
  );
  if (orphans.length > 0) {
    warnings.push(`${orphans.length} node(s) are not connected to the flow`);
  }

  // Trigger node should not have incoming edges
  for (const trigger of triggerNodes) {
    const incomingEdges = edges.filter(e => e.target === trigger.id);
    if (incomingEdges.length > 0) {
      errors.push('Trigger node should not have incoming connections');
    }
  }

  // Action/condition nodes should have at least one incoming edge
  const nonTriggerNodes = nodes.filter(n => n.type !== 'triggerNode');
  for (const node of nonTriggerNodes) {
    if (connectedNodeIds.has(node.id)) {
      const incoming = edges.filter(e => e.target === node.id);
      if (incoming.length === 0) {
        warnings.push(`"${node.data.label}" has no incoming connections`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
