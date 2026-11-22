// 서버 API가 진행 이벤트를 한 줄에 하나씩(NDJSON) 흘려보내는 응답.
import type { Emit } from './pipeline';

export class PipelineError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// run이 끝나면 마지막 줄로 결과를 보낸다. 흘려보내기 시작한 뒤의 실패는 HTTP 상태가 아니라 마지막 줄의 status에 담긴다.
export function streamPipeline(run: (emit: Emit) => Promise<{ status: number } & Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      try {
        send({ type: 'end', ok: true, ...(await run(send)) });
      } catch (e) {
        if (e instanceof PipelineError) {
          send({ type: 'end', ok: false, status: e.status, error: e.code, message: e.message });
        } else {
          console.error(e);
          send({ type: 'end', ok: false, status: 500, error: 'server_error', message: '처리하는 중에 문제가 생겼어요.' });
        }
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
