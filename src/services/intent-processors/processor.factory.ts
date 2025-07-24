import { BaseIntentProcessor } from './base.processor';
import { DefaultProcessor } from './default.processor';
import { PriceInquiryProcessor } from './price-inquiry.processor';
import { DesignRequestProcessor } from './design-request.processor';
import { DesignModificationProcessor } from './design-modification.processor';
import { OrderRequestProcessor } from './order-request.processor';
import { PaymentCompleteProcessor } from './payment-complete.processor';
import { PaymentInquiryProcessor } from './payment-inquiry.processor';
import { DeliveryStatusProcessor } from './delivery-status.processor';
import { GreetingProcessor } from './greeting.processor';
import { TeamRegistrationProcessor } from './team-registration.processor';
import { SampleRequestProcessor } from './sample-request.processor';
import { FAQProcessor } from './faq.processor';
import { DeliveryTimeProcessor } from './delivery-time.processor';
import { SportTypeProcessor } from './sport-type.processor';
import { DesignTemplateProcessor } from './design-template.processor';
import { DesignUploadProcessor } from './design-upload.processor';
import logger from '../../utils/logger';

/**
 * 인텐트별 Processor를 생성하는 Factory 클래스
 */
export class IntentProcessorFactory {
  private static processors: Map<string, BaseIntentProcessor> = new Map();
  private static defaultProcessor: BaseIntentProcessor = new DefaultProcessor();

  /**
   * Processor 등록
   */
  static registerProcessor(intentName: string, processor: BaseIntentProcessor): void {
    this.processors.set(intentName, processor);
    logger.info(`Registered processor for intent: ${intentName}`);
  }

  /**
   * 인텐트에 맞는 Processor 반환
   */
  static getProcessor(intentName: string): BaseIntentProcessor {
    const processor = this.processors.get(intentName);

    if (processor) {
      logger.debug(`Using specific processor for intent: ${intentName}`);
      return processor;
    }

    // 특정 Processor가 없으면 기본 Processor 사용
    logger.debug(`Using default processor for intent: ${intentName}`);
    return this.defaultProcessor;
  }

  /**
   * 모든 Processor 초기화
   */
  static initialize(): void {
    // 기존 Processor 등록
    this.registerProcessor('greeting', new GreetingProcessor());
    this.registerProcessor('team.name', new TeamRegistrationProcessor());
    this.registerProcessor('team.registration', new TeamRegistrationProcessor());
    this.registerProcessor('price.inquiry', new PriceInquiryProcessor());
    this.registerProcessor('design.request', new DesignRequestProcessor());
    this.registerProcessor('design.modification', new DesignModificationProcessor());
    this.registerProcessor('order.new', new OrderRequestProcessor());
    this.registerProcessor('order.additional', new OrderRequestProcessor());
    this.registerProcessor('order.request', new OrderRequestProcessor());
    this.registerProcessor('payment.complete', new PaymentCompleteProcessor());
    this.registerProcessor('delivery.status', new DeliveryStatusProcessor());
    this.registerProcessor('delivery.tracking', new DeliveryStatusProcessor());

    // 샘플 요청 관련 인텐트 등록
    this.registerProcessor('sample.request', new SampleRequestProcessor());
    this.registerProcessor('sample.inquiry', new SampleRequestProcessor());

    // FAQ 관련 인텐트 등록
    const faqProcessor = new FAQProcessor();
    this.registerProcessor('faq.general', faqProcessor);
    this.registerProcessor('contact.info', faqProcessor);
    this.registerProcessor('business.hours', faqProcessor);
    this.registerProcessor('material.info', faqProcessor);
    this.registerProcessor('size.guide', faqProcessor);
    this.registerProcessor('shipping.policy', faqProcessor);
    this.registerProcessor('refund.policy', faqProcessor);

    // 새로 추가된 프로세서 등록
    this.registerProcessor('delivery.time', new DeliveryTimeProcessor());
    this.registerProcessor('sport.type', new SportTypeProcessor());
    this.registerProcessor('design.template', new DesignTemplateProcessor());
    this.registerProcessor('design.upload', new DesignUploadProcessor());

    // 결제 관련 인텐트 일괄 등록
    const paymentProcessor = new PaymentInquiryProcessor();
    const paymentIntents = [
      '결제_50_100_차이_문의_변형',
      '결제_50_100_차이_문의',
      '결제_50_희망_문의_변형',
      '결제_50_희망_문의',
      '결제_UI_에러_CS_문의',
      '결제_견적서_CS_문의',
      '결제_계좌송금_수수료_문의_변형',
      '결제_계좌송금_수수료_문의',
      '결제_기한_연기_CS_문의',
      '결제_대금상환_문의_변형',
      '결제_대금상환_문의',
      '결제_명의_다른_문의2_변형',
      '결제_명의_다른_문의_변형',
      '결제_명의_다른_문의',
      '결제_방식곤란_문의_변형',
      '결제_방식곤란_문의',
      '결제_법인계좌_송금_문의_변형',
      '결제_법인계좌_송금_문의',
      '결제_소득인지_영수증_문의_변형',
      '결제_소득인지_영수증_문의',
      '결제_송금처_문의_변형',
      '결제_송금처_문의',
      '결제_실패_CS_문의',
      '결제_영수증_발급_CS_문의',
      '결제_영수증_발급타이밍_문의_변형',
      '결제_영수증_발급타이밍_문의',
      '결제_영수증_분리_문의_변형',
      '결제_영수증_분리_문의',
      '결제_영수증_용도변경_문의_변형',
      '결제_영수증_용도변경_문의',
      '결제_영수증_재발급_CS_문의',
      '결제_영수증_종이봉투_문의_변형',
      '결제_영수증_종이봉투_문의'
    ];

    paymentIntents.forEach(intent => {
      this.registerProcessor(intent, paymentProcessor);
    });

    logger.info(`Initialized ${this.processors.size} intent processors`);
  }

  /**
   * 등록된 모든 인텐트 목록 반환
   */
  static getRegisteredIntents(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Processor 존재 여부 확인
   */
  static hasProcessor(intentName: string): boolean {
    return this.processors.has(intentName);
  }
}

// Factory 초기화
IntentProcessorFactory.initialize();