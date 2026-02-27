import { Test, TestingModule } from '@nestjs/testing';
import { ApiInstaController } from './api-insta.controller';
import { ApiInstaService } from './api-insta.service';

describe('ApiInstaController', () => {
  let controller: ApiInstaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiInstaController],
      providers: [ApiInstaService],
    }).compile();

    controller = module.get<ApiInstaController>(ApiInstaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
