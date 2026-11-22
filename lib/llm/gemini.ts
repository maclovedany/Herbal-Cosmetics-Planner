// Gemini API 호출. 서버에서만 쓴다. 모델 ID는 이 파일에만 적는다.
export const GEMINI_MODEL = 'gemini-3.8-flash';

export class LlmError extends Error {}

export type GenerateJson = (prompt: string, schema: object) => Promise<unknown>;

export const generateJson: GenerateJson = async (prompt, schema) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError('GEMINI_API_KEY가 설정되지 않았어요.');

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(50_000),
      },
    );
  } catch {
    throw new LlmError('Gemini에 연결하지 못했어요.');
  }
  if (!res.ok) throw new LlmError(`Gemini가 오류를 돌려줬어요. (${res.status})`);

  try {
    const data = await res.json();
    const text = (data.candidates[0].content.parts as { text?: string }[]).map((p) => p.text ?? '').join('');
    return JSON.parse(text);
  } catch {
    throw new LlmError('Gemini 응답을 해석하지 못했어요.');
  }
};
