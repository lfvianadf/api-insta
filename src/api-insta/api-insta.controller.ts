import { Controller, Post, Body } from '@nestjs/common';
import { ApiInstaService } from './api-insta.service';

@Controller('api-insta')
export class ApiInstaController {
  constructor(private readonly apiInstaService: ApiInstaService) {}

  @Post('request-upload')
  async requestUpload(
    @Body() body: { postData: any; fileInfo: { fileName: string; mimetype: string } }
  ) {
    return this.apiInstaService.prepareUpload(body.postData, body.fileInfo);
  }

  @Post('finalize')
  async finalize(
    @Body() body: { postId: string; mediaUrl: string; caption?: string } // ✅ recebe caption
  ) {
    return this.apiInstaService.finalizePostAfterUpload(body.postId, body.mediaUrl, body.caption);
  }
}