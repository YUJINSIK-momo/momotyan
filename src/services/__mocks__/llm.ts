export class LLMService {
  generateResponse = jest.fn().mockResolvedValue({
    success: true,
    content: 'Default mocked response'
  });

  generateMessageWithContext = jest.fn().mockResolvedValue({
    success: true,
    content: 'Default mocked response'
  });
}