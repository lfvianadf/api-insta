import { Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiInstaService } from './api-insta.service';

@Controller('api-insta')
export class ApiInstaController {
  constructor(private readonly apiInstaService: ApiInstaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('video', {
    limits: { fileSize: 100 * 1024 * 1024 } // 🛡️ Segurança: Limite de 100MB
  }))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() postData: any // Aqui vem title, slug, content, category, etc.
  ) {
    // Chamamos o service passando o arquivo e os metadados do banco
    return this.apiInstaService.handleNewPost(file, postData);
  }
}