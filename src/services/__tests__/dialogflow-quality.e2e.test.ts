import { detectIntent } from '../dialogflow';

describe('Dialogflow 품질 E2E 테스트', () => {
  it('유니폼 가격 문의 → price.inquiry 인텐트', async () => {
    const result = await detectIntent('유니폼 가격이 얼마야?');
    expect(result).not.toBeNull();
    expect(result?.intentName).toBe('price.inquiry');
    expect(result?.confidence).toBeGreaterThan(0.7);
    expect(result?.fulfillmentText || '').toContain('유니폼');
  });

  it('팀 등록 문의 → team-registration 인텐트', async () => {
    const result = await detectIntent('야구팀 등록해줘');
    expect(result).not.toBeNull();
    expect(result?.intentName).toBe('team-registration');
    expect(result?.confidence).toBeGreaterThan(0.7);
  });

  it('알 수 없는 질문 → fallback 인텐트', async () => {
    const result = await detectIntent('이상한 질문입니다 12345');
    expect(result).not.toBeNull();
    expect(result?.intentName.toLowerCase()).toContain('fallback');
  });

  it('수입인지 포함 영수증 발행 문의 → 관련 인텐트', async () => {
    const result = await detectIntent('収入印紙付きの領収書発行');
    expect(result).not.toBeNull();
    // 실제 인텐트명이 무엇인지 모를 경우, intentName이 null이 아니고 confidence가 0.7 이상인지 확인
    expect(result?.intentName).toBeDefined();
    expect(result?.confidence).toBeGreaterThan(0.7);
    // fulfillmentText에 영수증, 수입인지 등 관련 키워드가 포함되는지 확인 (일본어/한국어 모두 허용)
    expect((result?.fulfillmentText || '')).toMatch(/領収書|영수증|収入印紙|수입인지/);
  });
}); 