import { LLMService } from '../llm';

describe('LLM 품질 E2E 테스트', () => {
  const llm = new LLMService();

  it('유니폼 가격 문의에 자연스러운 답변', async () => {
    const response = await llm.generateResponse('유니폼 가격이 얼마야?');
    expect(response.success).toBe(true);
    expect(response.content).toBeDefined();
    expect(response.content || '').toMatch(/유니폼|가격|엔|원/);
    expect((response.content || '').length).toBeGreaterThan(10);
  });

  it('야구 유니폼 디자인 추천', async () => {
    const response = await llm.generateResponse('야구 유니폼 디자인 추천해줘');
    expect(response.success).toBe(true);
    expect(response.content).toBeDefined();
    expect(response.content || '').toMatch(/추천|디자인|야구/);
    expect((response.content || '').length).toBeGreaterThan(10);
  });
}); 