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

  /**
   * NOVA ABORDAGEM: O vídeo já está no R2.
   * Apenas vinculamos a URL ao post no Supabase.
   */
  private async handleVideoUpload(job: Job<any>) {
    // Agora recebemos mediaUrl (string) em vez de fileBuffer (100MB)
    const { postId, mediaUrl, caption } = job.data; 

    try {
      console.log(`[Worker] Finalizando post ${postId} com a URL: ${mediaUrl}`);

      // 1. Atualiza o Supabase com a URL definitiva que já existe no R2
      await this.supabase.finalizePost(postId, mediaUrl);

      // 2. Opcional: Descomente aqui quando quiser voltar a postar no Insta automaticamente
      /* await this.uploadQueue.add('instagram-publish', {
        postId,
        videoUrl: mediaUrl,
        caption: caption || 'Confira as novidades no Blog do Santana!'
      });
      */

      return { success: true, url: mediaUrl };
    } catch (error) {
      console.error(`[Worker] Erro ao finalizar post ${postId}:`, error.message);
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