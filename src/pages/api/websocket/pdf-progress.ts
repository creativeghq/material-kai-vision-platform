/**
 * WebSocket API endpoint for PDF processing progress
 * 
 * This is a fallback implementation for development.
 * In production, you would use a dedicated WebSocket server.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Return WebSocket connection info
    res.status(200).json({
      message: 'PDF Processing WebSocket endpoint',
      websocketUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws/pdf-processing',
      fallbackPolling: '/api/pdf/progress',
      documentation: {
        description: 'Real-time PDF processing progress updates via WebSocket',
        events: [
          'progress_update - Overall progress and statistics',
          'step_update - Individual step progress',
          'error - Processing errors',
          'completed - Processing completion',
          'cancelled - Processing cancellation'
        ],
        subscription: {
          type: 'subscribe_progress',
          payload: { progressId: 'job-id' }
        }
      }
    });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
  }
}
