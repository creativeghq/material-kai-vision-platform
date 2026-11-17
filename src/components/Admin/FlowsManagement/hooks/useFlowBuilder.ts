import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type XYPosition,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type { FlowNodeData, FlowGraphDefinition } from '@/services/flows/types';
import { flowService } from '@/services/flows';
import { validateGraph, type ValidationResult } from '../utils/validation';

interface FlowBuilderState {
  // Flow metadata
  flowId: string | null;
  flowName: string;
  flowVersion: number;

  // Graph state
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  isDirty: boolean;
  isSaving: boolean;

  // xyflow callbacks
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Node operations
  addNode: (type: string, position: XYPosition, data: FlowNodeData) => void;
  updateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // Graph operations
  loadGraph: (flowId: string, flowName: string, graph: FlowGraphDefinition, version: number) => void;
  saveGraph: () => Promise<void>;
  validateGraph: () => ValidationResult;
  resetBuilder: () => void;
}

let nodeIdCounter = 0;

function generateNodeId(type: string): string {
  nodeIdCounter++;
  return `${type}-${Date.now()}-${nodeIdCounter}`;
}

export const useFlowBuilder = create<FlowBuilderState>((set, get) => ({
  flowId: null,
  flowName: '',
  flowVersion: 1,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,

  onNodesChange: (changes) => {
    set((state) => ({
      // applyNodeChanges erases the data generic; reassert it.
      nodes: applyNodeChanges(changes, state.nodes) as Node<FlowNodeData>[],
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }));
  },

  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          type: 'flowEdge',
          animated: true,
        },
        state.edges,
      ),
      isDirty: true,
    }));
  },

  addNode: (type, position, data) => {
    const id = generateNodeId(type);
    const newNode: Node<FlowNodeData> = {
      id,
      type,
      position,
      data,
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
      selectedNodeId: id,
    }));
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } as FlowNodeData }
          : node,
      ),
      isDirty: true,
    }));
  },

  deleteNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      isDirty: true,
    }));
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  loadGraph: (flowId, flowName, graph, version) => {
    set({
      flowId,
      flowName,
      flowVersion: version,
      nodes: (graph.nodes || []) as Node<FlowNodeData>[],
      edges: graph.edges || [],
      selectedNodeId: null,
      isDirty: false,
      isSaving: false,
    });
  },

  saveGraph: async () => {
    const { flowId, nodes, edges, flowVersion } = get();
    if (!flowId) return;

    set({ isSaving: true });
    try {
      const graph: FlowGraphDefinition = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type as 'triggerNode' | 'conditionNode' | 'actionNode',
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          label: typeof e.label === 'string' ? e.label : undefined,
          animated: e.animated,
          type: e.type,
        })),
        viewport: { x: 0, y: 0, zoom: 1 },
      };

      const updated = await flowService.saveGraph(flowId, graph, flowVersion);
      set({
        flowVersion: updated.version,
        isDirty: false,
      });
    } finally {
      set({ isSaving: false });
    }
  },

  validateGraph: () => {
    const { nodes, edges } = get();
    return validateGraph({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as 'triggerNode' | 'conditionNode' | 'actionNode',
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  },

  resetBuilder: () => {
    set({
      flowId: null,
      flowName: '',
      flowVersion: 1,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isDirty: false,
      isSaving: false,
    });
  },
}));
