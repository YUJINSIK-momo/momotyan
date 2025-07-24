// 결제 관련 타입 정의

export interface ProductDetails {
  name?: string;
  category?: string;
  quantity?: number;
  price?: number;
  description?: string;
  [key: string]: unknown; // 추가 필드 허용
}