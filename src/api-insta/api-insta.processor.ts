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
        return await this.handleMediaUpload(job);
      case 'instagram-publish':
        return await this.handleInstagramPublish(job);
      default:
        return;
    }
  }

  /**
   * A mídia já está no R2.
   * Apenas vinculamos a URL ao post no Supabase.
   */
  private async handleMediaUpload(job: Job<any>) {
    const { postId, mediaUrl, caption, mimetype } = job.data; // ✅ recebe mimetype

    try {
      console.log(`[Worker] Finalizando post ${postId} com a URL: ${mediaUrl}`);

      // 1. Atualiza o Supabase com a URL definitiva que já existe no R2
      await this.supabase.finalizePost(postId, mediaUrl);

      // 2. Publica no Instagram automaticamente
      await this.uploadQueue.add('instagram-publish', {
        postId,
        mediaUrl,
        caption: caption || 'Essa matéria está disponível no Blog do Santana! Acompanhe em blogdosantana.com.br',
        mimetype, // ✅ passa mimetype adiante
      });

      return { success: true, url: mediaUrl };
    } catch (error) {
      console.error(`[Worker] Erro ao finalizar post ${postId}:`, error.message);
      throw error;
    }
  }

  private async handleInstagramPublish(job: Job<any>) {
    const { postId, mediaUrl, caption, mimetype } = job.data; // ✅ recebe mimetype

    const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igBusinessId || !accessToken) {
      throw new Error(
        'Variáveis INSTAGRAM_BUSINESS_ID ou INSTAGRAM_ACCESS_TOKEN não configuradas',
      );
    }

    const isVideo = mimetype?.startsWith('video'); // ✅ detecta o tipo

    try {
      // Passo 1: Criar o Container de mídia
      const containerResponse = await axios.post(
        `https://graph.instagram.com/v21.0/${igBusinessId}/media`,
        {
          [isVideo ? 'video_url' : 'image_url']: mediaUrl, // ✅ campo correto por tipo
          caption,
          media_type: isVideo ? 'REELS' : 'IMAGE',         // ✅ tipo correto
          access_token: accessToken,
        },
      );

      const creationId = containerResponse.data.id;

      // Passo 2: Aguardar processamento (apenas para vídeos)
      if (isVideo) await this.waitForVideoReady(creationId, accessToken); // ✅ imagens pulam essa etapa

      // Passo 3: Publicar
      const publishResponse = await axios.post(
        `https://graph.instagram.com/v21.0/${igBusinessId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken,
        },
      );

      const igId = publishResponse.data.id;

      await this.supabase.updatePostIgStatus(postId, 'published', igId);

      return { success: true, igId };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;

      await this.supabase.updatePostIgStatus(postId, 'failed', null);

      throw new Error(`Instagram Fail: ${errorMsg}`);
    }
  }

  /**
   * Verifica o status do container de mídia no Instagram até estar pronto.
   * Máximo de ~5 minutos (20 tentativas x 15s).
   */
  private async waitForVideoReady(
    creationId: string,
    accessToken: string,
  ): Promise<void> {
    const maxAttempts = 20;
    const intervalMs = 15000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const statusResponse = await axios.get(
        `https://graph.instagram.com/v21.0/${creationId}`,
        {
          params: {
            fields: 'status_code,status',
            access_token: accessToken,
          },
        },
      );

      const { status_code } = statusResponse.data;

      if (status_code === 'FINISHED') return;
      if (status_code === 'ERROR')
        throw new Error('Meta falhou ao processar o vídeo');
      if (status_code === 'EXPIRED')
        throw new Error('Container expirou — recrie o upload');

      console.log(
        `[Worker] Tentativa ${attempt}/${maxAttempts} — status: ${status_code}`,
      );
    }

    throw new Error('Timeout: vídeo não processou em 5 minutos');
  }
}