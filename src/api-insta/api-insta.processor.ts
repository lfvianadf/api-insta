import { Processor, WorkerHost } from '@nestjs/bullmq';
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

  /**
   * Este método é o "Cérebro" que roda em background.
   * Ele extrai os dados que o Redis guardou e executa a lógica.
   */
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
}