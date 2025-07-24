// 배송 관련 타입 정의

export interface ActiveDeliveryInfo {
  orderNumber: string;
  productName: string;
  isExpress: boolean;
  estimatedDate: Date | null;
  trackingNumber: string | null;
  isDelayed: boolean;
  delayDays: number;
}