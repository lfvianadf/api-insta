import { Test, TestingModule } from '@nestjs/testing';
import { ApiInstaService } from './api-insta.service';

describe('ApiInstaService', () => {
  let service: ApiInstaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiInstaService],
    }).compile();

    service = module.get<ApiInstaService>(ApiInstaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
