/*import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { StorageR2Service } from '../common/storage_r2/storage_r2.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Processor('upload-queue')
export class ApiInstaProcessor extends WorkerHost {
  constructor(
    // Aqui a POO brilha: injetamos os "operários" que já configuramos
    private readonly storageR2: StorageR2Service,
    private readonly supabase: SupabaseService,
  ) {
    super();
  }
  async process(job: Job<any>): Promise<any> {
    const { postId, fileBuffer, fileName, mimetype } = job.data;

    console.log(`[Worker] Processando mídia para o post: ${postId}`);

    try {
      // 1. Executa o upload pesado (etapa que leva 15-20s)
      // O job.data.fileBuffer vem do Redis como um objeto, convertemos para Buffer
      const mediaUrl = await this.storageR2.uploadFile(
        Buffer.from(fileBuffer), 
        fileName, 
        mimetype
      );

      // 2. Executa a 2ª Etapa do Supabase: O UPDATE (Finalização)
      // Agora o post ganha a URL e o is_published vira true
      await this.supabase.finalizePost(postId, mediaUrl);

      console.log(`[Worker] Post ${postId} publicado com sucesso no blog!`);
      
      return { success: true, url: mediaUrl };
    } catch (error) {
      console.error(`[Worker] Erro ao processar post ${postId}:`, error.message);
      // O BullMQ vai capturar esse erro e tentar novamente (retry) se configuramos isso
      throw error; 
    }
  }
}*/

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { StorageR2Service } from '../common/storage_r2/storage_r2.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import axios from 'axios';

@Processor('upload-queue')
export class ApiInstaProcessor extends WorkerHost {
  constructor(
    private readonly storageR2: StorageR2Service,
    private readonly supabase: SupabaseService,
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    switch (job.name) {
      case 'process-video':
        return await this.handleVideoUpload(job);
      case 'instagram-publish':
        return await this.handleInstagramPublish(job);
      default:
        return;
    }
  }

  private async handleVideoUpload(job: Job<any>) {
    const { postId, fileBuffer, fileName, mimetype, caption } = job.data;

    try {
      // 1. Upload para o R2
      const mediaUrl = await this.storageR2.uploadFile(
        Buffer.from(fileBuffer),
        fileName,
        mimetype
      );

      // 2. Atualiza o Supabase
      await this.supabase.finalizePost(postId, mediaUrl);

      // 3. ENCAMINHAMENTO CORRIGIDO: Usamos a fila injetada no constructor
      await this.uploadQueue.add('instagram-publish', {
        postId,
        videoUrl: mediaUrl,
        caption: caption || 'Confira as novidades no Blog do Santana!'
      });

      return { success: true, url: mediaUrl };
    } catch (error) {
      throw error;
    }
  }

  private async handleInstagramPublish(job: Job<any>) {
    const { postId, videoUrl, caption } = job.data;
    const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    try {
      // Passo 1: Criar o Container de Vídeo (Reels)
      const containerResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${igBusinessId}/media`,
        {
          video_url: videoUrl,
          caption: caption,
          media_type: 'REELS',
          access_token: accessToken,
        }
      );

      const creationId = containerResponse.data.id;

      // Passo 2: Aguardar o processamento do vídeo no Meta (30s de segurança)
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Passo 3: Publicar de fato
      const publishResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${igBusinessId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken,
        }
      );

      return { success: true, igId: publishResponse.data.id };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Instagram Fail: ${errorMsg}`);
    }
  }
}