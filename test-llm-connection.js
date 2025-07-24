require('dotenv').config();
const { LLMService } = require('./src/services/llm');

async function main() {
  const llm = new LLMService();
  const prompt = '銀行振り込み先を教えてください';
  try {
    const response = await llm.generateResponse(prompt);
    if (response.success) {
      console.log('✅ LLM 응답 성공!');
      console.log('답변:', response.content);
    } else {
      console.log('❌ LLM 응답 실패:', response.error);
    }
  } catch (error) {
    console.error('❌ LLM 호출 에러:', error);
  }
}

main(); 