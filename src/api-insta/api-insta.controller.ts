import { Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiInstaService } from './api-insta.service';

@Controller('api-insta')
export class ApiInstaController {
  constructor(private readonly apiInstaService: ApiInstaService) {}

  /**
   * NOVO PASSO 1: Solicitar permissão de upload.
   * O Front-end envia os metadados e recebe as URLs do R2.
   * Não há recepção de arquivo aqui, logo, sem estouro de RAM.
   */
  @Post('request-upload')
  async requestUpload(
    @Body() body: { postData: any; fileInfo: { fileName: string; mimetype: string } }
  ) {
    return this.apiInstaService.prepareUpload(body.postData, body.fileInfo);
  }

  /**
   * NOVO PASSO 2: Finalizar o post.
   * Chamado pelo Front-end logo após o vídeo de 100MB chegar no R2.
   */
  @Post('finalize')
  async finalize(@Body() body: { postId: string; mediaUrl: string }) {
    return this.apiInstaService.finalizePostAfterUpload(body.postId, body.mediaUrl);
  }
}