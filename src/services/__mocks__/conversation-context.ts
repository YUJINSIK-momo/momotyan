export const conversationContextService = {
  getRecentMessages: jest.fn().mockResolvedValue([]),
  addMessage: jest.fn().mockResolvedValue(undefined),
  getOrCreateContext: jest.fn().mockReturnValue({
    conversationId: 'test-conversation',
    messages: []
  }),
  cleanupExpiredContexts: jest.fn(),
  destroy: jest.fn()
};