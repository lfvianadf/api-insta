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
   * O vídeo já está no R2.
   * Apenas vinculamos a URL ao post no Supabase.
   */
  private async handleVideoUpload(job: Job<any>) {
    const { postId, mediaUrl, caption } = job.data;

    try {
      console.log(`[Worker] Finalizando post ${postId} com a URL: ${mediaUrl}`);

      // 1. Atualiza o Supabase com a URL definitiva que já existe no R2
      await this.supabase.finalizePost(postId, mediaUrl);

      // 2. Descomente quando quiser publicar no Instagram automaticamente
       await this.uploadQueue.add('instagram-publish', {
        postId,
        videoUrl: mediaUrl,
        caption: caption || 'Essa matéria está disponível no Blog do Santana! Acompanhe em blogdosantana.com.br'
      });

      return { success: true, url: mediaUrl };
    } catch (error) {
      console.error(`[Worker] Erro ao finalizar post ${postId}:`, error.message);
      throw error;
    }
  }

  private async handleInstagramPublish(job: Job<any>) {
    const { postId, videoUrl, caption } = job.data;

    // ✅ Melhoria 4: Validação das variáveis de ambiente antes de prosseguir
    const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igBusinessId || !accessToken) {
      throw new Error(
        'Variáveis INSTAGRAM_BUSINESS_ID ou INSTAGRAM_ACCESS_TOKEN não configuradas',
      );
    }

    try {
      // Passo 1: Criar o Container de Vídeo (Reels)
      // ✅ Melhoria 2: Padronizado para graph.instagram.com
      const containerResponse = await axios.post(
        `https://graph.instagram.com/v21.0/${igBusinessId}/media`,
        {
          video_url: videoUrl,
          caption,
          media_type: 'REELS',
          access_token: accessToken,
        },
      );

      const creationId = containerResponse.data.id;

      // Passo 2: Aguardar processamento com verificação de status
      // ✅ Melhoria 1: waitForVideoReady agora é método privado da classe
      await this.waitForVideoReady(creationId, accessToken);

      // Passo 3: Publicar
      const publishResponse = await axios.post(
        `https://graph.instagram.com/v21.0/${igBusinessId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken,
        },
      );

      const igId = publishResponse.data.id;

      // ✅ Melhoria 3: Atualiza Supabase com sucesso e igId
      await this.supabase.updatePostIgStatus(postId, 'published', igId);

      return { success: true, igId };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;

      // ✅ Melhoria 3: Registra falha no Supabase
      await this.supabase.updatePostIgStatus(postId, 'failed', null);

      throw new Error(`Instagram Fail: ${errorMsg}`);
    }
  }

  /**
   * ✅ Melhoria 1: Método privado separado (era função dentro do try/catch)
   * Verifica o status do container de mídia no Instagram até estar pronto.
   * Máximo de ~5 minutos (20 tentativas x 15s).
   */
  private async waitForVideoReady(
    creationId: string,
    accessToken: string,
  ): Promise<void> {
    const maxAttempts = 20;   // ~5 minutos no total
    const intervalMs = 15000; // verifica a cada 15 segundos

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

      if (status_code === 'FINISHED') return; // ✅ pronto para publicar
      if (status_code === 'ERROR')
        throw new Error('Meta falhou ao processar o vídeo');
      if (status_code === 'EXPIRED')
        throw new Error('Container expirou — recrie o upload');

      console.log(
        `[Worker] Tentativa ${attempt}/${maxAttempts} — status: ${status_code}`,
      );
      // status 'IN_PROGRESS' continua aguardando
    }

    throw new Error('Timeout: vídeo não processou em 5 minutos');
  }
}