import { IntentProcessorFactory } from '../processor.factory';
import { PriceInquiryProcessor } from '../price-inquiry.processor';
import { DefaultProcessor } from '../default.processor';
import { BaseIntentProcessor, ProcessorContext } from '../base.processor';

// Mock logger
jest.mock('../../../utils/logger');

// Custom test processor
class TestCustomProcessor extends BaseIntentProcessor {
  async process(_context: ProcessorContext) {
    return {
      success: true,
      message: 'Custom processor response',
      metadata: {
        source: 'static' as const,
        processingTime: 0
      }
    };
  }

  protected async gatherContext(_context: ProcessorContext) {
    return {};
  }

  protected buildPrompt(_context: ProcessorContext, _gatheredData: Record<string, unknown>) {
    return 'Test prompt';
  }
}

describe('IntentProcessorFactory', () => {
  beforeEach(() => {
    // Reset the factory state before each test
    // @ts-expect-error - accessing private property for testing
    IntentProcessorFactory.processors.clear();
    // @ts-expect-error - accessing private property for testing
    IntentProcessorFactory.defaultProcessor = new DefaultProcessor();
    // Re-initialize to register processors
    IntentProcessorFactory.initialize();
  });

  describe('getProcessor', () => {
    it('should return PriceInquiryProcessor for price.inquiry intent', () => {
      const processor = IntentProcessorFactory.getProcessor('price.inquiry');
      expect(processor).toBeInstanceOf(PriceInquiryProcessor);
    });

    it('should return the same instance for repeated calls', () => {
      const processor1 = IntentProcessorFactory.getProcessor('price.inquiry');
      const processor2 = IntentProcessorFactory.getProcessor('price.inquiry');

      expect(processor1).toBe(processor2);
    });

    it('should return DefaultProcessor for unknown intents', () => {
      const unknownIntents = [
        'unknown.intent',
        'sample.request',
        'team.inquiry',
        'random.action',
        'claim.general'
      ];

      unknownIntents.forEach(intent => {
        const processor = IntentProcessorFactory.getProcessor(intent);
        expect(processor).toBeInstanceOf(DefaultProcessor);
      });
    });

    it('should handle case sensitivity (currently case-sensitive)', () => {
      const processor1 = IntentProcessorFactory.getProcessor('PRICE.INQUIRY');
      const processor2 = IntentProcessorFactory.getProcessor('Price.Inquiry');
      const processor3 = IntentProcessorFactory.getProcessor('price.inquiry');

      // Currently the factory is case-sensitive, so only exact match works
      expect(processor1).toBeInstanceOf(DefaultProcessor);
      expect(processor2).toBeInstanceOf(DefaultProcessor);
      expect(processor3).toBeInstanceOf(PriceInquiryProcessor);
    });

    it('should handle intent names with extra spaces (currently does not trim)', () => {
      const processor = IntentProcessorFactory.getProcessor('  price.inquiry  ');
      // Currently the factory doesn't trim spaces
      expect(processor).toBeInstanceOf(DefaultProcessor);
    });
  });

  describe('registerProcessor', () => {
    it('should register custom processor', () => {
      const customProcessor = new TestCustomProcessor();
      IntentProcessorFactory.registerProcessor('custom.intent', customProcessor);

      const retrieved = IntentProcessorFactory.getProcessor('custom.intent');
      expect(retrieved).toBe(customProcessor);
    });

    it('should override existing processor', () => {
      const customProcessor1 = new TestCustomProcessor();
      const customProcessor2 = new TestCustomProcessor();

      IntentProcessorFactory.registerProcessor('custom.intent', customProcessor1);
      IntentProcessorFactory.registerProcessor('custom.intent', customProcessor2);

      const retrieved = IntentProcessorFactory.getProcessor('custom.intent');
      expect(retrieved).toBe(customProcessor2);
      expect(retrieved).not.toBe(customProcessor1);
    });

    it('should register processor as provided (case-sensitive)', () => {
      const customProcessor = new TestCustomProcessor();
      IntentProcessorFactory.registerProcessor('CUSTOM.INTENT', customProcessor);

      const retrieved1 = IntentProcessorFactory.getProcessor('custom.intent');
      const retrieved2 = IntentProcessorFactory.getProcessor('CUSTOM.INTENT');

      // Currently case-sensitive
      expect(retrieved1).toBeInstanceOf(DefaultProcessor);
      expect(retrieved2).toBe(customProcessor);
    });
  });

  // Remove getAllProcessors tests as this method doesn't exist in the factory

  describe('Edge cases', () => {
    it('should handle empty intent name', () => {
      const processor = IntentProcessorFactory.getProcessor('');
      expect(processor).toBeInstanceOf(DefaultProcessor);
    });

    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error - testing null/undefined handling
      const processor1 = IntentProcessorFactory.getProcessor(null);
      // @ts-expect-error - testing null/undefined handling
      const processor2 = IntentProcessorFactory.getProcessor(undefined);

      expect(processor1).toBeInstanceOf(DefaultProcessor);
      expect(processor2).toBeInstanceOf(DefaultProcessor);
    });

    it('should maintain singleton pattern for processors', () => {
      // Get price processor multiple times
      const procs = [];
      for (let i = 0; i < 5; i++) {
        procs.push(IntentProcessorFactory.getProcessor('price.inquiry'));
      }

      // All should be the same instance
      for (let i = 1; i < procs.length; i++) {
        expect(procs[i]).toBe(procs[0]);
      }
    });
  });

  describe('Initialization', () => {
    it('should initialize with price processors', () => {
      // Create a new factory instance to test initialization
      // @ts-expect-error - accessing private property for testing
      const factoryProcessors = IntentProcessorFactory.processors;

      // Check that price.inquiry processor is initialized
      expect(factoryProcessors.has('price.inquiry')).toBe(true);
      // Other price variants are not registered in current implementation
      expect(factoryProcessors.has('price.baseball')).toBe(false);
      expect(factoryProcessors.has('price.soccer')).toBe(false);
      expect(factoryProcessors.has('price.basketball')).toBe(false);
    });

    it('should have a default processor', () => {
      // @ts-expect-error - accessing private property for testing
      const defaultProcessor = IntentProcessorFactory.defaultProcessor;
      expect(defaultProcessor).toBeInstanceOf(DefaultProcessor);
    });
  });
});