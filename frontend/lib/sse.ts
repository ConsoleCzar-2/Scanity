import type {
  SSECitationsPayload,
  SSEDonePayload,
  SSEErrorPayload,
  SSEGateRejectedPayload,
  SSEStatusPayload,
  SSETokenPayload,
} from '@/types/api';

export interface SSEHandlers {
  onStatus?: (data: SSEStatusPayload) => void;
  onToken?: (data: SSETokenPayload) => void;
  onCitations?: (data: SSECitationsPayload) => void;
  onGateRejected?: (data: SSEGateRejectedPayload) => void;
  onDone?: (data: SSEDonePayload) => void;
  onError?: (data: SSEErrorPayload) => void;
}

/**
 * Consumes and parses a Server-Sent Events (SSE) ReadableStream from the backend.
 * Accurately buffers streaming byte chunks, extracts double-newline delimited frames,
 * parses event and data lines, and dispatches to typed callback handlers.
 */
export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: SSEHandlers
): Promise<void> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split buffer into discrete SSE event blocks delimited by double newlines
      const frames = buffer.split(/\r?\n\r?\n/);
      // The last element is incomplete if buffer didn't end with double newline
      buffer = frames.pop() || '';

      for (const frame of frames) {
        if (!frame.trim()) continue;

        let eventType = 'message';
        const dataLines: string[] = [];

        const lines = frame.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            eventType = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            dataLines.push(trimmed.slice(5).trim());
          }
        }

        const dataString = dataLines.join('\n');
        if (!dataString) continue;

        let parsedData: unknown;
        try {
          parsedData = JSON.parse(dataString);
        } catch {
          parsedData = dataString;
        }

        // Dispatch based on eventType
        switch (eventType) {
          case 'status':
            handlers.onStatus?.(parsedData as SSEStatusPayload);
            break;
          case 'token':
            handlers.onToken?.(parsedData as SSETokenPayload);
            break;
          case 'citations':
            handlers.onCitations?.(parsedData as SSECitationsPayload);
            break;
          case 'gate_rejected':
            handlers.onGateRejected?.(parsedData as SSEGateRejectedPayload);
            break;
          case 'done':
            handlers.onDone?.(parsedData as SSEDonePayload);
            break;
          case 'error':
            handlers.onError?.(parsedData as SSEErrorPayload);
            break;
          default:
            // Generic message or unhandled custom event
            break;
        }
      }
    }

    // Flush any remaining buffer if complete
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      let eventType = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          eventType = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trim());
        }
      }
      const dataString = dataLines.join('\n');
      if (dataString) {
        try {
          const parsed = JSON.parse(dataString);
          if (eventType === 'done') handlers.onDone?.(parsed as SSEDonePayload);
        } catch {
          // ignore flush error
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
