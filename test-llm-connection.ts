import 'dotenv/config';
import { LLMService } from './src/services/llm';

async function main() {
  const llm = new LLMService();
  const intentName = 'receipt.split';
  const parameters = {};
  const userQuery = '領収書を分けてほしい';
  const dialogflowResponse = '不可\n注文分まとめて発行';

  const prompt = `
以下のポリシー・例文を必ずそのまま使い、口調（トーン）だけをより丁寧で自然な日本語に変えてください。
質問への回答は、必ず下記のポリシー文のみを変形して行ってください。
内容の追加、削除、再構成、肯定的な案内、一般的な説明、謝罪などは絶対にしないでください。
ポリシー文（例：不可、注文分まとめて発行）は必ず含めてください。

[ポリシー・例文]
${dialogflowResponse}

[ユーザーの質問]
${userQuery}
`;

  try {
    const response = await llm.generateResponse(prompt);
    if (response.success) {
      console.log('✅ LLM応答成功!');
      console.log('回答:', response.content);
    } else {
      console.log('❌ LLM応答失敗:', response.error);
    }
  } catch (error) {
    console.error('❌ LLM呼び出しエラー:', error);
  }
}

main(); 