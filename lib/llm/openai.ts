// OpenAI 이미지 API 호출. 상세이미지 생성에만 쓴다. 서버에서만 쓴다. 모델 ID는 이 파일에만 적는다.
import { LlmError } from './gemini';

export const OPENAI_IMAGE_MODEL = 'gpt-image-2.5-flare';

export type GenerateImage = (prompt: string) => Promise<Uint8Array>;

export const generateImage: GenerateImage = async (prompt) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new LlmError('OPENAI_API_KEY가 설정되지 않았어요.');

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: '1024x1536', quality: 'medium', n: 1 }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch {
    throw new LlmError('OpenAI 이미지 API에 연결하지 못했어요.');
  }
  if (!res.ok) throw new LlmError(`OpenAI 이미지 API가 오류를 돌려줬어요. (${res.status})`);

  try {
    const data = await res.json();
    return new Uint8Array(Buffer.from(data.data[0].b64_json as string, 'base64'));
  } catch {
    throw new LlmError('OpenAI 이미지 응답을 해석하지 못했어요.');
  }
};
