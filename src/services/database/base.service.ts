import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';

/**
 * 페이지네이션 옵션 인터페이스
 * @interface PaginationOptions
 * @property {number} [page] - 현재 페이지 번호
 * @property {number} [limit] - 페이지당 항목 수
 * @property {any} [orderBy] - 정렬 기준
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * 페이지네이션된 결과 인터페이스
 * @interface PaginatedResult
 * @property {T[]} data - 조회된 데이터 배열
 * @property {number} total - 전체 항목 수
 * @property {number} page - 현재 페이지 번호
 * @property {number} limit - 페이지당 항목 수
 * @property {number} totalPages - 전체 페이지 수
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 데이터베이스 서비스를 위한 기본 추상 클래스
 * 모든 데이터베이스 서비스는 이 클래스를 상속받아 구현됩니다.
 * @abstract
 * @template TModel - 모델 타입
 * @template TCreateInput - 생성 입력 타입
 * @template TUpdateInput - 업데이트 입력 타입
 * @template TWhereInput - 조회 조건 타입
 * @template TWhereUniqueInput - 고유 조회 조건 타입
 * @template TOrderByInput - 정렬 조건 타입
 */
export abstract class BaseService<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TWhereUniqueInput,
  TOrderByInput // eslint-disable-line @typescript-eslint/no-unused-vars
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract model: any;
  protected abstract modelName: string;

  /**
   * 새로운 레코드를 생성합니다.
   * @param {TCreateInput} data - 생성할 데이터
   * @returns {Promise<TModel>} 생성된 레코드
   * @throws {Error} 생성 실패 시 에러 발생
   */
  async create(data: TCreateInput): Promise<TModel> {
    try {
      const result = await this.model.create({
        data
      });
      logger.info(`${this.modelName} created successfully`, { id: result.id });
      return result;
    } catch (error) {
      logger.error(`Failed to create ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 여러 레코드를 한 번에 생성합니다.
   * 중복된 레코드는 자동으로 건너뜁니다.
   * @param {TCreateInput[]} data - 생성할 데이터 배열
   * @returns {Promise<Prisma.BatchPayload>} 배치 작업 결과
   * @throws {Error} 생성 실패 시 에러 발생
   */
  async createMany(data: TCreateInput[]): Promise<Prisma.BatchPayload> {
    try {
      const result = await this.model.createMany({
        data,
        skipDuplicates: true
      });
      logger.info(`${this.modelName}s created successfully`, { count: result.count });
      return result;
    } catch (error) {
      logger.error(`Failed to create multiple ${this.modelName}s`, error);
      throw error;
    }
  }

  /**
   * 고유 조건으로 단일 레코드를 조회합니다.
   * @param {TWhereUniqueInput} where - 고유 조회 조건
   * @returns {Promise<TModel | null>} 조회된 레코드 또는 null
   * @throws {Error} 조회 실패 시 에러 발생
   */
  async findUnique(where: TWhereUniqueInput): Promise<TModel | null> {
    try {
      const result = await this.model.findUnique({
        where
      });
      return result;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 첫 번째 레코드를 조회합니다.
   * @param {TWhereInput} [where] - 조회 조건
   * @returns {Promise<TModel | null>} 조회된 레코드 또는 null
   * @throws {Error} 조회 실패 시 에러 발생
   */
  async findFirst(where?: TWhereInput): Promise<TModel | null> {
    try {
      const result = await this.model.findFirst({
        where
      });
      return result;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 여러 레코드를 조회합니다.
   * 페이지네이션을 지원합니다.
   * @param {TWhereInput} [where] - 조회 조건
   * @param {PaginationOptions} [options] - 페이지네이션 옵션
   * @returns {Promise<TModel[]>} 조회된 레코드 배열
   * @throws {Error} 조회 실패 시 에러 발생
   */
  async findMany(
    where?: TWhereInput,
    options?: PaginationOptions
  ): Promise<TModel[]> {
    try {
      const { page = 1, limit = 10, orderBy } = options || {};
      const skip = (page - 1) * limit;

      const result = await this.model.findMany({
        where,
        skip,
        take: limit,
        orderBy
      });
      return result;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}s`, error);
      throw error;
    }
  }

  /**
   * 페이지네이션 정보와 함께 여러 레코드를 조회합니다.
   * 전체 개수, 페이지 정보 등을 포함한 결과를 반환합니다.
   * @param {TWhereInput} [where] - 조회 조건
   * @param {PaginationOptions} [options] - 페이지네이션 옵션
   * @returns {Promise<PaginatedResult<TModel>>} 페이지네이션된 결과
   * @throws {Error} 조회 실패 시 에러 발생
   */
  async findManyWithPagination(
    where?: TWhereInput,
    options?: PaginationOptions
  ): Promise<PaginatedResult<TModel>> {
    try {
      const { page = 1, limit = 10, orderBy } = options || {};
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.model.findMany({
          where,
          skip,
          take: limit,
          orderBy
        }),
        this.model.count({ where })
      ]);

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}s with pagination`, error);
      throw error;
    }
  }

  /**
   * 단일 레코드를 업데이트합니다.
   * @param {TWhereUniqueInput} where - 고유 조회 조건
   * @param {TUpdateInput} data - 업데이트할 데이터
   * @returns {Promise<TModel>} 업데이트된 레코드
   * @throws {Error} 업데이트 실패 시 에러 발생
   */
  async update(
    where: TWhereUniqueInput,
    data: TUpdateInput
  ): Promise<TModel> {
    try {
      const result = await this.model.update({
        where,
        data
      });
      logger.info(`${this.modelName} updated successfully`, { where });
      return result;
    } catch (error) {
      logger.error(`Failed to update ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 여러 레코드를 한 번에 업데이트합니다.
   * @param {TWhereInput} where - 조회 조건
   * @param {TUpdateInput} data - 업데이트할 데이터
   * @returns {Promise<Prisma.BatchPayload>} 배치 작업 결과
   * @throws {Error} 업데이트 실패 시 에러 발생
   */
  async updateMany(
    where: TWhereInput,
    data: TUpdateInput
  ): Promise<Prisma.BatchPayload> {
    try {
      const result = await this.model.updateMany({
        where,
        data
      });
      logger.info(`${this.modelName}s updated successfully`, { count: result.count });
      return result;
    } catch (error) {
      logger.error(`Failed to update multiple ${this.modelName}s`, error);
      throw error;
    }
  }

  /**
   * 단일 레코드를 삭제합니다.
   * @param {TWhereUniqueInput} where - 고유 조회 조건
   * @returns {Promise<TModel>} 삭제된 레코드
   * @throws {Error} 삭제 실패 시 에러 발생
   */
  async delete(where: TWhereUniqueInput): Promise<TModel> {
    try {
      const result = await this.model.delete({
        where
      });
      logger.info(`${this.modelName} deleted successfully`, { where });
      return result;
    } catch (error) {
      logger.error(`Failed to delete ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 여러 레코드를 한 번에 삭제합니다.
   * @param {TWhereInput} [where] - 조회 조건
   * @returns {Promise<Prisma.BatchPayload>} 배치 작업 결과
   * @throws {Error} 삭제 실패 시 에러 발생
   */
  async deleteMany(where?: TWhereInput): Promise<Prisma.BatchPayload> {
    try {
      const result = await this.model.deleteMany({
        where
      });
      logger.info(`${this.modelName}s deleted successfully`, { count: result.count });
      return result;
    } catch (error) {
      logger.error(`Failed to delete multiple ${this.modelName}s`, error);
      throw error;
    }
  }

  /**
   * 소프트 삭제를 수행합니다.
   * 실제로 레코드를 삭제하지 않고 deletedAt 필드를 현재 시간으로 설정합니다.
   * @param {TWhereUniqueInput} where - 고유 조회 조건
   * @returns {Promise<TModel>} 소프트 삭제된 레코드
   * @throws {Error} 소프트 삭제 실패 시 에러 발생
   */
  async softDelete(where: TWhereUniqueInput): Promise<TModel> {
    try {
      const result = await this.model.update({
        where,
        data: {
          deletedAt: new Date()
        }
      });
      logger.info(`${this.modelName} soft deleted successfully`, { where });
      return result;
    } catch (error) {
      logger.error(`Failed to soft delete ${this.modelName}`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 레코드의 개수를 계산합니다.
   * @param {TWhereInput} [where] - 조회 조건
   * @returns {Promise<number>} 레코드 개수
   * @throws {Error} 개수 계산 실패 시 에러 발생
   */
  async count(where?: TWhereInput): Promise<number> {
    try {
      const result = await this.model.count({
        where
      });
      return result;
    } catch (error) {
      logger.error(`Failed to count ${this.modelName}s`, error);
      throw error;
    }
  }

  /**
   * 조건에 맞는 레코드가 존재하는지 확인합니다.
   * @param {TWhereInput} where - 조회 조건
   * @returns {Promise<boolean>} 존재 여부
   * @throws {Error} 확인 실패 시 에러 발생
   */
  async exists(where: TWhereInput): Promise<boolean> {
    try {
      const count = await this.count(where);
      return count > 0;
    } catch (error) {
      logger.error(`Failed to check if ${this.modelName} exists`, error);
      throw error;
    }
  }
}