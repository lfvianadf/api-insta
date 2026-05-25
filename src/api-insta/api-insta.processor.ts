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

  private async handleMediaUpload(job: Job<any>) {
    const { postId, mediaUrl, caption, mimetype } = job.data;

    try {
      console.log(`[Worker] Finalizando post ${postId} com a URL: ${mediaUrl}`);

      await this.supabase.finalizePost(postId, mediaUrl);

      await this.uploadQueue.add('instagram-publish', {
        postId,
        mediaUrl,
        caption: caption || 'Essa matéria está disponível no Blog do Santana! Acompanhe em blogdosantana.com.br',
        mimetype,
      });

      return { success: true, url: mediaUrl };
    } catch (error: any) {
      console.error(`[Worker] Erro ao finalizar post ${postId}:`, error.message);
      throw error;
    }
  }

  private async refreshTokenAfterPublish(currentToken: string): Promise<void> {
    const appId = process.env.INSTA_APP_ID;
    const appSecret = process.env.INSTA_APP_SECRET;

    if (!appId || !appSecret) return;

    try {
      const debugResponse = await axios.get('https://graph.facebook.com/debug_token', {
        params: {
          input_token: currentToken,
          access_token: `${appId}|${appSecret}`,
        },
      });

      const { expires_at, is_valid } = debugResponse.data.data;

      if (!is_valid) {
        console.warn('[Instagram] Token inválido — não é possível renovar automaticamente.');
        return;
      }

      const daysUntilExpiry = (expires_at - Date.now() / 1000) / 86400;
      if (daysUntilExpiry < 15) {
        console.log(`[Instagram] Token expira em ${Math.floor(daysUntilExpiry)} dias. Renovando...`);

        const refreshResponse = await axios.get('https://graph.facebook.com/oauth/access_token', {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: currentToken,
          },
        });

        const newToken = refreshResponse.data.access_token;
        if (newToken) {
          process.env.INSTAGRAM_ACCESS_TOKEN = newToken;
          console.log('[Instagram] Token renovado. Atualize o .env com o novo valor:', newToken);
        }
      }
    } catch (err: any) {
      console.error('[Instagram] Erro ao tentar renovar token:', err.response?.data?.error?.message || err.message);
    }
  }

  private async handleInstagramPublish(job: Job<any>) {
    const { postId, mediaUrl, caption, mimetype } = job.data;

    console.log('[Instagram] Job recebido:', { postId, mediaUrl, caption, mimetype });

    const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igBusinessId || !accessToken) {
      throw new Error('Variáveis INSTAGRAM_BUSINESS_ID ou INSTAGRAM_ACCESS_TOKEN não configuradas');
    }

    console.log('[Instagram] Token (primeiros 20 chars):', accessToken?.substring(0, 20));
    console.log('[Instagram] Token length:', accessToken?.length);

    const isVideo = mimetype?.startsWith('video');

    console.log('[Instagram] Payload para criação do container:', {
      isVideo,
      mediaUrl,
      caption,
      media_type: isVideo ? 'REELS' : 'IMAGE',
    });

    try {
      const containerResponse = await axios.post(
        `https://graph.instagram.com/v25.0/${igBusinessId}/media`,
        {
          [isVideo ? 'video_url' : 'image_url']: mediaUrl,
          caption,
          media_type: isVideo ? 'REELS' : 'IMAGE',
          access_token: accessToken,
        },
      );

      const creationId = containerResponse.data.id;

      console.log('[Instagram] Container criado:', creationId);

      await this.waitForVideoReady(creationId, accessToken);

      const publishResponse = await axios.post(
        `https://graph.instagram.com/v25.0/${igBusinessId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken,
        },
      );

      const igId = publishResponse.data.id;

      console.log('[Instagram] Publicado com sucesso. igId:', igId);

      await this.supabase.updatePostIgStatus(postId, 'published', igId);

      await this.refreshTokenAfterPublish(accessToken);

      return { success: true, igId };
    } catch (error: any) {
      console.error('[Instagram] Erro completo:', JSON.stringify(error.response?.data, null, 2));
      console.error('[Instagram] Status HTTP:', error.response?.status);
      console.error('[Instagram] Mensagem:', error.message);

      const errorMsg = error.response?.data?.error?.message || error.message;
      await this.supabase.updatePostIgStatus(postId, 'failed', null);
      throw new Error(`Instagram Fail: ${errorMsg}`);
    }
  }

  private async waitForVideoReady(
    creationId: string,
    accessToken: string,
  ): Promise<void> {
    const maxAttempts = 20;
    const intervalMs = 15000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const statusResponse = await axios.get(
        `https://graph.instagram.com/v25.0/${creationId}`,
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
