import { Customer, CustomerType, FriendAddStatus, ChatStatus } from '../generated/prisma';

export const createMockCustomer = (overrides?: Partial<Customer>): Customer => {
  const now = new Date();
  return {
    id: '1',
    lineUserId: 'U123456789',
    lineUserName: null,
    teamName: null,
    sportType: null,
    friendAddDate: null,
    firstChatDate: null,
    customerType: CustomerType.NEW,
    lastMessageDate: null,
    friendAddStatus: FriendAddStatus.FRIEND,
    chatStatus: ChatStatus.CHATTING,
    blockDate: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    brand: null,
    agentAssigned: null,
    notes: null,
    ...overrides
  };
};